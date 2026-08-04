# Audit Log — Shipments & Expenses Links Matrix

| ID | Contract | Automated evidence |
| --- | --- | --- |
| ASE-01 | Shipment creation exposes the affected branch, shipment, supplier, item count, and bounded totals. | Source contract |
| ASE-02 | Shipment status transitions preserve Before/After state and cancellation reason. | Source contract |
| ASE-03 | Shipment receipt links the shipment to its purchase receipt and journal entry with a safe financial summary. | Source contract |
| ASE-04 | Idempotent receipt retries return before appending another direct audit event. | Source contract |
| ASE-05 | Expense creation links the expense, financial account, branch, and financial transaction. | Source contract |
| ASE-06 | Expense voiding identifies the reversal transaction and the original transaction separately. | Source contract |
| ASE-07 | Duplicate reversal retries return before appending another direct audit event. | Source contract |
| ASE-08 | Audit UI uses Arabic labels and never builds navigation from untrusted audit values. | Source contract |

## Manual acceptance

- Create a shipment and verify supplier, branch, item count, goods cost, freight, grand total, and expected date.
- Move a shipment to in transit, then cancel a disposable shipment and verify the exact Before/After status and reason.
- Receive a shipment and verify the shipment row links the purchase receipt and journal entry; compare amounts with the purchase receipt.
- Retry the same receipt request and confirm no second direct shipment-receipt audit row is created.
- Create an expense and verify its account and financial transaction identifiers.
- Void the expense and verify the new reversal transaction is distinct from the original transaction under “عكس لـ”.
- Confirm long identifiers wrap safely and none of the document tags are clickable.

## Scope boundary

This slice changes audit metadata and presentation only. It does not alter shipment totals, inventory valuation, supplier balances, journal mappings, expense posting, account movements, idempotency, status eligibility, permissions, or branch ownership.
