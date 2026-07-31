# Orders Operational Coverage Matrix

| ID | Scenario | Evidence | Status |
|---|---|---|---|
| ORD-01 | Pending edit recalculates totals server-side | `orders.update` + DB assertions | EXECUTABLE |
| ORD-02 | Confirmed order remains editable before linkage | `orders.update` | EXECUTABLE |
| ORD-03 | Ready order body is locked | rejection + rollback snapshot | EXECUTABLE |
| ORD-04 | Total cannot fall below recorded deposit | rejection + rollback snapshot | EXECUTABLE |
| ORD-05 | Customer cannot change after deposit | rejection | EXECUTABLE |
| ORD-06 | `edit_orders` cannot cancel through status mutation | rejection | EXECUTABLE |
| ORD-07 | User without `delete_orders` cannot cancel | permission rejection | EXECUTABLE |
| ORD-08 | Outstanding deposit blocks cancellation | rejection | EXECUTABLE |
| ORD-09 | Invoice linkage locks edit/cancel | rejection | EXECUTABLE |
| ORD-10 | Details read model exposes invoice/delivery linkage | query assertions | EXECUTABLE |
| ORD-11 | Order details preserve branch isolation | cross-branch rejection | EXECUTABLE |
| ORD-12 | Successful cancellation persists reason and audit evidence | DB + audit assertions | EXECUTABLE |

## UI contracts

The UI regression suite covers real edit wiring, lifecycle-gated edit actions, server-owned total calculation, safe cancellation modal, permission alignment, delivery-owned final delivery, linked details/timeline, financial history, post-link financial locks, stable request IDs, busy guards, customer locking after deposit, real Convex errors, and unsafe TypeScript escape prevention.

## Deferred performance slice

Order list/statistics still use broad `collect()` paths. Cursor pagination and branch/date aggregate indexes are intentionally tracked as the next performance slice rather than weakening this lifecycle/financial-integrity round with an unreviewed schema migration.
