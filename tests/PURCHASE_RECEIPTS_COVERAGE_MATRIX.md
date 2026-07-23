# Purchase receipts acceptance coverage (PUR-01–PUR-40)

All rows execute through `convex-test`; test names below exactly match `tests/purchaseReceiptsIntegration.test.ts`.

| ID | Prepared data | Mutation / query | Confirmed database effects | Actual test name |
|---|---|---|---|---|
| PUR-01 | In-transit two-line shipment | `shipments.receive` | Numbered receipt, stock movements, ledger, balance and links | PUR-01 posts numbered receipt, stock, ledger, balance and links atomically |
| PUR-02 | One shipment and stable request id | `shipments.receive` twice, then new id | One receipt/ledger; changed request rejected | PUR-02 retry returns one receipt and a different request is rejected |
| PUR-03 | Two weighted lines and external freight | `shipments.receive` | Freight sums exactly; last eligible line receives remainder | PUR-03 landed freight is fully allocated with remainder on last eligible line |
| PUR-04 | Freight entirely supplier-payable | `shipments.receive` | Payable and landed totals include freight | PUR-04 full supplier freight increases payable while external freight only increases inventory |
| PUR-05 | Legacy supplier balance 77 | `shipments.receive` | Ledger snapshots 0→54; legacy balance unchanged | PUR-05 ledger snapshots balances and does not alter legacy supplier balance |
| PUR-06 | Disabled supplier | `shipments.receive` | Entire pre/post DB state identical | PUR-06 disabled supplier rolls every write back |
| PUR-07 | Shipment without supplier | `shipments.receive` | Entire pre/post DB state identical | PUR-07 missing supplier rolls every write back |
| PUR-08 | Product belonging to another branch | `shipments.receive` | Entire pre/post DB state identical | PUR-08 cross-branch product rolls every write back |
| PUR-09 | Invalid/cutover dates and duplicate invoice | `shipments.receive` | Invalid requests and same-supplier invoice rejected | PUR-09 validates cutover, date, due date and duplicate supplier invoice |
| PUR-10 | User lacking posting permission | `receive`, `updateStatus` | Neither route can mark arrived/create receipt | PUR-10 permissions and updateStatus cannot bypass receipt posting |
| PUR-11 | Supplier with legacy balance | `suppliers.list` | DTO has no `balance` | PUR-11 supplier list redacts legacy balance |
| PUR-12 | Legacy arrived shipment | `suppliers.legacyReview` | Identified without ledger creation | PUR-12 legacy review identifies unposted arrivals without migrating |
| PUR-13 | Quantity 3, goods 30, freight 1 | `shipments.receive` | Receipt/movement/product all add exactly 31; unit cost 10.3333 | PUR-13 exact 31.00 receipt value is posted for three units |
| PUR-14 | Three equal-value lines (1.00 each) and freight 1.00 | `shipments.receive` | Allocations are 0.33/0.33/0.34; allocated freight, item values, and movement deltas reconcile exactly, with remainder on the final line | PUR-14 fractional freight allocation reconciles 0.33 0.33 0.34 on the last line |
| PUR-15 | Normal two-line receipt | `shipments.receive` | Sum movement deltas equals landed total | PUR-15 receipt movements sum exactly to landed total |
| PUR-16 | Normal two-line receipt | `shipments.receive` | Each after-before equals exact delta | PUR-16 every movement before/after chain equals its exact delta |
| PUR-17 | Shipment with zero freight | `shipments.receive` | Goods, landed and movements all equal 50 | PUR-17 receipt without freight posts goods value only |
| PUR-18 | Freight entirely external | `shipments.receive` | Inventory 60; payable/balance 50 | PUR-18 external freight increases inventory but not supplier payable |
| PUR-19 | Freight entirely supplier-payable | `shipments.receive` | Inventory/payable/balance all 60 | PUR-19 supplier freight increases inventory and supplier payable |
| PUR-20 | Posted receipt | same `shipments.receive` retry | Full DB snapshot unchanged | PUR-20 idempotent retry duplicates neither stock nor documents |
| PUR-21 | Posted receipt | changed-id `shipments.receive` | Rejected; full DB snapshot unchanged | PUR-21 a new request after arrival is rejected without effects |
| PUR-22 | Shipment whose product was removed | `shipments.receive` | Rejected; full DB snapshot unchanged | PUR-22 missing product causes complete rollback |
| PUR-23 | Disabled supplier | `shipments.receive` | No purchase receipt | PUR-23 rollback creates no purchase receipt |
| PUR-24 | Cross-branch product | `shipments.receive` | No supplier ledger entry | PUR-24 rollback creates no supplier ledger entry |
| PUR-25 | Disabled supplier and initial products | `shipments.receive` | Products exactly unchanged | PUR-25 rollback leaves product inventory untouched |
| PUR-26 | Two suppliers using `INV-1` | two `shipments.receive` calls | Two valid supplier-specific receipts | PUR-26 same external invoice is accepted for a different supplier |
| PUR-27 | Same supplier, balances in two branches | `suppliers.branchBalances` | Requested branch returns only its 54 balance | PUR-27 supplier balances are independent by branch |
| PUR-28 | Same supplier; real receipts/liabilities of 54 and 7 in two active branches; two managers, admin, and accountant | `shipments.receive` twice; `suppliers.ledger` and `branchBalances` by role/branch with one-row pages | Each manager sees only own branch and cannot request the other; accountant follows the same branch restriction; admin can query both; balances are 54/7 and pagination is done within each isolated branch | PUR-28 real receipt ledgers are branch-isolated under manager admin and accountant policy |
| PUR-29 | Shipping-scoped posting permissions | `shipments.receive` | Receipt is created | PUR-29 shipping permission can receive |
| PUR-30 | Shipping without ledger permission | `suppliers.ledger` | Query rejected | PUR-30 shipping without ledger permission cannot view it |
| PUR-31 | Supplier viewer without ledger permission | `suppliers.branchBalances` | Query rejected | PUR-31 user without ledger permission cannot read balances |
| PUR-32 | Supplier containing legacy balance | `suppliers.get` | Limited DTO has no balance | PUR-32 limited supplier DTO exposes no legacy balance |
| PUR-33 | Two ledger rows, one-item page | `suppliers.ledger` twice | `continueCursor` returns distinct second page | PUR-33 supplier ledger pagination uses continueCursor |
| PUR-34 | Ledger rows on two dates | `suppliers.ledger` | Dates ordered descending | PUR-34 ledger is ordered by date descending |
| PUR-35 | Posted shipment | `shipments.receive` | Shipment/receipt/movements linked; zero payments/financial transactions | PUR-35 receipt links shipment document movements and creates no payment |
| PUR-36 | Legacy arrived shipment and full snapshot | `suppliers.legacyReview` | Full DB snapshot unchanged | PUR-36 legacy review is read-only |
| PUR-37 | Mixed shipment: paid line 10, free line quantity 2, freight 1 | `shipments.receive` | Paid line receives all freight; free stock rises by 2 while its allocation, item value, and movement delta remain zero | PUR-37 mixed paid and free lines receive free stock without allocated value |
| PUR-38 | Two all-free lines with quantities 1/2 and no freight | `shipments.receive` | Numbered paid/closed zero receipt; stock and zero-value movements created; no ledger, balance, payment, or financial transaction | PUR-38 all-free receipt without freight closes paid with zero movements and no financial rows |
| PUR-39 | Two all-free lines with quantities 1/3 and external freight 1 | `shipments.receive` | Quantity allocations 0.25/0.75 and movement sum 1; zero payable and no supplier ledger/balance | PUR-39 all-free external freight allocates by quantity without supplier liability |
| PUR-40 | Two all-free lines with quantities 1/2 and supplier freight 1 | `shipments.receive` | Quantity allocations 0.33/0.67; inventory adds 1 and ledger/balance liability is exactly 1 | PUR-40 all-free supplier freight allocates inventory and posts exact liability |
