# Repairs UAT — Branch and Creation-State Safety

| Scenario | Expected result |
|---|---|
| Admin opens Repairs without choosing a branch | No mixed-branch repair list is shown; the UI asks for a branch. |
| Admin chooses a branch | Repairs, customers, parts, technicians, and financial accounts are scoped to that branch. |
| Branch employee opens Repairs | The server ignores arbitrary branch input and uses the employee branch. |
| User changes branch while create modal is open | The modal closes and parts, account, customer/device fields, and request ID are reset. |
| User closes and reopens create modal | A fresh form and fresh idempotency request ID are used. |
| User selected an initial-deposit account then changes branch | The account selection is cleared before another request can be submitted. |
| Repair list is loading | The UI shows a loading state rather than a false empty state. |
| Selected branch has no repairs | The UI shows the true empty-state message. |

Backend authority remains unchanged for branch access, account validation, inventory checks, and creation idempotency.
