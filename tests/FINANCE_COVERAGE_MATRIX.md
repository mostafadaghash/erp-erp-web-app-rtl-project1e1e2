# Financial integration coverage matrix

All rows below are executable Convex Test Harness scenarios in `financeIntegration.test.ts`; none are pure unit or TypeScript-only checks.

| ID | Required scenario | Status | Responsible test |
|---|---|---|---|
| FIN-01 | Block transfers before initialization | Covered | `FIN-01 blocks transfers before initialization` |
| FIN-02 | Block collections before initialization | Covered | `FIN-02 blocks collections before initialization` |
| FIN-03 | Validate cutover date | Covered | `FIN-03 validates cutover date syntax` |
| FIN-04 | Reject dates before cutover | Covered | `FIN-04 rejects transactions before cutover` |
| FIN-05 | Create and normalize accounts | Covered | `FIN-05 creates normalized financial accounts` |
| FIN-06 | Reject duplicate code in a branch | Covered | `FIN-06 rejects duplicate account codes within a branch` |
| FIN-07 | Isolate account codes by branch | Covered | `FIN-07 permits the same account code in isolated branches` |
| FIN-08 | Non-zero opening balance | Covered | `FIN-08 posts a non-zero opening balance` |
| FIN-09 | Zero opening balance | Covered | `FIN-09 records a zero opening balance without a movement` |
| FIN-10 | Reject repeated opening balance | Covered | `FIN-10 rejects a repeated opening balance` |
| FIN-11 | Confirmation requires cash account | Covered | `FIN-11 refuses confirmation when a branch has no cash account` |
| FIN-12 | Confirmation requires all openings | Covered | `FIN-12 refuses confirmation when an opening balance is missing` |
| FIN-13 | Confirm initialization | Covered | `FIN-13 confirms complete initialization` |
| FIN-14 | Freeze cutover after confirmation | Covered | `FIN-14 prevents cutover changes after confirmation` |
| FIN-15 | Invoice collection/refund | Covered | `FIN-15 collects and refunds invoice` |
| FIN-16 | Order collection/refund | Covered | `FIN-16 collects and refunds order` |
| FIN-17 | Repair collection/refund | Covered | `FIN-17 collects and refunds repair` |
| FIN-18 | Initial payment during creation | Covered | `FIN-18 order creation posts its initial deposit` |
| FIN-19 | Invoice request idempotency | Covered | `FIN-19 requestId makes invoice collection idempotent` |
| FIN-20 | Order request idempotency | Covered | `FIN-20 requestId makes order collection idempotent` |
| FIN-21 | Repair request idempotency | Covered | `FIN-21 requestId makes repair collection idempotent` |
| FIN-22 | Expense/account linkage | Covered | `FIN-22 creates an expense linked to its account and transaction` |
| FIN-23 | Expense request idempotency | Covered | `FIN-23 expense requestId is idempotent` |
| FIN-24 | Atomic expense void/reversal | Covered | `FIN-24 voids an expense with an atomic financial reversal` |
| FIN-25 | Account transfer | Covered | `FIN-25 transfers funds between two accounts` |
| FIN-26 | Transfer request idempotency | Covered | `FIN-26 transfer requestId is idempotent` |
| FIN-27 | Prevent disallowed negative balance | Covered | `FIN-27 prevents a negative balance unless explicitly allowed` |
| FIN-28 | Permit configured negative balance | Covered | `FIN-28 permits a negative balance when explicitly allowed` |
| FIN-29 | Clearing available/pending balance | Covered | `FIN-29 reports clearing available and pending balances` |
| FIN-30 | Clearing settlement and fees | Covered | `FIN-30 settles clearing gross amount and fees` |
| FIN-31 | Reject excess settlement | Covered | `FIN-31 rejects settlement exceeding available balance` |
| FIN-32 | Eligible reversal | Covered | `FIN-32 reverses an eligible transfer` |
| FIN-33 | Reject generic document reversal | Covered | `FIN-33 rejects generic reversal of document collections` |
| FIN-34 | Balance/movement consistency | Covered | `FIN-34 keeps currentBalance equal to the movement chain` |
| FIN-35 | No new legacy payment writes | Covered | `FIN-35 never writes new rows to legacy payments` |
| FIN-36 | Role and branch isolation | Covered | `FIN-36 isolates finance data and permissions by role and branch` |
