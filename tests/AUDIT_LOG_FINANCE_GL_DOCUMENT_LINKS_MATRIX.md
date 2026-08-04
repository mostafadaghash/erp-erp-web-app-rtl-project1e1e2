# Audit Log — Finance and General Ledger Document Links Matrix

| ID | Area | Acceptance check | Automation |
| --- | --- | --- | --- |
| AFG-01 | Audit schema | Structured document link fields are bounded scalar fields and do not use `v.any()` | `auditLogFinanceGeneralLedgerLinks.test.ts` |
| AFG-02 | Audit DTO | Paginated DTO allowlists new link fields and remains compatible with legacy rows | `auditLogFinanceGeneralLedgerLinks.test.ts` |
| AFG-03 | Finance posting | Financial transactions log once after idempotency, with document, transaction, and journal references | `auditLogFinanceGeneralLedgerLinks.test.ts` |
| AFG-04 | Finance reversal | Reversal audit rows use the document branch and point to the original transaction via `reversalOfId` | `auditLogFinanceGeneralLedgerLinks.test.ts` |
| AFG-05 | General Ledger posting | Journal posting audit rows expose source document and safe Before/After summary fields | `auditLogFinanceGeneralLedgerLinks.test.ts` |
| AFG-06 | General Ledger setup | Initialization, activation, account lifecycle, periods, and openings use structured links | `auditLogFinanceGeneralLedgerLinks.test.ts` |
| AFG-07 | Redaction | Snapshots do not persist request IDs, idempotency keys, tokens, or fingerprints | `auditLogFinanceGeneralLedgerLinks.test.ts` |
| AFG-08 | UI | Audit log UI renders document references as labels only, without building untrusted URLs | `auditLogFinanceGeneralLedgerLinks.test.ts` |

## Out of scope for this PR

This PR intentionally covers Finance and General Ledger only. Customer/Supplier ledgers, payments, invoices, orders, delivery/COD, repairs, and returns should be handled in follow-up PRs to keep review size manageable.
