# ADR-0007 — Phase 03.B Counterparties Schema Shape

- Status: Accepted
- Phase: 03.05 / 03.B — Counterparties
- Architecture authority: Business Tech ERP Architecture Baseline v1.7
- Implementation plan authority: Business Tech ERP Master Implementation Plan v1.0

## Context

Phase 03.05 builds the PostgreSQL schema in dependency order. After 03.A Infrastructure / Organization / Security, the approved next domain is Counterparties. Architecture Baseline v1.7 §25.6 defines one unified commercial-party identity with role-specific customer/supplier profiles and separate historical customer/supplier ledgers.

The Master Implementation Plan intentionally places the complete constraint pass in 03.06 and the closed Index Catalog implementation in 03.07. Therefore 03.B creates only the canonical relations, columns, scalar types and nullability required by the approved model.

## Decision

Migration `0003_counterparties` creates exactly these six canonical relations:

- `counterparties`
- `counterparty_roles`
- `customer_profiles`
- `supplier_profiles`
- `customer_ledger_entries`
- `supplier_ledger_entries`

### Unified identity

`counterparties` is the only commercial-party identity relation. A party can later carry CUSTOMER, SUPPLIER and/or OTHER roles without duplicating the base identity. The legacy idea of separate customer/supplier identity tables is not reproduced in PostgreSQL.

`phone` preserves the entered/display value. `normalized_phone` stores the canonical search/matching value defined by v1.7; normalization behavior is implemented later by the Counterparties service, not by this DDL step.

### Profiles

`customer_profiles` and `supplier_profiles` contain only role-specific data. They do not duplicate name, phone, address or the common identity.

`customer_profiles.credit_limit` uses `numeric(18,4)` and remains nullable because v1.7 defines the credit limit as optional. `default_price_list_id` remains nullable and unconstrained in 03.B because Product Catalog / Price Lists are created in 03.C and final referential constraints are applied in 03.06.

### Historical ledgers

`customer_ledger_entries` and `supplier_ledger_entries` remain separate historical ledgers even when the same counterparty has both roles. They use:

- UUID internal identity and references;
- `numeric(18,4)` for `amount`;
- `timestamptz` for `occurred_at`;
- `posting_batch_id` to connect the entry to the unified posting/reversal trace established by v1.7.

No mutable `customer.balance` or `supplier.balance` column is introduced. Balance truth remains historical ledger-based as required by the architecture.

## Nullability decisions

The baseline defines the fields but not PostgreSQL nullability for every descriptive attribute. Consistent with ADR-0006:

- identity, ownership/reference, discriminator, monetary ledger amount and historical timing fields are `NOT NULL`;
- `counterparties.phone`, `normalized_phone`, `address`, `notes` are nullable descriptive/contact fields;
- `customer_profiles.default_price_list_id` and `credit_limit` are optional;
- `supplier_profiles.notes` is optional.

No default values are invented in DDL.

## Deferred integrity and indexes

03.B deliberately does not create project-owned PK/FK/UNIQUE/CHECK constraints. Those remain 03.06 work, including:

- counterparty role uniqueness;
- one customer/supplier profile per counterparty;
- role/domain referential integrity;
- branch/user/posting-batch references;
- credit/amount semantic checks if required by the approved catalog.

03.B creates no project-owned indexes. The exact v1.7 Index Catalog remains 03.07 work, including normalized-phone lookup, trigram name search and role/profile indexes where approved.

## Verification contract

PostgreSQL 17 integration tests must prove that:

- migrations `0001` through `0003` apply in order;
- all six 03.B relations exist with exact canonical columns, PostgreSQL types and nullability;
- `amount` and `credit_limit` are `numeric(18,4)`;
- customer and supplier ledgers remain separate relations;
- no 03.C relation such as `product_categories` exists;
- no project-owned constraints or indexes have been introduced on 03.B relations;
- rerun and verify-only behavior remains correct;
- migration `0003` is recorded with immutable checksum.

## Recovery

Migration `0003` is transactional. Any failure before commit rolls back all six relations and the migration-history insert. After successful application, corrections are forward-only migrations; direct ad-hoc edits are prohibited.

## Non-goals

This step does not:

- implement Counterparties services, normalization logic or ledger posting behavior;
- implement 03.C Product Catalog;
- implement 03.06 constraints or 03.07 indexes;
- seed business data;
- cut over frontend/backend modules;
- dual-write with Convex;
- modify `main` or Convex Production.
