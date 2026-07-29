# General Ledger Financial Bridge Acceptance Matrix

The bridge is an intentionally bounded phase 4B slice. It posts every `financialTransactions` movement to the general ledger atomically, while `operationalPostingEnabled` remains false until the non-cash sales, inventory, purchase, customer, and supplier bridges are complete.

| ID | Executed API | Fixture and assertion | Atomic database evidence | Status |
|---|---|---|---|---|
| FGB-01 | `generalLedger.financialPostingReadinessStatus` | GL initialized without Finance initialization | Readiness returns a typed blocking issue and eleven required system accounts | EXECUTABLE |
| FGB-02 | `generalLedger.enableFinancialPosting` | Finance cash 100/bank 50/wallet 80 versus zero GL opening | Activation rejects and the finance, GL, counters, audit, and legacy-payment snapshot is unchanged | EXECUTABLE |
| FGB-03 | `generalLedger.status` | Matched 230 opening and successful activation | Financial bridge is enabled at 2026-01-01 while full operational posting stays false | EXECUTABLE |
| FGB-04 | `generalLedger.enableFinancialPosting` | Same request/date retry, then a different request | Retry is read-only; conflicting activation is rejected | EXECUTABLE |
| FGB-05 | `generalLedger.enableFinancialPosting` | Manager identity | Backend permission denies activation | EXECUTABLE |
| FGB-06 | `finance.transferFunds` | Cash to bank 20 in one branch | One linked journal: Dr bank 20 / Cr cash 20 | EXECUTABLE |
| FGB-07 | `finance.transferFunds` | Same request repeated then amount changed 20→21 | One transaction/journal; changed fingerprint rejects without effects | EXECUTABLE |
| FGB-08 | `finance.transferFunds` | Source and destination in different branches | Cross-branch posting rejects and both account balances plus GL snapshot roll back | EXECUTABLE |
| FGB-09 | `postFinancialTransaction` through harness | Invoice collection 25 to cash | Dr cash 25 / Cr accounts receivable 25 | EXECUTABLE |
| FGB-10 | `postFinancialTransaction` through harness | Invoice refund 15 from cash | Dr accounts receivable 15 / Cr cash 15 | EXECUTABLE |
| FGB-11 | `postFinancialTransaction` through harness | Order deposit 30 to bank | Dr bank 30 / Cr customer advances 30 | EXECUTABLE |
| FGB-12 | `postFinancialTransaction` through harness | Order deposit refund 20 | Dr customer advances 20 / Cr cash 20 | EXECUTABLE |
| FGB-13 | `postFinancialTransaction` through harness | Repair collection 18 and refund 8 | Receivables control is credited/debited by the exact cash movements | EXECUTABLE |
| FGB-14 | `postFinancialTransaction` through harness | Expense payment 12 | Dr operating expense 12 / Cr cash 12 | EXECUTABLE |
| FGB-15 | `postFinancialTransaction` through harness | Supplier payment 35 | Dr accounts payable 35 / Cr bank 35 | EXECUTABLE |
| FGB-16 | `postFinancialTransaction` through harness | Supplier cash refund 22 | Dr cash 22 / Cr accounts payable 22 | EXECUTABLE |
| FGB-17 | `postFinancialTransaction` through harness | Delivery COD confirmation 40 | Dr COD carrier receivable 40 / Cr customer receivable 40 | EXECUTABLE |
| FGB-18 | `postFinancialTransaction` through harness | Cash sales return refund 14 | Dr sales returns 14 / Cr cash 14 | EXECUTABLE |
| FGB-19 | `finance.settleClearingAccount` | Paymob gross 80, fee 7.50, net 72.50 | Dr cash 72.50 + Dr shipping fee 7.50 / Cr wallet clearing 80 | EXECUTABLE |
| FGB-20 | `postFinancialTransaction` through harness | Clearing gross/net 20 without fee | Exactly two balanced asset lines and no zero fee line | EXECUTABLE |
| FGB-21 | `postFinancialTransaction` through harness | COD 50 settled to cash with fee 5 | Dr cash 45 + Dr shipping fee 5 / Cr COD 50 | EXECUTABLE |
| FGB-22 | `finance.reverseTransaction` | Reverse a posted transfer 20 | Exact swapped lines, bidirectional GL links, original status `reversed` | EXECUTABLE |
| FGB-23 | `finance.reverseTransaction` | Matching reversal retry, then changed reason | Same reversal ID; changed payload rejected with a stable snapshot | EXECUTABLE |
| FGB-24 | `finance.transferFunds` | GL period closed before a transfer | Financial account, transaction, movement, journal, counter, and audit writes all roll back | EXECUTABLE |
| FGB-25 | `postFinancialTransaction` through harness | Mapped cash GL account disabled | Financial mutation rejects and every affected table remains unchanged | EXECUTABLE |
| FGB-26 | `postFinancialTransaction` through harness | Finance accepts 2026-01-09 but bridge cutover is 2026-01-10 | GL cutover guard rejects and transaction/account writes roll back | EXECUTABLE |
| FGB-27 | `generalLedger.entryDetails`, `generalLedger.reverseJournal` | Linked financial entry | DTO omits transaction IDs/fingerprints; manual reversal is denied | EXECUTABLE |
| FGB-28 | `generalLedger.status` plus two financial posts | Collection and expense after activation | Two financial journals, zero legacy `payments`, full operational flag remains false | EXECUTABLE |
