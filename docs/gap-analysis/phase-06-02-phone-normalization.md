# Phase 06.02 — Phone Normalization Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

06.02 implements only Counterparty phone normalization/search:

- preserve the human-facing phone value in `counterparties.phone`.
- calculate/store a canonical value in `counterparties.normalized_phone`.
- normalize phone search input with the same deterministic algorithm.
- execute phone search through exact equality on `normalized_phone`.
- reuse the approved `ix_counterparties__normalized_phone` index.

06.03 Customer/Supplier Ledgers remains explicitly excluded.

## Official baseline

The Architecture Baseline freezes these requirements:

- `counterparties` stores both `phone` and `normalized_phone`.
- `normalized_phone` is the canonical phone form used for search/matching while preserving display form.
- V1 phone search uses `normalized_phone` inside PostgreSQL.
- the frozen Index Catalog already includes `ix_counterparties__normalized_phone`.

The official sources do **not** define:

- a default country/calling code.
- an Egypt-only conversion rule.
- an E.164 dependency/library.
- a rule that rewrites local `010...` into `2010...`.
- phone uniqueness.

Therefore 06.02 must not invent country-specific semantics.

## Final implementation-level canonicalization rule

The following rule is deliberately country-neutral and deterministic:

1. trim outer whitespace for the display value; preserve all internal display formatting.
2. map ASCII digits `0-9`, Arabic-Indic digits `٠-٩`, and Extended Arabic-Indic digits `۰-۹` to ASCII digits.
3. remove supported display-only formatting characters:
   whitespace, common dashes, parentheses/brackets, dot, and slash.
4. leading `+` means international notation and is omitted from the stored canonical digits.
5. leading `00` is treated as an equivalent international prefix and is removed.
6. local numbers keep their leading zeroes exactly; no country code is inferred.
7. non-empty phone input must contain at least one digit.
8. unsupported non-formatting characters are rejected rather than silently discarded.
9. `normalized_phone` remains non-unique; multiple Counterparties may share the same canonical phone.
10. search normalizes the query with exactly the same function and compares by `normalized_phone = $1`.

Examples:

- `+20 100 123 4567` → `201001234567`.
- `0020-100-123-4567` → `201001234567`.
- `٠١٠٠ ١٢٣ ٤٥٦٧` → `01001234567`.
- `0100 123 4567` → `01001234567`, not `201001234567`.

This is an implementation detail under the baseline's canonical-phone requirement. Any future country-aware equivalence rule requires an explicit approved product/architecture decision rather than silent behavior change.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `counterparties.phone` | موجود ومتوافق | preserve display |
| `counterparties.normalized_phone` | موجود ومتوافق | populate |
| `ix_counterparties__normalized_phone` | موجود ومتوافق | frozen; reuse |
| 06.01 create/update service | موجود ويحتاج تعديل | write canonical phone |
| phone normalization utility | غير موجود | create |
| search by normalized phone | غير موجود | create |
| Arabic-Indic digit support | غير موجود | create |
| country-code inference | غير معتمد | do not implement |
| phone uniqueness | غير معتمد | do not implement |
| 06.03 Ledgers | خارج النطاق | do not implement |

## Database decision

No migration is required.

The physical schema and approved index already exist. 06.02 changes Backend behavior only.

No unique index is added because the official architecture does not state that a phone uniquely identifies a Counterparty.

## Implementation

- add `phone-normalization.ts` with one pure deterministic `normalizePhone()` function.
- update `CounterpartyService.create()` to persist display + canonical phone together.
- update `CounterpartyService.updateIdentity()` to recompute canonical phone atomically whenever the display phone changes.
- add `CounterpartyService.searchByPhone()`.
- use equality on `normalized_phone`, matching the approved B-Tree index contract.
- return all matching Counterparties because canonical phone is not unique.
- preserve 06.01 identity/role/profile behavior unchanged.
- no HTTP/Frontend cutover.
- no data-migration job is introduced here; production/import data migration remains Phase 15.

## Required tests

- display phone is preserved while canonical value is stored.
- outer whitespace is trimmed only from display value.
- Arabic-Indic digits normalize to ASCII.
- Extended Arabic-Indic digits normalize to ASCII.
- `+` and `00` international prefixes normalize equivalently.
- local numbers retain their local leading zeroes.
- no country code is inferred.
- unsupported characters fail validation.
- blank phone remains NULL / NULL.
- create stores `phone` + `normalized_phone`.
- update recomputes `normalized_phone`.
- old canonical value stops matching after update.
- search normalizes query input and uses canonical equality.
- duplicate canonical phone values are allowed and all matches are returned.
- existing 06.01 dual-role behavior remains green.
- exact frozen Counterparty index inventory remains unchanged.
- migration verify-only proves no migration/index addition.
- Full CI passes on the same implementation SHA.

## Gate 06 progress

06.02 may close:

- normalized phone search tests.

The remaining Gate 06 items after 06.02 are:

- ledger immutability tests → 06.03.
- branch scope tests → 06.03 branch-scoped ledger operations.

## Explicit exclusions

- no 06.03 Customer/Supplier Ledger commands.
- no balance calculation/projection.
- no country-specific phone plan.
- no E.164 dependency.
- no phone uniqueness rule.
- no Phase 07.
- no Frontend/Convex module cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no index.

## Closure evidence

- Verified implementation SHA: `394afe351117571ebdf22113de9424de4c55f38c`.
- Full CI: Run `#981` / `35484080467` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including PostgreSQL 17 Phone Normalization integration.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- display phone preservation verified.
- ASCII / Arabic-Indic / Extended Arabic-Indic normalization verified.
- leading `+` and leading `00` equivalence verified.
- local leading-zero preservation and no country-code inference verified.
- create/update canonical storage verified.
- old canonical value stops matching after phone update.
- normalized search returns all matching Counterparties.
- duplicate canonical phone values remain allowed.
- existing 06.01 Unified Counterparty regressions remain green.
- frozen `ix_counterparties__normalized_phone` inventory remains unchanged.
- no migration added.
- no index added.
- no 06.03 ledger behavior implemented.
- Validation PR: `#226`, validation-only, to be closed without merge after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 06.02 is CLOSED. The next official step is 06.03 Customer/Supplier Ledgers, READY_TO_START only.
