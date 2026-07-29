# General Ledger Purchases and Supplier Liability Bridge

This is the third bounded phase 4B slice. Purchase receipts and purchase returns post inventory, supplier-control, external-freight, and explicit valuation-difference legs atomically when the final operational gate is enabled. Supplier cash payments and refunds remain owned by the financial bridge. The production operational gate remains `false` until every remaining document cycle is integrated.

| ID     | Public operation                                    | Executed evidence                                                                                                           | Status     |
| ------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| PIB-01 | `shipments.receive`                                 | Goods 30 plus external freight 1 posts Dr inventory 31, Cr AP 30, Cr external-freight liability 1                           | EXECUTABLE |
| PIB-02 | `shipments.receive`                                 | Supplier freight 1 makes the full landed 31 payable to the supplier with no external liability line                         | EXECUTABLE |
| PIB-03 | `shipments.receive`                                 | Split freight 10 as supplier 4/external 6 reconciles Dr inventory 40 to Cr AP 34 + Cr liability 6                           | EXECUTABLE |
| PIB-04 | `shipments.receive`                                 | Free goods plus external freight 1 post inventory/liability only                                                            | EXECUTABLE |
| PIB-05 | `shipments.receive`                                 | Free goods plus supplier freight 1 post inventory/AP only                                                                   | EXECUTABLE |
| PIB-06 | `shipments.receive`                                 | A zero-value receipt remains valid without synthetic zero-value journal lines                                               | EXECUTABLE |
| PIB-07 | `shipments.receive` retry                           | Matching retry returns the same receipt and preserves journal, balances, inventory, supplier ledger, and counters           | EXECUTABLE |
| PIB-08 | `shipments.receive`                                 | A closed period rolls back receipt, stock, supplier, GL balances, counters, and audit                                       | EXECUTABLE |
| PIB-09 | `shipments.receive`                                 | Inactive inventory control account rolls the complete Convex mutation back                                                  | EXECUTABLE |
| PIB-10 | `shipments.receive`                                 | Dormant operational gate preserves the established receipt flow without claiming a GL journal                               | EXECUTABLE |
| PIB-11 | `shipments.receive`                                 | Pre-operational-cutover receipt rejection restores the full cross-ledger snapshot                                           | EXECUTABLE |
| PIB-12 | `shipments.receive`                                 | Journal source, operation, reference ID, and PUR number are linked to the receipt                                           | EXECUTABLE |
| PIB-13 | `purchaseReturns.create`                            | Credit 10 against current inventory 10.08 posts the 0.08 valuation loss explicitly                                          | EXECUTABLE |
| PIB-14 | `purchaseReturns.create`                            | Credit 10 against impaired inventory 5 posts the 5 valuation gain explicitly                                                | EXECUTABLE |
| PIB-15 | `purchaseReturns.create`                            | Equal historical/current value posts only Dr AP 10 / Cr inventory 10                                                        | EXECUTABLE |
| PIB-16 | `purchaseReturns.create`                            | Freight-only supplier credit 1 posts Dr AP / Cr other income without an inventory movement                                  | EXECUTABLE |
| PIB-17 | `supplierPayments.create`, `purchaseReturns.create` | Fully paid receipt return separates Dr cash/Cr AP from Dr AP/Cr inventory and closes AP once                                | EXECUTABLE |
| PIB-18 | `supplierPayments.create`, `purchaseReturns.create` | Payment 20 then return 20 splits debt 10/cash 10; combined GL AP equals supplier balance movement                           | EXECUTABLE |
| PIB-19 | `purchaseReturns.create` retry                      | Matching retry duplicates neither operational nor financial journals or balances                                            | EXECUTABLE |
| PIB-20 | `purchaseReturns.create`                            | Conflicting fingerprint is rejected with inventory, supplier, finance, GL, and counter snapshots unchanged                  | EXECUTABLE |
| PIB-21 | `purchaseReturns.create`                            | Closed period rolls back the return after attempted operational stock and supplier effects                                  | EXECUTABLE |
| PIB-22 | `purchaseReturns.create`                            | Inactive AP control account rolls back document, inventory, supplier, and finance effects                                   | EXECUTABLE |
| PIB-23 | `purchaseReturns.reverse`                           | Debt-only reversal restores inventory/AP/supplier and bidirectionally links original and reversal journals                  | EXECUTABLE |
| PIB-24 | `purchaseReturns.reverse`                           | Cash-only reversal reverses both financial and operational journals and restores exact balances                             | EXECUTABLE |
| PIB-25 | `purchaseReturns.reverse` retry/conflict            | Matching retry returns once; changed reason with the same request is rejected without effects                               | EXECUTABLE |
| PIB-26 | `purchaseReturns.reverse`                           | Closed reversal period rolls stock, finance, supplier, receipt, and journal changes back together                           | EXECUTABLE |
| PIB-27 | `purchaseReturns.list`                              | Runtime allowlist excludes journal links, fingerprints, financial links, and user IDs                                       | EXECUTABLE |
| PIB-28 | Receipt/payment/mixed return/reversal cycle         | Receipt 30, payment 20, return 20, and reversal reconcile inventory 130, AP/supplier 10, cash 980, and zero legacy payments | EXECUTABLE |
