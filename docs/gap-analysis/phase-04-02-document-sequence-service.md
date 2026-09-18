# Phase 04.02 — Document Sequence Service Gap Analysis

**Status:** VERIFYING  
**Branch:** `agent/postgres-v1.7-core`  
**Starting SHA:** `fbdf02053f905178c209dedb293cd5d8eafe321f`

## Official contract

Architecture Baseline v1.7 and the Master Implementation Plan require:

- visible document numbers are numeric only;
- one independent sequence per `branch_id + document_type`;
- allocation happens inside the same business transaction;
- allocation happens late, after validation and required business/dependent/position locks;
- sequence allocation is atomic via row lock or `UPDATE/UPSERT ... RETURNING`;
- concurrent workers cannot receive the same number;
- committed numbers are not reused after operational deletion;
- Sequence Row remains at the end of the approved lock order.

## Gap classification

| Area | Current state | 04.02 action |
| --- | --- | --- |
| `document_sequences` table | موجود ومتوافق | reuse unchanged |
| `UNIQUE(branch_id, document_type)` | موجود ومتوافق | reuse unchanged |
| nonnegative DB check | موجود ومتوافق | reuse unchanged |
| sequence allocation service | غير موجود | implement |
| same-business-transaction enforcement | غير موجود | service accepts an existing `PoolClient`, not a pool |
| late allocation contract | غير موجود | explicit service contract + integration proof after prior row lock |
| atomic increment/return | غير موجود | `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` |
| many-worker concurrency proof | غير موجود | PostgreSQL 17 32-worker integration gate |
| rollback allocation safety | غير موجود | prove failed transaction leaves no sequence/business row |
| no reuse after committed deletion | schema foundations موجودة | prove monotonic next number after tombstone |

## Implementation decisions

1. No migration `0023` and no new index. The Phase 03 physical schema already contains the canonical sequence table and uniqueness rule.
2. `DocumentSequenceService.allocate(client, scope)` requires a caller-owned PostgreSQL transaction. The service cannot start an independent transaction, which prevents accidental allocation outside the business transaction.
3. Callers must invoke allocation late, after the command's validation and required locks. This follows the global lock order where Sequence Row is last.
4. Allocation uses one PostgreSQL UPSERT statement and `RETURNING`; PostgreSQL serializes concurrent updates to the same branch/type row.
5. A transaction rollback rolls back the sequence increment too. An uncommitted number may therefore be allocated again; this is correct because no committed business document ever owned it.
6. After a committed document number exists, later deletion/reversal/tombstoning does not decrement the sequence. The next allocation remains strictly greater.
7. The service returns a `bigint`, preserving PostgreSQL `bigint` precision and avoiding prefixed visible identifiers.

## Executable evidence

- `server/tests/document-sequence-service.test.ts`: invalid scope rejected before SQL.
- `server/tests/document-sequence-service.integration.test.mjs`: PostgreSQL 17 scope separation, late allocation, rollback atomicity, 32-worker contention, persisted uniqueness, and no reuse after deletion.
- `.github/workflows/ci.yml`: explicit PostgreSQL 17 Document Sequence Service integration gate.

## Non-goals

- No 04.03 Posting Batch Service.
- No 04.04 Audit Service.
- No 04.05 Transactional Outbox worker.
- No 04.06 Error Mapping.
- No module cutover, dual write, Convex Production change, or merge to `main`.

## Exit procedure

1. Full CI on the 04.02 implementation SHA.
2. If green, update the canonical Master Implementation Plan to `04.02 CLOSED`.
3. Full CI again on the final documentation SHA.
4. Close the validation-only PR without merge.
