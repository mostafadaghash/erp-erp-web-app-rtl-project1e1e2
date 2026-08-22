# Fresh Start customer deployment

Every sold customer receives a dedicated clean deployment. Staging fixtures, restore-drill data, demo products, and another customer's records must never be used as a customer template.

## Mandatory evidence sequence

1. Create a new dedicated Convex deployment and deploy the exact approved release commit.
2. Configure `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` outside source control.
3. Before the first login or setup action, run the read-only blank audit:

```bash
npm run fresh-start:audit -- \
  --deployment <customer-deployment> \
  --environment staging \
  --phase blank \
  --confirm <customer-deployment> \
  --release-commit <40-character-release-sha>
```

4. Create only the first administrator, business settings, branches, zero-balance financial accounts, and permitted zero-value ledger setup through the normal application UI.
5. Run the initialized audit with the same deployment and commit:

```bash
npm run fresh-start:audit -- \
  --deployment <customer-deployment> \
  --environment staging \
  --phase initialized \
  --confirm <customer-deployment> \
  --release-commit <40-character-release-sha>
```

6. Attach both JSON files from `test-results/fresh-start/` to the Fresh Start release evidence.
7. Take and verify the customer's pre-launch backup. Record the approved launch timestamp before allowing normal business writes.

## What the initialized audit permits

Only authentication/profile, branding/settings, branches, zero-value finance/general-ledger configuration, chart-of-account setup, accounting periods, and audit history may exist. Products, inventory movements, customers, suppliers, invoices, purchases, returns, orders, repairs, expenses, collections, balances, COD, and every other operational table must remain empty.

Financial accounts must have zero current balances. Any recorded non-zero general-ledger opening fails the gate.

## Safety properties

- The command is read-only and uses bounded presence checks for business tables.
- `--confirm` must exactly match the explicit target deployment.
- Evidence is bound to a full release commit SHA.
- The legacy `seedDemo` mutation is not shipped. Disposable test data belongs only to the guarded Staging fixture workflow.
- A failed audit blocks customer handover and Production launch; it never deletes or resets data automatically.
