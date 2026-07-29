# General Ledger Sales and Inventory Bridge

This is the second bounded phase 4B slice. The code posts invoice and sales-return revenue, customer-control, inventory, and COGS legs atomically when the final operational gate is enabled. The production gate remains `false` until purchasing and the remaining operating ledgers are integrated.

| ID | Public operation | Executed evidence | Status |
|---|---|---|---|
| SIB-01 | `invoices.create` | Unpaid sale 200 / COGS 100 posts Dr AR 200, Dr COGS 100, Cr sales 200, Cr inventory 100 | EXECUTABLE |
| SIB-02 | `invoices.create` | Fully paid sale combines one operational and one financial journal; AR closes and cash rises exactly once | EXECUTABLE |
| SIB-03 | `invoices.create` | Matching creation retry returns the same invoice and preserves all row counts | EXECUTABLE |
| SIB-04 | `invoices.update` | Quantity 2→1 posts only the -100 sales and -50 COGS adjustment | EXECUTABLE |
| SIB-05 | `invoices.cancel` | Cancellation restores product 10/500 and all four GL controls to opening values | EXECUTABLE |
| SIB-06 | `salesReturns.create` | Debt-only return 100 reverses AR and 50 of COGS without a cash journal | EXECUTABLE |
| SIB-07 | `salesReturns.create` | Cash-only return separates the financial refund from the two-line inventory/COGS journal | EXECUTABLE |
| SIB-08 | `salesReturns.create` | Mixed 50 debt / 50 cash produces total contra revenue 100 without overlap | EXECUTABLE |
| SIB-09 | `salesReturns.reverse` | Debt-return reversal restores AR, COGS, inventory, and bidirectional journal links | EXECUTABLE |
| SIB-10 | `salesReturns.reverse` | Cash-return reversal restores both financial and operational balances exactly | EXECUTABLE |
| SIB-11 | `invoices.create` | Closed period rolls back invoice, stock, customer ledger, counters, journals, and audit | EXECUTABLE |
| SIB-12 | `invoices.create` | Inactive sales account rolls back the complete document mutation | EXECUTABLE |
| SIB-13 | `invoices.create` | Pre-cutover document is rejected by the shared financial cutover with no effects | EXECUTABLE |
| SIB-14 | `invoices.create` | Dormant production gate preserves the document cycle without claiming GL posting | EXECUTABLE |
| SIB-15 | `invoices.create` | Operational posting refuses to run unless the finance bridge is enabled first | EXECUTABLE |
| SIB-16 | Invoice/return/reversal cycle | Full mixed cycle creates zero rows in legacy `payments` | EXECUTABLE |
| SIB-17 | `salesReturns.create` | Matching return retry preserves one return and one operational journal | EXECUTABLE |
| SIB-18 | `salesReturns.reverse` | Matching reversal retry preserves one reversal journal | EXECUTABLE |
| SIB-19 | `salesReturns.reverse` | A different reversal request is rejected with unchanged row counts | EXECUTABLE |
| SIB-20 | `invoices.create` | Insufficient stock leaves invoice, GL, customer, and inventory snapshots unchanged | EXECUTABLE |
| SIB-21 | `salesReturns.create` | Over-return rejection preserves invoice, product, journals, and counters | EXECUTABLE |
| SIB-22 | `invoices.cancel` | Missing historical COGS blocks cancellation and rolls inventory/customer writes back | EXECUTABLE |
| SIB-23 | `invoices.get/list`, `salesReturns.list` | Runtime DTOs exclude all new internal journal links | EXECUTABLE |
| SIB-24 | `invoices.create` | Cross-branch product is rejected and both branch snapshots remain unchanged | EXECUTABLE |
| SIB-25 | `invoices.create` | Quantity 3 × cost 10.3333 posts the exact rounded value 31 to COGS and inventory | EXECUTABLE |
| SIB-26 | `invoices.create` | Zero-cost sale posts revenue/AR only and creates no fake zero-value COGS lines | EXECUTABLE |
| SIB-27 | Two `salesReturns.create` calls | Partial returns 1+2 absorb the exact 300 sale and 150 COGS totals | EXECUTABLE |
| SIB-28 | Create/return/reverse | Complete mixed cycle proves document, transaction, journal links and final balances | EXECUTABLE |
