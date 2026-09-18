# Phase 04.01 — Idempotency Service Gap Analysis

**Status:** VERIFYING  
**Branch:** `agent/postgres-v1.7-core`  
**Starting SHA:** `4e0d22b7317af75641e8285725a520b846ef3359`

## Official contract

Architecture Baseline v1.7 and the Master Implementation Plan require:

- claim the idempotency key at the start of the same business transaction;
- compute a canonical request hash;
- same key + same payload returns the existing result/state and does not create another business result;
- same key + different payload is rejected;
- rollback/incomplete failure must not create phantom success;
- expired keys have a cleanup mechanism;
- V1 concurrency remains `READ COMMITTED + SELECT ... FOR UPDATE + Unique Constraints + Idempotency`;
- the frozen schema already owns `idempotency_keys`, `UNIQUE(key)`, and the approved `expires_at` index.

## Gap classification

| Area | Current state | 04.01 action |
| --- | --- | --- |
| `idempotency_keys` table | موجود ومتوافق | reuse unchanged |
| `UNIQUE(key)` | موجود ومتوافق | reuse unchanged |
| `expires_at` index | موجود ومتوافق | reuse unchanged |
| transaction helper | موجود ومتوافق | compose with existing READ COMMITTED/retry helper |
| canonical request hash | غير موجود | implement deterministic JSON canonicalization + SHA-256 |
| atomic claim/replay | غير موجود | implement transaction-bound service |
| payload mismatch rejection | غير موجود | implement typed conflict |
| rollback phantom-success protection | غير موجود | complete key only after business work inside same transaction |
| concurrent same-key protection | schema موجود، service غير موجود | PostgreSQL 17 parallel test |
| expiry cleanup | غير موجود | bounded `FOR UPDATE SKIP LOCKED` cleanup using approved expiry index |

## Implementation decisions

1. No migration `0023` and no new index: Phase 03 already contains the required physical schema and catalog.
2. The service owns the transaction boundary for an idempotent command. It claims before invoking business work and marks completion only after that work succeeds.
3. A concurrent same-key request waits on PostgreSQL uniqueness/row locking. After the first transaction commits it becomes a replay; after rollback another request can claim and execute.
4. Existing committed rows with `completed_at IS NULL` return `INCOMPLETE`; they are never treated as successful replay.
5. `result_reference` is the stable persisted reference future commands can use to reload their original result. The service does not serialize arbitrary business response objects into the infrastructure table.
6. Canonical payload hashing accepts JSON-compatible plain data only, sorts object keys recursively, preserves array order, and rejects ambiguous/non-JSON values.
7. Cleanup is bounded and lock-safe; it deletes only expired keys and skips rows locked by live work.

## Executable evidence

- `server/tests/idempotency-service.test.ts`: canonical hash determinism and invalid-payload rejection.
- `server/tests/idempotency-service.integration.test.mjs`: PostgreSQL 17 sequential replay, payload mismatch, eight-way parallel collision, rollback/retry, known incomplete state, cleanup batching, and migration verification.
- `.github/workflows/ci.yml`: explicit PostgreSQL 17 Idempotency Service integration gate.

## Non-goals

- No 04.02 Document Sequence Service.
- No 04.03 Posting Batch Service.
- No 04.04 Audit Service.
- No 04.05 Outbox worker.
- No 04.06 API error mapping.
- No module cutover, dual write, Convex Production change, or merge to `main`.

## Exit procedure

1. Full CI on the 04.01 implementation SHA.
2. If green, update the canonical Master Implementation Plan to `04.01 CLOSED`.
3. Full CI again on the final documentation SHA.
4. Close the validation-only PR without merge.
