# Repairs UAT Action Validation Matrix

| Operation | UI pre-submit rule | Backend authority | Expected UX |
|---|---|---|---|
| Create repair | Branch, customer identity, device brand/model, problem, valid labor/deposit amounts | `repairs.create` validates branch, references, money, parts, inventory, and idempotency | Submit is disabled with one visible Arabic reason |
| Add repair parts | Complete product row, integer positive quantity, no duplicates, quantity within displayed stock | Server reloads active branch product, price, and stock before issuing inventory | Incomplete or impossible rows cannot be submitted |
| Initial deposit | Non-negative money, not above order total, active branch account selected | Finance account, branch, permissions, and posting remain server validated | User sees the missing account or amount issue before submit |
| Start repair | Assigned technician required | `transitionStatus` requires a technician before `in_progress` | Transition button is disabled with assignment guidance |
| Mark ready | Final diagnosis required | `transitionStatus` requires diagnosis before `ready` | Missing diagnosis is shown in the modal |
| Deliver repair | Remaining balance must be zero; warranty is integer 0–365 | `transitionStatus` rechecks balance and warranty | Delivery cannot be attempted while money remains |
| Cancel repair | Full deposit refund and cancellation reason required | `transitionStatus` rechecks deposit, reason, stock reversal, ledger, and journals | User is directed to refund before cancellation |
| Collect payment | Positive amount not above remaining, branch account, ISO date | `recordPayment` validates status, account branch, amount, customer/accounting rules, and request ID | Invalid collection is blocked before mutation |
| Refund payment | Positive amount not above collected, reason, branch account, ISO date | `refundPayment` validates duplicate request, account, amount, reason, ledger, and finance posting | Invalid refund is blocked before mutation |
| Edit details | Optional expected date must be ISO-formatted | `updateDetails` validates status, branch, technician, and date | Invalid expected date is shown before update |

## Invariants

- Validation improves feedback; it does not replace backend checks.
- Mutation request IDs remain unchanged while retrying the same operation.
- Branch, permission, finance, inventory, ledger, and journal rules remain server-authoritative.
