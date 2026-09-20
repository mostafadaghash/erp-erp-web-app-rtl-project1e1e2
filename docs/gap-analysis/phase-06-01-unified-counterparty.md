# Phase 06.01 — Unified Counterparty Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

06.01 implements only the unified Counterparty backend contract:

- one canonical Counterparty identity.
- roles: `CUSTOMER / SUPPLIER / OTHER`.
- one Counterparty may hold multiple roles at the same time.
- optional Customer Profile.
- optional Supplier Profile.
- Account identity activation/deactivation without creating separate customer/supplier identities.
- role/profile mutations through one backend service.
- Audit for successful master-data mutations.

06.02 Phone Normalization and 06.03 Customer/Supplier Ledgers remain explicitly excluded.

## Baseline decisions

- the UI/business concept is one Account/Counterparty identity.
- the same identity may be Customer, Supplier, Other, or hold more than one role.
- Customer and Supplier profiles extend the same identity instead of duplicating it.
- Customer and Supplier Ledgers remain separate historical ledgers even when identity is shared; ledger work belongs to 06.03.
- `counterparties.normalized_phone` exists in the schema, but canonical phone calculation/search belongs to 06.02.
- `counterparty_roles(counterparty_id, role)` is uniquely constrained.
- role values are closed to `CUSTOMER / SUPPLIER / OTHER`.
- Customer Profile is valid only for a Counterparty carrying `CUSTOMER`.
- Supplier Profile is valid only for a Counterparty carrying `SUPPLIER`.
- profile rows are optional.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `counterparties` schema | موجود ومتوافق | reuse |
| `counterparty_roles` schema + PK | موجود ومتوافق | reuse |
| role CHECK CUSTOMER/SUPPLIER/OTHER | موجود ومتوافق | reuse |
| `customer_profiles` schema | موجود ومتوافق | reuse |
| `supplier_profiles` schema | موجود ومتوافق | reuse |
| frozen Counterparty indexes | موجود ومتوافق | no index change |
| Unified Counterparty backend service | غير موجود | create |
| dual Customer+Supplier identity command path | غير موجود | create |
| role add/idempotency path | غير موجود | create |
| role/profile coherence validation | غير موجود في Backend | create |
| Counterparty lifecycle active/inactive service | غير موجود | create |
| Phone normalization/search | 06.02 | do not implement |
| Customer/Supplier Ledger commands | 06.03 | do not implement |

## Database decision

No migration is required.

The approved schema already contains:

- `pk_counterparties`.
- `pk_counterparty_roles(counterparty_id, role)`.
- `ck_counterparty_roles__role`.
- `pk_customer_profiles`.
- `pk_supplier_profiles`.
- Counterparty/profile Foreign Keys.
- frozen indexes:
  - `ix_counterparties__normalized_phone`.
  - `gin_counterparties__name_trgm`.
  - `ix_counterparty_roles__role_counterparty_id`.

06.01 consumes those invariants and does not add speculative schema/index changes.

## Implementation

- add `CounterpartyService`.
- `create()` creates one identity with one or more roles in one transaction.
- optional Customer/Supplier profiles are created in the same transaction.
- a Customer Profile requires the `CUSTOMER` role.
- a Supplier Profile requires the `SUPPLIER` role.
- `addRole()` is idempotent while the DB PK remains the final duplicate-role defense.
- `upsertCustomerProfile()` and `upsertSupplierProfile()` update the profile attached to the same identity.
- `updateIdentity()` updates shared identity data only.
- when phone text changes in 06.01, stale `normalized_phone` is cleared to NULL; no normalization algorithm is introduced before 06.02.
- `setActive()` provides non-destructive Account lifecycle.
- successful mutations are Audit-recorded.
- public failures use stable `COUNTERPARTY_OPERATION_REJECTED` + safe reason.
- no HTTP/Frontend Counterparty cutover is introduced in this step because module cutover is Phase 14 and technical permission keys/default grants are not frozen here.

## Required tests

- one Counterparty can hold CUSTOMER and SUPPLIER simultaneously.
- one shared identity can have both optional profiles.
- direct duplicate role pair is rejected by the approved PK.
- concurrent repeated `addRole()` calls produce exactly one role pair.
- profile cannot be written without its corresponding role.
- CUSTOMER/SUPPLIER/OTHER can coexist on one identity.
- identity update does not split customer/supplier identity.
- active/inactive lifecycle preserves roles and profiles.
- `normalized_phone` remains uncomputed in 06.01.
- Customer/Supplier Ledger tables remain untouched by 06.01.
- Audit records successful master-data mutations.
- invalid actor failure leaves no new Counterparty.
- exact frozen Counterparty/Profile index inventory remains unchanged.
- migration verify-only proves no migration/index addition.
- Full CI passes on the same implementation SHA.

## Gate 06 progress

06.01 may complete these Gate 06 items:

- same account can be customer+supplier.
- no duplicate role pair.

The following remain open for their own official steps:

- normalized phone search tests → 06.02.
- ledger immutability tests → 06.03.
- branch scope tests → 06.03 / branch-scoped ledger operations as applicable.

## Explicit exclusions

- no 06.02 Phone Normalization.
- no phone matching/search algorithm.
- no 06.03 Ledger command implementation.
- no mutable customer/supplier balance.
- no Phase 07.
- no Frontend/Convex module cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no index.

## Closure evidence

- Verified implementation SHA: `0a89fba47d243bac5f47c38eb51439292ea4afb0`.
- Full CI: Run `#978` / `35483368078` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including the PostgreSQL 17 Unified Counterparty service gate.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- one Counterparty identity successfully carries CUSTOMER + SUPPLIER.
- Customer Profile + Supplier Profile coexist on the same identity.
- direct duplicate role pair is rejected by `pk_counterparty_roles`.
- eight concurrent repeated role additions produce exactly one role pair.
- profile/role coherence is enforced in Backend.
- CUSTOMER/SUPPLIER/OTHER coexist on one identity.
- identity active/inactive lifecycle preserves roles/profiles.
- `normalized_phone` remains uncomputed in 06.01.
- Customer/Supplier Ledger tables remain untouched by 06.01.
- successful mutations are Audit-recorded.
- invalid actor failure creates no Counterparty.
- frozen Counterparty/Profile index inventory remains unchanged.
- no migration added.
- no index added.
- no 06.02 or 06.03 behavior implemented.
- Validation PR: `#225`, validation-only, to be closed without merge after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 06.01 is CLOSED. The next official step is 06.02 Phone Normalization, READY_TO_START only.
