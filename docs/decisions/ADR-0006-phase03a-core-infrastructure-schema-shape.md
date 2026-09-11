# ADR-0006 — Phase 03.A Core Infrastructure Schema Shape

- Status: Accepted
- Phase: 03.05 / 03.A — Infrastructure / Organization / Security
- Architecture authority: Business Tech ERP Architecture Baseline v1.7
- Implementation plan authority: Business Tech ERP Master Implementation Plan v1.0

## Context

Phase 03.05 begins permanent Business PostgreSQL schema creation. The approved build order requires Infrastructure / Organization / Security before Counterparties. The same Master Implementation Plan intentionally places the complete constraint pass in 03.06 and the closed Index Catalog implementation in 03.07, after the schema-build catalog has been created in dependency order.

Architecture Baseline v1.7 §25.4–§25.5 defines the canonical 03.A relations and fields. §26 defines the later referential/relational safety constraints, while §28 defines the exact final index catalog.

Some 03.A columns intentionally reference domains that are created later, for example `branch_settings.default_price_list_id` and print-template defaults. Creating their final foreign keys during 03.A would violate the approved build order because the target relations do not yet exist.

## Decision

1. Migration `0002_core_infrastructure_organization_security` creates the nineteen canonical 03.A relations only:
   - `companies`
   - `company_phones`
   - `company_settings`
   - `branches`
   - `branch_settings`
   - `warehouses`
   - `users`
   - `auth_sessions`
   - `roles`
   - `permissions`
   - `role_permissions`
   - `user_permission_overrides`
   - `user_branch_access`
   - `document_sequences`
   - `idempotency_keys`
   - `posting_batches`
   - `audit_logs`
   - `outbox_events`
   - `document_tombstones`
2. Relation and column names follow ADR-0002 canonical snake_case naming.
3. UUID is used for canonical internal entity identifiers and UUID-shaped references.
4. `timestamptz` is used for instants and `jsonb` only for the configuration/payload/audit snapshot fields already approved by v1.7 and ADR-0004.
5. Textual names, codes, keys, hashes and discriminator values use `text` at this stage. `auth_sessions.ip_address` uses PostgreSQL `inet` because it is explicitly an IP-address field, not an opaque free-form business string.
6. Sequential business document counters/numbers use `bigint`; bounded operational counters/version fields use `integer`.
7. Required structural fields are created `NOT NULL`; architecture-defined optional/descriptive/default references remain nullable. No default values are invented in DDL; backend/application services will supply values according to their later domain policies.
8. 03.A does **not** create project-owned PK/FK/UNIQUE/CHECK/generated/deferred constraints. Those belong to 03.06, including composite context protection and referential actions.
9. 03.A creates **no project-owned index**. The exact v1.7 Index Catalog belongs to 03.07.
10. No role/permission/user/company seed data is inserted in 03.A. Authentication/authorization behavior and default role catalogs remain Phase 05 work.
11. No 03.B or later business-domain relation is created.

## Nullability decisions

The baseline lists fields but does not spell out PostgreSQL nullability for every descriptive column. The physical implementation therefore keeps optional descriptive values nullable while making identity, ownership, discriminator, status/flag, timestamp and required operational fields non-null.

Notable nullable fields include:

- optional company legal/display metadata (`short_name`, `legal_name`, registration/tax/address/logo);
- cross-domain branch defaults until configured;
- optional user email and last-login timestamp;
- optional auth-session device/IP/revocation metadata;
- idempotency completion/result fields before completion;
- optional audit branch/user/reason/snapshot context;
- outbox `processed_at` before processing;
- `posting_batches.reverses_posting_batch_id` for non-reversal postings.

`users.default_branch_id` remains required because v1.7 states that a user's default branch is mandatory and must later be constrained to effective branch access.

## Verification contract

PostgreSQL 17 integration tests must prove on a fresh database that:

- migrations `0001` and `0002` apply in order;
- all nineteen 03.A relations exist;
- every 03.A column has the expected canonical order, PostgreSQL type and nullability;
- no 03.B relation such as `counterparties` exists;
- no project-owned 03.A `pg_constraint` rows exist yet, proving 03.06 was not started;
- no project-owned indexes exist on the 03.A relations yet, proving 03.07 was not started;
- rerunning migrations is idempotent and verify-only mode passes;
- the migration is recorded in `schema_migrations` with its immutable checksum.

## Recovery

Migration `0002` is transactional. Any application or verification failure before commit rolls back every relation created by the migration and does not record the migration as successful. After successful application, corrections are forward-only migrations; direct ad-hoc edits are prohibited.

## Non-goals

This step does not:

- implement 03.B Counterparties;
- implement the 03.06 constraint catalog;
- implement the 03.07 index catalog;
- seed roles/permissions or implement authentication services;
- implement sequence/idempotency/outbox services;
- cut over any frontend/backend module;
- dual-write with Convex;
- modify `main` or Convex Production.
