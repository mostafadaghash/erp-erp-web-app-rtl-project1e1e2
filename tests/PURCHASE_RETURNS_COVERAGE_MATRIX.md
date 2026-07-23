# Purchase returns coverage matrix

The acceptance mapping is intentionally concrete: `PRT-RULE-01` through `PRT-RULE-10` prepare exact numeric inputs and execute the shared production rules; `PRT-UI-01` through `PRT-UI-12` inspect the actual route, permission, retry, quantity, freight, refund-account, reversal, and error wiring. The integration schema test executes the real Convex schema and verifies the permanent indexed table. Full database scenarios are exercised by the repository-wide Convex harness through the production helpers.

| Test | Prepared data | Operation | Verified effect |
|---|---|---|---|
| PRT-RULE-04 | line total 10, quantity 3, cumulative 2+1 | `incrementalGoodsCredit` | credits 6.67 then 3.33 and reconciles 10.00 |
| PRT-RULE-07 | stock 4, value 10, return 1 | `inventoryValueForPurchaseReturn` | removes 2.50 using moving average |
| PRT-RULE-09 | payable 100, paid 40, remaining 60, credit 75 | `purchaseReceiptAfterCredit` | debt 60, cash 15, net payable 25 |
| PRT-RULE-10 | credited receipt state and original split | `purchaseReceiptAfterReversal` | restores payable 100, paid 40, remaining 60 |
| PRT-INTEGRATION-SCHEMA | production Convex schema | schema table inspection | permanent return and receipt/number indexes exist |
