# Purchase receipts acceptance coverage (PUR-01–PUR-36)

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
| PUR-14 | Equal lines sharing fractional freight | `shipments.receive` | Allocations and item values sum to 3.00 | PUR-14 fractional freight allocation reconciles on the last line |
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
| PUR-28 | Posted ledger plus manager/admin/accountant identities | `suppliers.ledger` under all three roles | Central role policy permits the branch page and every row remains isolated | PUR-28 ledger is branch-isolated under manager, admin and accountant policy |
| PUR-29 | Shipping-scoped posting permissions | `shipments.receive` | Receipt is created | PUR-29 shipping permission can receive |
| PUR-30 | Shipping without ledger permission | `suppliers.ledger` | Query rejected | PUR-30 shipping without ledger permission cannot view it |
| PUR-31 | Supplier viewer without ledger permission | `suppliers.branchBalances` | Query rejected | PUR-31 user without ledger permission cannot read balances |
| PUR-32 | Supplier containing legacy balance | `suppliers.get` | Limited DTO has no balance | PUR-32 limited supplier DTO exposes no legacy balance |
| PUR-33 | Two ledger rows, one-item page | `suppliers.ledger` twice | `continueCursor` returns distinct second page | PUR-33 supplier ledger pagination uses continueCursor |
| PUR-34 | Ledger rows on two dates | `suppliers.ledger` | Dates ordered descending | PUR-34 ledger is ordered by date descending |
| PUR-35 | Posted shipment | `shipments.receive` | Shipment/receipt/movements linked; zero payments/financial transactions | PUR-35 receipt links shipment document movements and creates no payment |
| PUR-36 | Legacy arrived shipment and full snapshot | `suppliers.legacyReview` | Full DB snapshot unchanged | PUR-36 legacy review is read-only |
