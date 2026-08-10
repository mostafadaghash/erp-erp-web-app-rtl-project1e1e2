# Migration Cutover Toolkit

This toolkit prepares legacy ERP data for a controlled cutover into the current system. It is intentionally **write-disabled** inside the repository. Its job is to normalize, validate, map, reconcile, fingerprint, and produce an auditable apply plan before any staging write is allowed.

## Safety model

- The preparation CLI never imports Convex and never connects to a deployment.
- Real source files and generated packages are ignored by Git because they may contain business or personal data.
- The same normalized accepted data, source system, and cutover date always produce the same SHA-256 fingerprint and `migrationRunId`.
- A package cannot be considered ready if it contains rejected rows or supplied control-total differences.
- `apply-plan.json` always contains `writeEnabled: false` in this phase.
- Direct raw-table import is deliberately not implemented. Opening balances must eventually be posted through the application's controlled finance/customer/supplier/inventory cutover procedures so ledgers remain auditable.

## Input contract

Use JSON with `schemaVersion: 1`, `sourceSystem`, `cutoverDate`, and these arrays:

- `branches`
- `customers`
- `suppliers`
- `products`
- `financialAccounts`
- `cod`

See `migration/example.input.json` for a complete example.

### Branches

Required: `legacyId`, `code`, `name`. Optional: `address`, `phone`, `isActive`.

Branch codes are normalized to uppercase and become stable migration mapping keys.

### Customers

Required: `legacyId`, `branchCode`, `name`, `phone`.

Opening values:

- `receivableBalance`: amount owed by the customer.
- `advanceBalance`: customer credit/advance held by the business.

Both values cannot be positive at the same cutover point. Customer phone uniqueness is checked inside a branch.

### Suppliers

Required: `legacyId`, `name`, `phone`.

`balances` is an array of `{ branchCode, balance }`. Supplier master phone uniqueness is checked globally while balances remain branch-scoped.

### Products

Required: `legacyId`, `sku`, `name`, `stock`, `costPrice`, `sellPrice`.

Optional fields include `inventoryValue`, `supplierLegacyId`, `category`, `barcode`, `minStock`, and `unit`.

When `inventoryValue` is omitted, the dry-run derives it as `stock × costPrice`. This is only a migration preparation convenience; the source control total should still be supplied and reconciled before cutover.

### Financial accounts

Required: `legacyId`, `branchCode`, `code`, `name`, `type`, `balance`.

Supported types match the current finance schema: `cash`, `instapay`, `vodafone_cash`, `fawry_clearing`, `paymob_clearing`, `card_clearing`, `cod_clearing`, `bank`, and `other`.

A negative opening balance requires `allowNegative: true`.

### COD

Required: `legacyId`, `branchCode`, `carrier`, `amount`, `status`.

Supported preparation statuses are `with_carrier`, `settled`, and `reversed`. Only `with_carrier` contributes to the COD carrier-receivable cutover control total.

## Control totals

Provide as many of these as the legacy system can prove:

```json
{
  "controlTotals": {
    "stockQuantity": 0,
    "inventoryValue": 0,
    "customerReceivable": 0,
    "customerAdvance": 0,
    "supplierPayable": 0,
    "financialAccountBalance": 0,
    "codWithCarriers": 0
  }
}
```

Every supplied value is compared with the normalized accepted rows. Missing controls are reported as `not_provided`; they are not silently treated as matches.

## Running a dry-run

```bash
npm run migration:prepare -- \
  --input migration/input/legacy-cutover.json \
  --output migration/output/cutover-01 \
  --fail-on-rejects \
  --fail-on-differences
```

The command creates:

- `manifest.json` — package identity, fingerprint and row counts.
- `accepted.json` — normalized rows eligible for mapping.
- `rejected.json` — rejected source rows with explicit reasons and original row snapshot.
- `mapping.json` — stable legacy-key → canonical-key mappings, without pretending database IDs exist yet.
- `reconciliation.json` — actual versus supplied control totals and differences.
- `apply-plan.json` — ordered cutover steps with writes explicitly disabled.

The command never writes application data.

## Verify a prepared package

```bash
npm run migration:verify -- migration/output/cutover-01
```

The verifier recomputes the accepted-data fingerprint, verifies `migrationRunId`, row counts, reconciliation status, and confirms the apply plan is still write-disabled.

For repository acceptance, the included synthetic package can be run end-to-end:

```bash
npm run migration:example
```

## Re-run / idempotency contract

If source data, cutover date and normalization result do not change:

- `fingerprint` does not change.
- `migrationRunId` does not change.
- accepted canonical records do not change.
- mapping keys do not change.

If any accepted business data changes, the fingerprint changes and the operator must treat it as a new migration package. This prevents accidentally mixing reconciliation evidence from two source snapshots.

## Cutover order on Staging

The generated `apply-plan.json` orders the live phase as follows:

1. Create/resolve branches.
2. Create/resolve supplier masters.
3. Create/resolve branch customer masters.
4. Create/resolve products and opening stock/value.
5. Create financial accounts and post finance opening balances.
6. Post customer ledger openings.
7. Post supplier ledger openings.
8. Reconcile COD carrier receivables before activation.

The live executor is intentionally not part of this write-disabled repository phase. It must be connected to the actual Staging deployment and should call controlled application APIs rather than bulk-importing ledger tables.

## Required reconciliation before accepting Staging migration

After the live application step, compare the source control package against the deployed read models for every branch and consolidated total:

- item count, stock quantity, weighted inventory value and SKU mapping;
- customer count, receivables and advances;
- supplier count and branch supplier payable;
- each cash/bank/wallet/clearing account and consolidated balance;
- COD still held by carriers;
- finance and general-ledger opening totals once those bridges are enabled;
- all rejected source rows must have a documented resolution or intentional exclusion.

A retry must not double opening balances. The same `migrationRunId` and fingerprint must be retained through the live execution log.

## What remains live-only

This toolkit does not claim to execute migration against a real database. The following remain for the staging/laptop phase:

- obtain the final frozen legacy export;
- transform Excel/CSV source files into the JSON contract when their exact columns are known;
- run dry-run and resolve all rejected rows/differences;
- back up the target Staging deployment;
- run the controlled write adapter against Staging;
- run post-write reconciliation queries;
- repeat from a restored clean Staging copy to prove rerun behavior;
- only after UAT sign-off, repeat the same frozen package and fingerprint during Production cutover.
