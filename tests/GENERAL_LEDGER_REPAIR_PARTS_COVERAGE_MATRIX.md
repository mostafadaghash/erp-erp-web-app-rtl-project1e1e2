# Repair Parts Inventory and COGS Acceptance Matrix

| ID | Fixture and operation | Executed API | Verified state and accounting result | Status |
| --- | --- | --- | --- | --- |
| RPB-01 | Stock 3 / value 31 / cost 10.3333; labor 100; issue 1 at server price 20 | `repairs.create` | Repair 120, COGS 10.33, stock 2/value 20.67, AR 120, sales -120, inventory GL 28.67 | EXECUTABLE |
| RPB-02 | Same product; issue all 3 with zero labor | `repairs.create` | Exact remaining value 31 is removed; stock/value become 0/0 and historical value is stored | EXECUTABLE |
| RPB-03 | Screen 1 plus battery 2; labor 50; deposit 40 | `repairs.create` | Parts revenue 35, COGS 18.33, total 85, paid/remaining 40/45, server product names/prices stored | EXECUTABLE |
| RPB-04 | Part-only repair with price 20 and COGS 10.33 | `repairs.create` | AR/sales 20 and COGS/inventory 10.33 without labor revenue | EXECUTABLE |
| RPB-05 | Free part price 0, inventory value 10.33, no customer | `repairs.create` | Two-line Dr COGS / Cr inventory journal only; no synthetic AR or revenue | EXECUTABLE |
| RPB-06 | Labor 100 and `parts: []` | `repairs.create` | Existing labor-only contract remains; zero parts totals and no inventory movement | EXECUTABLE |
| RPB-07 | Request 4 units while stock is 3 | `repairs.create` rejected | Full snapshot proves no repair, counter, stock, customer, GL, finance, audit, or payments side effect | EXECUTABLE |
| RPB-08 | Product made inactive before create | `repairs.create` rejected | Full snapshot remains byte-for-byte equal | EXECUTABLE |
| RPB-09 | Admin selects product from another branch | `repairs.create` rejected | Exact document-branch equality is enforced even for Admin; full rollback | EXECUTABLE |
| RPB-10 | Quantities 0, -1, and 1.5 in isolated harnesses | `repairs.create` rejected | Integer-positive quantity rule and independent full rollback for every invalid input | EXECUTABLE |
| RPB-11 | Same product ID appears twice | `repairs.create` rejected | Duplicate historical lines are blocked before any write | EXECUTABLE |
| RPB-12 | Server product sell price changed to 1.001 | `repairs.create` rejected | Financial precision is validated before rounding; full rollback | EXECUTABLE |
| RPB-13 | Identical create payload and request ID retried | `repairs.create` twice | Same repair ID; no duplicate movement, journal, ledger, counter, or audit | EXECUTABLE |
| RPB-14 | Same request ID reused with quantity 2 instead of 1 | `repairs.create` rejected | Creation fingerprint conflict and unchanged full snapshot | EXECUTABLE |
| RPB-15 | Matching retry after product becomes inactive and price changes | `repairs.create` retry | Same ID is returned before mutable product-state checks; no new effect | EXECUTABLE |
| RPB-16 | Labor 31 plus part revenue 20 / COGS 10.33 | `repairs.create` | Exact four lines: 1200 Dr 51, 4100 Cr 51, 5000 Dr 10.33, 1300 Cr 10.33 | EXECUTABLE |
| RPB-17 | System COGS account disabled after fixture | `repairs.create` rejected | Consumed stock, repair, ledgers, counter, and audit all roll back | EXECUTABLE |
| RPB-18 | System inventory account disabled after fixture | `repairs.create` rejected | Physical issue rolls back with all accounting effects | EXECUTABLE |
| RPB-19 | `operationalPostingEnabled=false`; normal part issue | `repairs.create` | Physical stock/value and movement are recorded, but no operational journal is posted | EXECUTABLE |
| RPB-20 | Full-stock issue then audited cancellation | `repairs.create`, `repairs.updateStatus` | Exact +31 restoration, issue/reversal movements, and AR/sales/COGS/inventory GL return to opening | EXECUTABLE |
| RPB-21 | Cancellation retried with normalized equivalent reason | `repairs.updateStatus` twice | Same repair result, exactly two inventory movements, no duplicate reversal | EXECUTABLE |
| RPB-22 | Cancelled repair receives a different reversal request | `repairs.updateStatus` rejected | Stock cannot be restored twice; full snapshot is unchanged | EXECUTABLE |
| RPB-23 | January period closed after create and before cancel | `repairs.updateStatus` rejected | Inventory restoration begins inside the same mutation but rolls back with GL/customer state | EXECUTABLE |
| RPB-24 | Admin picker/get plus Viewer get | `repairs.partPicker`, `repairs.get` | Picker allowlist excludes cost/value; Admin sees historical costs, Viewer does not; all idempotency/journal internals redacted | EXECUTABLE |
