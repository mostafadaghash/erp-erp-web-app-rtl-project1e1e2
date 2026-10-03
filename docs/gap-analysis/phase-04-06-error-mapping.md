# Phase 04.06 — Error Mapping Gap Analysis

**Status:** CLOSED  
**Branch:** `agent/postgres-v1.7-core`  
**Starting SHA:** `0b9cbb70511e9df3a08bbb0311452bded0e7d7e6`

## Official contract

Architecture Baseline v1.7 defines the public Error Contract as:

- stable `errorCode`;
- safe params only;
- UI translates the reason in Arabic/English;
- no Stack Trace is exposed.

The Master Implementation Plan requires PostgreSQL/business errors to be mapped to stable `errorCode` values without leaking SQL or secrets.

## Gap classification

| Area | Current state | 04.06 action |
| --- | --- | --- |
| stable public Error Contract | غير موجود مركزيًا | implement |
| Idempotency business error | موجود | map explicit safe reason only |
| Posting Batch business error | موجود | map explicit safe reason only |
| Type/Range validation errors | موجودة | map to `INVALID_ARGUMENT` |
| PostgreSQL `23505/23503/23514/23502` | raw driver errors | map safely |
| PostgreSQL `22P02/22001/22003` | raw driver errors | map safely |
| deadlock/serialization `40P01/40001` | retry helper knows them internally | expose stable codes after retries exhaust |
| unknown errors | may contain internals | collapse to `INTERNAL_ERROR` |
| leakage proof | غير مثبت | unit + PostgreSQL 17 integration |

## Implementation decisions

1. No migration `0023` and no new index.
2. Public output contains exactly `errorCode` and `params`.
3. Known Business errors expose only enum-like `reason`; idempotency keys and posting reference IDs are never public.
4. PostgreSQL message/detail/hint/query/table/column/constraint/stack are never copied.
5. Unknown errors map to `INTERNAL_ERROR` with empty params.
6. TypeError/RangeError map to `INVALID_ARGUMENT` without their message.
7. Deadlock/serialization use stable public codes while the existing bounded retry helper remains authoritative.
8. UI localization stays outside this infrastructure layer.

## Stable infrastructure codes

- `IDEMPOTENCY_KEY_CONFLICT`
- `POSTING_BATCH_REFERENCE_ERROR`
- `INVALID_ARGUMENT`
- `DB_UNIQUE_CONFLICT`
- `DB_REFERENCE_CONFLICT`
- `DB_CHECK_VIOLATION`
- `DB_REQUIRED_VALUE_MISSING`
- `DB_INVALID_INPUT`
- `CONCURRENCY_DEADLOCK`
- `CONCURRENCY_SERIALIZATION`
- `INTERNAL_ERROR`

## Executable evidence

- `server/tests/error-mapper.test.ts`
- `server/tests/error-mapper.integration.test.mjs`
- explicit PostgreSQL 17 Error Mapping CI gate.

## Non-goals

- No Phase 05 Authentication/Authorization implementation.
- No module-specific error catalog.
- No frontend localization/cutover.
- No module cutover, dual write, Convex Production change, or merge to `main`.

## Validation evidence

- Implementation SHA: `40e86d4e2937c9d9f2db3b3ebdcec50b8da9a048`.
- Full implementation CI: Run `#957` / `35395761123` — SUCCESS.
- Unit redaction/business mapping tests: SUCCESS.
- PostgreSQL 17 Error Mapping integration: SUCCESS.
- Real unique/FK/CHECK/NOT NULL/invalid-UUID driver failures mapped to stable public codes: SUCCESS.
- Raw SQL/constraint/schema/runtime details excluded from public contract: SUCCESS.
- deadlock/serialization stable code mapping: SUCCESS.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- Validation PR: `#218` — validation-only; do not merge.
- Final documentation closure SHA must pass Full CI before PR #218 is closed.

## Next action

After final same-SHA closure validation succeeds: `PHASE 05 / 05.01 Authentication` only.
