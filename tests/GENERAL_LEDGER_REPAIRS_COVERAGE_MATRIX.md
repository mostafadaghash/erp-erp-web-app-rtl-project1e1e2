# General Ledger Repairs Bridge Coverage

| ID | Fixture / public operation | Runtime accounting evidence | Status |
|---|---|---|---|
| RIB-01 | Registered customer, labor 100; `repairs.create` | Repair + customer charge + Dr AR 100 / Cr revenue 100 | EXECUTABLE |
| RIB-02 | Labor 100, initial deposit 30 | Operational and financial journals; AR 70; cash 1030 | EXECUTABLE |
| RIB-03 | Labor/deposit 100 | AR zero, revenue 100, cash 1100, no duplicate revenue | EXECUTABLE |
| RIB-04 | Zero labor | Valid repair without synthetic journal or balance movement | EXECUTABLE |
| RIB-05 | Operational gate disabled, no customer | Legacy-compatible repair and zero operational journals | EXECUTABLE |
| RIB-06 | Operational gate enabled, no customer | Atomic rejection; full database snapshot unchanged | EXECUTABLE |
| RIB-07 | Identical `creationRequestId` retry | One repair, one journal, one AR movement | EXECUTABLE |
| RIB-08 | Closed 2026-01 period | Repair/customer/counters/audit/journals roll back | EXECUTABLE |
| RIB-09 | Document before 2026-01-01 cutover | All operational and subledger effects roll back | EXECUTABLE |
| RIB-10 | Disabled AR control account | Complete create mutation rollback | EXECUTABLE |
| RIB-11 | Disabled revenue account | Complete create mutation rollback | EXECUTABLE |
| RIB-12 | Labor 31 | Stored repair reference and exact 1200/4100 historical lines | EXECUTABLE |
| RIB-13 | Unpaid repair then `updateStatus(cancelled)` | Exact revenue reversal and bidirectional journal links | EXECUTABLE |
| RIB-14 | Deposit 40, refund 40, cancel | Customer, cash, AR and revenue all restored | EXECUTABLE |
| RIB-15 | Matching cancel retry after trim | Same repair result; no duplicate journal, ledger or audit | EXECUTABLE |
| RIB-16 | Changed cancel reason with same request | Fingerprint rejection; full snapshot unchanged | EXECUTABLE |
| RIB-17 | Cancel date before repair date | Atomic rejection before historical reversal | EXECUTABLE |
| RIB-18 | Legacy repair without original GL journal | Explicit review block after operational cutover | EXECUTABLE |
| RIB-19 | Outstanding deposit | Cancellation rejected without implicit cash reversal | EXECUTABLE |
| RIB-20 | Later `repairs.recordPayment(25)` | Financial cash/AR journal only; revenue remains single | EXECUTABLE |
| RIB-21 | Deposit 40 then `refundPayment(10)` | Financial refund restores AR; no new revenue journal | EXECUTABLE |
| RIB-22 | Legacy unregistered repair collection | Financial bridge refuses orphan AR control movement | EXECUTABLE |
| RIB-23 | `repairs.get` and `repairs.list` | Runtime DTOs redact GL and idempotency internals | EXECUTABLE |
| RIB-24 | Full deposit, full refund, cancellation | End-to-end ledgers reconcile; legacy `payments` remains empty | EXECUTABLE |
