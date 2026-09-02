# Wave 0 — Golden Dataset & Executable Business Journey Vectors

## 1. Purpose

Wave 0 needs a small deterministic dataset whose expected financial and inventory outcomes are explicit, technology-neutral and cheap to run on every refactor. It complements, rather than replaces, the existing Convex integration suites.

The Golden Dataset is **not** a production backup and is **not** a target PostgreSQL schema fixture.

## 2. Files

- `tests/fixtures/wave0-golden-snapshot.json` — normalized deterministic accounting/inventory snapshot.
- `tests/fixtures/wave0-golden-business-journeys.json` — maps protected business journeys to numeric golden facts and existing executable repository tests.
- `tests/wave0GoldenReconciliation.test.ts` — executes the reconciliation runner, validates historical-cost facts, proves fail-closed behavior and ensures all mapped adapter tests exist.
- `scripts/wave0/reconcile-snapshot.mjs` — read-only replay checker from the reconciliation-pack PR.

## 3. Numeric golden story

The inventory story deliberately proves both MWA and historical return costing:

1. Opening: `10 @ 100` → qty `10`, value `1000`, average `100`.
2. Receipt: `10 @ 120` → qty `20`, value `2200`, MWA `110`.
3. Sale: `2` units with frozen sale cost `110` → COGS `220`, qty `18`, value `1980`.
4. Later receipt: `2 @ 140` → qty `20`, value `2260`, current MWA `113`.
5. Sales return: return `1` unit from the original sale at **historical cost 110**, not current MWA 113 → qty `21`, value `2370`, ending average `112.8571`.

This vector makes a future accidental "return at current cost" change visible immediately.

The same fixture includes balanced GL journals, customer receivable replay, supplier payable replay, and cash/bank movement replay.

## 4. Business journey selection

Wave 0 only promotes journeys that protect behavior already present in the current legacy system: inventory costing, sales/returns, customer collection, supplier purchasing/payment, treasury, COD, repairs, permissions, migration and historical reporting.

The vector manifest references the IDs in the approved V1 Business Journey Acceptance Matrix but does not claim full future-state acceptance. In particular:

- J-01/J-02 true Company/Tenant setup is not implemented in Wave 0.
- J-27/J-28 ETA eInvoice/eReceipt are not implemented in Wave 0.
- J-29/J-30 Local Server/WAN operation are not implemented in Wave 0.
- Browser/Pilot/Production acceptance remains separate evidence from these behavioral vectors.

## 5. Execution

The repository's normal `npm test` command includes `tests/wave0GoldenReconciliation.test.ts` because the current test script runs `tests/*.test.ts`. It also executes the existing integration tests referenced by the journey manifest.

A direct read-only reconciliation run can use:

```text
node scripts/wave0/reconcile-snapshot.mjs --input tests/fixtures/wave0-golden-snapshot.json
```

Success is a report with `status: PASS` and zero failures. The test suite also changes the ending inventory projection deliberately and verifies that the checker fails rather than normalizing the discrepancy away.

## 6. Change rule

Changing a golden expected amount is a business-behavior change unless evidence proves the old expectation was wrong. Such a change must not be hidden inside an architecture refactor.

When the future architecture is introduced, the same logical vectors should run against the new Application/Repository adapters while the legacy integration suite remains the comparison baseline until parity is demonstrated.
