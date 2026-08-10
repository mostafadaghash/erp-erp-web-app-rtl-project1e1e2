# Migration Reconciliation Sign-off

Use this checklist after every Staging migration rehearsal and again during Production cutover. The migration is not accepted merely because the import/write process completed; source controls and target read models must reconcile.

## Evidence identity

- Release candidate commit SHA:
- Migration `migrationRunId`:
- Migration fingerprint:
- Cutover date:
- Source system/export identifier:
- Target Convex deployment:
- Pre-migration backup SHA-256:
- Operator:
- Start/end time:

## 1. Package preflight

- [ ] `manifest.json` verifies successfully.
- [ ] `accepted.json` and mapping belong to the same fingerprint.
- [ ] `rejected.json` contains zero unresolved rows.
- [ ] Every intentionally excluded source row has a documented reason/approval.
- [ ] Every supplied control total has status `match` before write execution.
- [ ] Apply plan/order is the approved version for this rehearsal.

## 2. Branch master data

For every branch compare source and target:

- [ ] Branch code.
- [ ] Branch name/status.
- [ ] Expected branch count.
- [ ] No duplicate legacy mapping.
- [ ] No unexpected target-only branch introduced by migration.

## 3. Products and inventory

Per branch where inventory is branch-scoped, and consolidated where applicable:

- [ ] Product/SKU count.
- [ ] Unique SKU mapping.
- [ ] Total stock quantity.
- [ ] Stock quantity by SKU for a representative/high-value sample.
- [ ] Total inventory value.
- [ ] Cost/weighted-cost values required by the current inventory model.
- [ ] Supplier/product references resolve.
- [ ] No negative stock created by cutover.
- [ ] Opening inventory movements/value evidence is auditable.

Record:

| Metric | Source | Target | Difference | PASS/FAIL |
|---|---:|---:|---:|---|
| Product count | | | | |
| Stock quantity | | | | |
| Inventory value | | | | |

## 4. Customers

Per branch and consolidated:

- [ ] Customer count.
- [ ] Phone/key mapping uniqueness.
- [ ] Receivable opening balance.
- [ ] Customer advance/credit opening balance.
- [ ] No customer has contradictory receivable and advance openings.
- [ ] Customer ledger opening entries reconcile to customer master totals.

| Metric | Source | Target | Difference | PASS/FAIL |
|---|---:|---:|---:|---|
| Customer count | | | | |
| Receivables | | | | |
| Advances | | | | |

## 5. Suppliers

Per branch and consolidated:

- [ ] Supplier count/master mapping.
- [ ] Supplier payable/credit opening balance.
- [ ] Supplier ledger totals reconcile to supplier balances.
- [ ] Purchase/opening references resolve to the correct supplier and branch.

| Metric | Source | Target | Difference | PASS/FAIL |
|---|---:|---:|---:|---|
| Supplier count | | | | |
| Supplier payable | | | | |

## 6. Treasury, banks, wallets and clearing accounts

For every financial account:

- [ ] Account code/name/type.
- [ ] Branch assignment.
- [ ] Opening balance.
- [ ] Negative-balance policy.
- [ ] Clearing/settlement configuration where relevant.
- [ ] Sum of account openings equals the migration control total.
- [ ] Finance ledger movements/opening transactions reconcile to current balances.

| Account | Source | Target | Difference | PASS/FAIL |
|---|---:|---:|---:|---|
| | | | | |

## 7. COD

- [ ] Open COD held by carriers matches source control.
- [ ] Delivered/settled/reversed historical states are mapped according to approved cutover policy.
- [ ] COD clearing accounts reconcile with unsettled deliveries.
- [ ] No delivery is counted twice after retries/rebuilds.
- [ ] Settlement totals and carrier fees remain consistent with financial ledgers.

| Metric | Source | Target | Difference | PASS/FAIL |
|---|---:|---:|---:|---|
| COD with carriers | | | | |
| Settled COD (if migrated) | | | | |
| Carrier fees (if migrated) | | | | |

## 8. General Ledger / accounting bridge

- [ ] Finance opening balances reconcile to accounting openings.
- [ ] Customer receivables reconcile to the corresponding GL control account.
- [ ] Customer advances reconcile to their GL control account where used.
- [ ] Supplier payables reconcile to the supplier control account.
- [ ] Inventory value reconciles to the inventory control account where applicable.
- [ ] Cash/bank/wallet/clearing account balances reconcile to their GL accounts.
- [ ] Debits equal credits for migrated/opening journal entries.
- [ ] No opening entry is duplicated by a retry.

## 9. Reporting rebuild/reconciliation

After migration and before acceptance:

- [ ] Rebuild required reporting facts/statistics.
- [ ] Rebuild invoice statistics.
- [ ] Rebuild product/inventory statistics.
- [ ] Rebuild delivery/COD statistics.
- [ ] Rerun rebuilds once to prove idempotent results.
- [ ] Compare operational source totals with rebuilt reports.
- [ ] Investigate every unexplained difference rather than adjusting controls to force a match.

## 10. Sample document trace

Select representative records, including high-value and edge cases:

- [ ] Product with stock/value.
- [ ] Customer with receivable.
- [ ] Customer with advance.
- [ ] Supplier with payable/credit.
- [ ] Cash account.
- [ ] Bank/wallet account.
- [ ] COD open item.

For each sample trace the legacy key -> migration mapping -> target record -> ledger/report representation.

## 11. Rerun proof

- [ ] Restore the clean pre-migration Staging backup.
- [ ] Reapply the exact same migration package/fingerprint.
- [ ] Target totals match the first rehearsal.
- [ ] No duplicate opening balances/documents are produced.
- [ ] Any idempotency keys/run identifiers are unchanged for the same package.

## 12. Sign-off

All sections must be PASS or have an explicitly approved exception.

- Data/migration owner: PASS / FAIL — name/date:
- Accounting owner: PASS / FAIL — name/date:
- Inventory/operations owner: PASS / FAIL — name/date:
- Technical owner: PASS / FAIL — name/date:
- Final migration decision: GO / NO-GO

A NO-GO blocks Production cutover.
