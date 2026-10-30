# Phase 04.02 — Document Sequence Service Gap Analysis

**Status:** CLOSED  
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

## Validation evidence

- Initial implementation SHA: `6d97aef86789ca6a69b458a97942141de007c565`.
- Diagnostic CI: Run `#948` / `35380206600` — the service generated the correct unique `1..32` set, but a persisted-result assertion ordered a text alias lexicographically (`1,10,...,2`). This was a test-only defect.
- Verified implementation SHA after numeric assertion fix: `eb1c02035bd1dc91e7045e3d6ed08e23b9342acd`.
- Full implementation CI: Run `#949` / `35380340039` — SUCCESS.
- PostgreSQL 17 Document Sequence Service integration: SUCCESS.
- 32 concurrent workers on one branch/type: exactly `1..32`, no duplicate number.
- independent branch/type scopes: SUCCESS.
- late allocation after prior row lock: SUCCESS.
- rollback proof: no sequence row and no business row leak; retry starts safely at the uncommitted number.
- committed deletion/tombstone proof: next number is greater and the committed number is not reused.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- Validation PR: `#214` — validation-only; do not merge.
- Final documentation closure SHA must pass Full CI before PR #214 is closed.

## Next action

After final same-SHA closure validation succeeds: `PHASE 04 / 04.03 Posting Batch Service` only.
