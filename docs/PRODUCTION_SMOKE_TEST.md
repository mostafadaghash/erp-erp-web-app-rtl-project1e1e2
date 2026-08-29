# Production Smoke Test

Run this checklist only after GO approval and deployment of the exact frozen release commit. Use an isolated synthetic branch/customer/product and remove or clearly retain the records as launch evidence according to the agreed policy.

## Identity and deployment

- Record the Git commit, frontend deployment, Convex deployment, time, and operator.
- Confirm the frontend is bound to the intended Production Convex deployment.
- Confirm CSP, HSTS, CORS, anti-framing, and allowed-host behavior.

## Authentication and authorization

- Login and logout with the Production Admin.
- Confirm a disabled synthetic user is rejected.
- Confirm one restricted role cannot reach an Admin action or another branch.

## Safe read path

- Open Dashboard, products, customers, sales, purchases, inventory, accounts, reports, repairs, and shipping/COD.
- Confirm there are no unexpected console/backend errors.
- Confirm totals agree with the approved post-cutover reconciliation.

## Controlled write path

- Create one synthetic customer.
- Create one synthetic product/opening stock row in the approved launch branch.
- Create one small invoice and collection using the designated smoke-test account.
- Create and reverse/cancel only through the supported audited path.
- Confirm inventory, treasury, customer ledger, General Ledger, document numbering, and Audit Log agree after the cycle.

## Printing

- Preview one invoice and one financial/return document.
- Confirm Arabic RTL layout and the approved A4/thermal profile.

## Closeout

- Record PASS/FAIL for every check and attach evidence.
- Any unexplained financial, inventory, authorization, or deployment-binding difference is immediate NO-GO and invokes the rollback/incident runbook.
- Expand user access only after the smoke test is PASS.
