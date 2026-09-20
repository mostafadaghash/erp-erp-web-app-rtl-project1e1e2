# Phase 06.02 — Phone Normalization Gap Analysis

**Status:** `IN_PROGRESS`  
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

## Next action

Run Full CI on the 06.02 implementation SHA through a validation-only PR. Only after the same-SHA PostgreSQL 17 normalization/search gate and all regressions are green may 06.02 be documented as CLOSED.
