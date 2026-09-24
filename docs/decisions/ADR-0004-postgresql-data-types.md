# ADR-0004 — PostgreSQL Data Types Baseline

- Status: Accepted
- Phase: 03.03 — Data Types
- Architecture authority: Business Tech ERP Architecture Baseline v1.7
- Implementation plan authority: Business Tech ERP Master Implementation Plan v1.0

## Context

Architecture Baseline v1.7 fixes the cross-cutting PostgreSQL scalar rules for the new Core:

- money uses `numeric(18,4)`;
- quantity uses `numeric(18,6)`;
- time instants use UTC/`timestamptz` and are displayed in the company/user timezone;
- floating-point types are not used for money or inventory quantities/cost state;
- JSON is limited to configuration/payload-style fields and must not contain Business Entities or mutable balance truth.

The Master Implementation Plan 03.03 repeats the same rules and requires this decision to be closed before Migration Structure and permanent Business DDL begin.

The source documents constrain where JSON may be used but do not explicitly choose PostgreSQL `json` versus `jsonb`. A physical schema needs one deterministic representation, so this ADR records that implementation choice explicitly rather than introducing it silently.

## Decision

1. Monetary columns use PostgreSQL `numeric(18,4)`.
2. Quantity columns use PostgreSQL `numeric(18,6)`.
3. Business timestamps that represent an instant in time use PostgreSQL `timestamptz`; backend-generated instants are UTC-canonical and presentation converts them to the configured company/user timezone.
4. PostgreSQL `real`, `double precision`, and other floating-point representations are prohibited for money, price, cost, tax, balance, inventory quantity, reservation quantity, and other financially/inventory-significant values.
5. JSON-bearing columns are permitted only where Architecture Baseline v1.7 models configuration, audit snapshots, event payloads, notification/message parameters, or template configuration. Business Entities, stock/balance truth, ledger truth, document lines, and mutable financial/inventory positions must remain relational columns/rows.
6. Implementation choice: permitted JSON-bearing PostgreSQL columns use `jsonb`. This chooses only the physical JSON representation; it does not broaden the allowed JSON use cases.
7. `jsonb` does not imply an automatic GIN index. Indexes remain governed exclusively by the closed v1.7 Index Catalog.
8. Monetary/quantity values crossing the Node.js boundary must not be coerced through JavaScript floating-point arithmetic as authoritative persistence values. PostgreSQL `numeric` values are treated as exact decimal values; parsing/calculation policy for domain commands will be implemented and tested with the relevant modules.
9. Permanent schema application remains deferred to Phase 03.04/03.05. Phase 03.03 may use temporary PostgreSQL objects in CI only to verify supported physical types and precision semantics.

## CI Contract

On the supported PostgreSQL 17 image, CI must prove that a temporary probe can use:

- `numeric(18,4)` for money;
- `numeric(18,6)` for quantity;
- `timestamptz` for instants;
- `jsonb` for an allowed configuration/payload probe;
- exact decimal round-trip at the declared scales;
- timezone-offset equivalence for the same instant;
- no permanent relation remains after the probe transaction commits.

## Non-goals

This decision does not:

- create permanent migrations or the migration runner (03.04);
- create Business tables, indexes, views, constraints, or seed data (03.05);
- define every domain column in advance;
- add indexes for `jsonb`;
- change accounting, inventory, costing, VAT, or posting behavior;
- perform module cutover, dual write, `main` merge, or Convex Production changes.

## Consequences

- Monetary and inventory arithmetic has an exact PostgreSQL storage contract before physical Business DDL starts.
- Time-bearing business effects have one canonical instant representation.
- JSON remains an explicitly bounded implementation mechanism rather than an escape hatch for relational modeling.
- Later migrations have a deterministic type contract and can be tested against it.
