# Customer and Supplier Master Data Acceptance Matrix

| ID | Fixture and operation | Runtime evidence | Status |
|---|---|---|---|
| CSM-01 | Admin creates a branch customer using Arabic digits, spaced name, mixed-case email, address and notes through `customers.create`. | Stored values are canonical, branch-owned, active, and legacy totals start at zero. | EXECUTABLE |
| CSM-02 | A second customer in the same branch uses the `+20` representation of the first phone. | `customers.create` rejects the canonical duplicate and the full master snapshot is unchanged. | EXECUTABLE |
| CSM-03 | Admin creates `01010000000` once in Cairo and once in Giza. | Both rows exist with distinct IDs and the requested branch IDs. | EXECUTABLE |
| CSM-04 | Blank name, three-digit phone, and invalid email are attempted independently. | Every mutation rejects before persistence; customers, suppliers, audit, balances, and ledger snapshots remain identical. | EXECUTABLE |
| CSM-05 | A customer with populated optional fields is edited with a new normalized name/phone and blank optionals. | The trusted update changes name/phone and removes email, address, and notes. | EXECUTABLE |
| CSM-06 | `customers.update` changes only the name of a row with email, address, and notes. | Omitted optional fields are retained verbatim. | EXECUTABLE |
| CSM-07 | Customer two tries to adopt customer one's phone using international formatting. | The duplicate update rejects with a full unchanged snapshot. | EXECUTABLE |
| CSM-08 | Managers and Admin query two branch datasets through `customers.list`. | Manager sees only Cairo, explicit Giza access rejects, and Admin can request Giza. | EXECUTABLE |
| CSM-09 | Manager and Admin try to deactivate the same customer. | Manager lacks `delete_customers`; Admin succeeds and exactly one deactivation Audit row is added. | EXECUTABLE |
| CSM-10 | A legacy customer stores `balance=999` and `totalPurchases=5000`. | Both `customers.list` and `customers.get` omit both legacy fields at runtime. | EXECUTABLE |
| CSM-11 | Admin creates a supplier with Arabic digits and untidy contact text. | Supplier contact fields are canonicalized and stored without trusting UI formatting. | EXECUTABLE |
| CSM-12 | A supplier duplicate is submitted using `+20` formatting. | Global canonical duplicate detection rejects and preserves the full snapshot. | EXECUTABLE |
| CSM-13 | Supplier name/phone are edited while email/address/notes are omitted. | Edited fields normalize and all omitted optional fields survive. | EXECUTABLE |
| CSM-14 | Supplier two tries to adopt supplier one's canonical phone. | `suppliers.update` rejects and no DB or Audit state changes. | EXECUTABLE |
| CSM-15 | Manager and Admin try supplier deactivation. | `delete_suppliers` blocks Manager; Admin deactivates the durable supplier row. | EXECUTABLE |
| CSM-16 | One supplier has balances 125 and 75 in two branches. | Branch manager sees only `{supplierId,balance}` for Cairo, cross-branch access rejects, Admin reads Giza explicitly. | EXECUTABLE |
| CSM-17 | Two actual supplier ledger entries are queried with `numItems=1`. | Convex cursors return distinct pages; runtime allowlist excludes idempotency, user, raw reference, and reversal-link fields. | EXECUTABLE |
| CSM-18 | Two active branches plus one inactive branch are queried by Admin and Manager. | Admin receives both active branches, Manager receives its own branch only, inactive branch is absent. | EXECUTABLE |
| CSM-19 | A viewer has `view_suppliers` but not `view_supplier_ledger`. | Both ledger and branch balance queries reject without exposing financial data. | EXECUTABLE |
| CSM-20 | A legacy supplier stores a nonzero `balance`. | Supplier `list` and `get` runtime DTOs omit the legacy balance. | EXECUTABLE |
