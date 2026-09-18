# Phase 04.05 — Transactional Outbox Gap Analysis

**Status:** VERIFYING  
**Branch:** `agent/postgres-v1.7-core`  
**Starting SHA:** `5fa53e6cc6f02db06c03b52201b8141bb56ba384`

## Official contract

Architecture Baseline v1.7 and the Master Implementation Plan require:

- the Domain Event is inserted inside the original source/business transaction;
- a committed event survives process restart and remains available until processed;
- workers claim pending events with `FOR UPDATE SKIP LOCKED`;
- `retry_count` is managed for safe later retry;
- `processed_at` is written only after successful consumer work;
- workers may run in parallel without processing one logical event twice;
- consumers are idempotent;
- the approved hot-row access path is the frozen partial index on `(created_at, id) WHERE processed_at IS NULL`;
- deadlock/serialization retries remain limited by the existing transaction helper rather than blanket `SERIALIZABLE`.

## Gap classification

| Area | Current state | 04.05 action |
| --- | --- | --- |
| `outbox_events` table | موجود ومتوافق | reuse unchanged |
| retry_count CHECK | موجود ومتوافق | reuse unchanged |
| unprocessed partial index | موجود ومتوافق | reuse unchanged |
| source-transaction enqueue | غير موجود | implement producer service |
| SKIP LOCKED worker | غير موجود | implement |
| retry_count handling | schema موجود، behavior غير موجود | increment after consumer failure |
| processed_at discipline | schema موجود، behavior غير موجود | set only after successful consumer |
| restart persistence proof | غير مثبت | close/reopen PostgreSQL pool and process committed event |
| parallel worker proof | غير مثبت | two concurrent workers over 40 events |
| consumer idempotency identity | event id موجود | expose stable `event.id`; test consumer dedupes by it |

## Implementation decisions

1. No migration `0023` and no new index. Phase 03 already owns the physical Outbox schema, retry CHECK, PK, and frozen partial index.
2. `TransactionalOutboxService.enqueue(client, event)` accepts only an existing `PoolClient`, so an event is committed only with its source transaction.
3. `OutboxWorker` claims pending rows ordered by `created_at, id` using `FOR UPDATE SKIP LOCKED`, allowing parallel workers to take disjoint batches.
4. DB-backed consumers receive the same `PoolClient`; their logical effect and `processed_at` therefore commit atomically.
5. Each event is wrapped in a SAVEPOINT. A non-retryable consumer failure rolls back only that consumer attempt, increments `retry_count`, and leaves `processed_at = NULL` for a later worker pass.
6. PostgreSQL deadlock/serialization errors are rethrown to the existing transaction helper so its bounded 3-attempt retry policy remains authoritative.
7. Consumers receive stable `event.id` as their idempotency identity. A generic extra dedupe table is intentionally not introduced because it is not in the frozen V1 schema/index catalog; each consumer must enforce logical idempotency at its own durable boundary.
8. `processed_at` is server-generated only after the consumer returns successfully.
9. Payloads are JSON-compatible plain data and are validated before SQL.

## Executable evidence

- `server/tests/transactional-outbox.test.ts`: input/payload/batch validation.
- `server/tests/transactional-outbox.integration.test.mjs`: PostgreSQL 17 source rollback, committed-event restart survival, retry_count behavior, processed_at discipline, two-worker `SKIP LOCKED` concurrency over 40 events, stable event-id idempotency, and frozen index inventory.
- `.github/workflows/ci.yml`: explicit PostgreSQL 17 Transactional Outbox integration gate.

## Non-goals

- No 04.06 Error Mapping.
- No Notifications/Read Models domain consumer cutover.
- No module cutover, dual write, Convex Production change, or merge to `main`.

## Exit procedure

1. Full CI on the 04.05 implementation SHA.
2. If green, update the canonical Master Implementation Plan to `04.05 CLOSED`.
3. Full CI again on the final documentation SHA.
4. Close the validation-only PR without merge.
