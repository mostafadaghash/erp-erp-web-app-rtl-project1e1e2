# Orders Stats Coverage Matrix

| ID | Type | Coverage |
|---|---|---|
| OST-01 | Executable | Uninitialized state is explicit; no guessed production totals. |
| OST-02 | Executable | Cursor backfill preserves global, branch, cancelled and legacy-unassigned semantics. |
| OST-03 | Executable | Atomic deltas preserve count, value, remaining balance, status and branch movement. |
| OST-04 | Executable | Durable cursor, generation isolation, mismatch rejection and write freeze during rebuild. |
| OST-G01 | Guard | `orders.stats` cannot regress to an Orders `.collect()` full scan. |
| OST-G02 | Guard | Create, edit, status, collection, refund and cancellation paths update aggregates. |
| OST-G03 | Guard | Delivery confirmation/reversal and legacy branch assignment update aggregates. |
| OST-G04 | Guard | Rebuild remains paginated and generation-isolated. |
