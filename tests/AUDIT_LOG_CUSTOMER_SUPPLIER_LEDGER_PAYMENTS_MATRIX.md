# Audit Log — Customer/Supplier Ledgers & Payments Matrix

| ID | Contract | Automated evidence |
| --- | --- | --- |
| ALP-01 | Customer-ledger events expose branch and operational document references. | Source contract |
| ALP-02 | Customer-ledger snapshots contain safe before/after balances and reversal lineage. | Source contract |
| ALP-03 | Supplier-ledger events expose branch, source document, and supplier reference. | Source contract |
| ALP-04 | Supplier-ledger reversal events identify the original entry and safe balance movement. | Source contract |
| ALP-05 | Supplier-payment events link the payment, supplier-ledger entry, and financial transaction. | Source contract |
| ALP-06 | Supplier-payment reversals link the reversal financial transaction to the original financial transaction. | Source contract |
| ALP-07 | Idempotent retries return before audit writes for create and reverse flows. | Source contract |
| ALP-08 | Audit UI uses Arabic labels and never builds navigation from untrusted audit values. | Source contract |

## Manual acceptance

- Post a customer receipt/payment-backed ledger event and verify the audit row shows the branch, source document, customer, and before/after balances.
- Reverse a customer ledger event and verify the original ledger-entry identifier appears under “عكس لـ”.
- Post a supplier payment with multiple allocations and verify payment number, supplier-ledger entry, financial transaction, amount, account, and allocation count.
- Reverse the supplier payment and verify the reversal financial transaction and original financial transaction are distinguishable.
- Confirm long document identifiers wrap safely on mobile and no audit tag is clickable.

## Scope boundary

This slice changes audit metadata and presentation only. It does not alter balances, allocations, posting order, debit/credit mappings, idempotency keys, reversal validation, permissions, or branch ownership rules. Invoice/order/delivery/repair business workflows remain unchanged; their customer-ledger events inherit the centralized ledger audit links.
