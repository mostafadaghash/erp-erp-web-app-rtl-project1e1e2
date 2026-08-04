# Audit Log Structured Snapshots — Acceptance Matrix

| ID | Scenario | Automated evidence | Manual follow-up |
|---|---|---|---|
| AUS-01 | Audit rows store bounded Before/After field-value arrays | `auditLogStructuredSnapshots.test.ts` | Inspect one row in Convex dashboard |
| AUS-02 | Arbitrary `v.any()` payloads are not accepted | Schema source contract | Attempt an unsupported nested snapshot in a harness |
| AUS-03 | Sensitive key names are masked centrally | Helper source contract | Verify token/password-like fields display `[محجوب]` |
| AUS-04 | Snapshots are limited to 24 fields and 300 characters per value | Helper source contract | Seed oversized values and inspect truncation |
| AUS-05 | Changed fields are computed and snapshot version/timestamp are stored | Helper source contract | Compare an unchanged and changed update |
| AUS-06 | Admin operations can attribute the event to the affected record branch | Branch/employee source contracts | Admin edits another branch and filters that branch |
| AUS-07 | Global settings and supplier master records do not inherit a working branch | Settings/supplier source contracts | Switch admin working branch and repeat update |
| AUS-08 | First-admin creation and profile upgrade both create structured audit events | Employee source contract | Exercise both setup paths in disposable environments |
| AUS-09 | Employee role, branch, active state and permission count are audited without permission contents | Employee source contract | Change role and permissions, inspect Before/After |
| AUS-10 | Customer contact snapshots expose only last four phone digits and presence flags | Customer source contract | Edit contact fields and inspect payload |
| AUS-11 | Supplier contact snapshots expose only last four phone digits and presence flags | Supplier source contract | Edit global supplier from two branches |
| AUS-12 | Product snapshots cover identity, stock and lifecycle without generic cost/sell prices | Product source contract | Adjust stock and toggle active state |
| AUS-13 | Paginated audit DTO exposes only allowlisted structured fields | DTO source contract | Inspect browser network response |
| AUS-14 | Arabic UI expands native Before/After details and searches loaded snapshot values | UI source contract | Keyboard and screen-reader check |

## Deferred to the next Audit Log slice

- structured snapshots for financial transactions, journals, customer/supplier ledger postings and reversals
- explicit source-document links and reverse navigation for financial events
- missing `logAction` coverage across remaining operational mutations
- export events and administrative security events outside the covered master-data modules
- production-scale retention and archival policy
