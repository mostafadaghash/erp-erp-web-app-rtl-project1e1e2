# Role-based UAT Scenarios

Run these scenarios against the isolated Staging deployment using synthetic data. Record tester, date, branch, browser/device, evidence, and pass/fail for every scenario. Do not use Production as a UAT environment.

## Evidence header

For each test record:

- Release candidate commit SHA:
- Staging frontend URL:
- Convex Staging deployment:
- Tester:
- Role:
- Assigned branch(es):
- Date/time:
- Browser/device:
- Result: PASS / FAIL
- Evidence / issue reference:

## 1. Admin

1. Sign in and confirm the dashboard opens without unauthorized errors.
2. View branches and switch the active working branch.
3. Create or invite a synthetic employee and assign a non-admin role/branch.
4. Disable the synthetic employee and confirm that disabled access is rejected.
5. Verify the last-admin protection prevents removing the final administrator.
6. Open employee permissions and confirm role/module permissions match the intended matrix.
7. Open Audit Log and confirm sensitive administrative actions are recorded.
8. Open Settings and verify only intended configuration is editable.
9. Open products, customers, invoices, orders, repairs, deliveries/COD, treasury and reports.
10. Confirm cross-branch data visibility follows explicit Admin/branch behavior rather than accidental leakage.

## 2. Manager

1. Sign in as a manager attached to a specific branch.
2. Confirm operational modules visible to the manager match the role definition.
3. Create a synthetic customer in the assigned branch.
4. Prepare and save a sales invoice using an in-stock test product.
5. Create/update an order through its allowed lifecycle.
6. Open purchase/shipment operations allowed to the manager and verify denied operations remain hidden/blocked.
7. Record an allowed collection/disbursement/transfer test where the configured permissions permit it.
8. Create a sales return/credit note against an eligible synthetic invoice.
9. Verify branch-level financial and operational reports do not leak another branch unless deliberately authorized.
10. Confirm administrative employee/user actions that require higher permission are unavailable.

## 3. Accountant

1. Sign in as Accountant and verify finance/reporting modules are available while unrelated admin controls remain restricted.
2. Review financial accounts and balances for the assigned/authorized branch scope.
3. Record a synthetic collection and disbursement through allowed financial accounts.
4. Execute a permitted transfer and verify both sides of the movement.
5. Create an expense, then void/reverse it through the supported audited path.
6. Create/refund a permitted sales-return cash movement and verify balances.
7. Review customer ledger and statement totals.
8. Review supplier ledger, purchase receipt and supplier payment flows.
9. Review General Ledger/journal reports and confirm opening/operational totals reconcile.
10. Review COD settlements and permitted reversal behavior.
11. Export an allowed report/data set and verify restricted data is not exposed beyond the role.
12. Confirm direct operational functions not granted to Accountant are unavailable.

## 4. Sales

1. Sign in as Sales in one branch.
2. Confirm products/customers/orders/invoices are available.
3. Verify sell prices are visible while profit/cost information is not exposed.
4. Create a customer.
5. Create a sales invoice from an in-stock product.
6. Record an initial/allowed collection if the configured Sales permission allows it.
7. Create and edit an order through the permitted states.
8. Print an eligible invoice/order.
9. Confirm sales-return, finance administration, employee administration, audit logs and profit reports are denied unless explicitly granted.
10. Attempt to access another branch's data and confirm rejection/no data leakage.

## 5. Customer service

1. Sign in as Customer Service.
2. Search/create/edit customer records as allowed.
3. Create/edit an order through the supported customer-service flow.
4. Create a repair intake with customer/device/problem details.
5. Verify product price visibility matches the role.
6. Verify finance administration, profit data and employee administration are not exposed.
7. Verify branch scope is respected.

## 6. Technician

1. Sign in as Technician.
2. Confirm Repairs and permitted product lookup are visible.
3. Open an assigned repair and verify device/customer information required for service is available.
4. Update permitted repair details/diagnosis.
5. Move a repair through valid lifecycle transitions only.
6. Confirm invalid/skipped repair status transitions are rejected.
7. Complete diagnosis/quality fields required before Ready.
8. Print an eligible repair receipt/document.
9. Confirm invoice/customer-finance/admin modules outside the technician role are unavailable.
10. Confirm repairs outside permitted branch scope are not exposed.

## 7. Shipping / COD

1. Sign in as Shipping.
2. Confirm orders, inbound shipments and deliveries are visible as permitted.
3. Create/update an allowed shipment or delivery using synthetic data.
4. Verify purchase receipt posting is only available where the permission permits it.
5. Create a delivery from an eligible order/invoice.
6. Move a delivery from pending to shipped.
7. Confirm COD delivery/settlement actions appear only according to permissions.
8. Print delivery/COD documents allowed to the role.
9. Confirm finance administration, profit data and employee management remain blocked.
10. Confirm branch isolation.

## 8. Viewer / read-only

1. Sign in as Viewer.
2. Confirm only the intended read-only modules are visible.
3. Open products, customers, orders, repairs and invoices as permitted.
4. Verify create/edit/delete buttons are absent or disabled.
5. Attempt direct navigation or action invocation for a write operation and confirm backend rejection.
6. Verify prices/profits/financial data are not exposed unless explicitly included in Viewer permissions.
7. Verify print/export functions not granted to Viewer are unavailable.
8. Confirm branch restrictions remain enforced.

## 9. Cross-role permission negative tests

For at least one account in every non-admin role:

1. Attempt a UI action not granted by the role and verify it is not available.
2. Attempt the equivalent backend/API action through the normal application path where practical and verify server-side rejection.
3. Verify `view_prices` and `view_profits` independently affect exposed product/financial fields.
4. Verify print permissions independently protect invoice, repair, credit-note, purchase-return and COD output where applicable.
5. Verify export permission independently protects export operations.

## 10. Branch isolation

Use two synthetic branches A and B with distinct customers, products/stock where applicable, invoices, repairs and financial accounts.

1. Create representative data in A.
2. Sign in as a user restricted to B.
3. Search/list/get the A records through every relevant UI entry point and confirm they are absent/rejected.
4. Attempt to reference an A financial account from a B transaction and confirm rejection.
5. Attempt cross-branch repair/customer/order/invoice/COD relationships and confirm rejection.
6. Repeat with Manager/Sales/Accountant/Shipping role scopes as applicable.

## 11. Printing acceptance

### A4

1. Invoice print preview is RTL and fits expected A4 width.
2. Order print preview is readable and not clipped.
3. Repair print preview contains required receipt/service fields.
4. Credit note/purchase return/COD printouts obey their permissions.
5. Perform at least one physical A4 print.

### Thermal

1. Use the actual target thermal printer and paper width.
2. Verify RTL Arabic shaping, totals, item wrapping, barcode/number fields if present, and no horizontal clipping.
3. Verify long customer/product names wrap correctly.
4. Verify print permission enforcement from a restricted role.
5. Record printer model/driver/paper width and attach a photo or scanned sample.

Physical thermal acceptance is mandatory because browser emulation alone does not prove printer-driver behavior.

## 12. Mobile / RTL / accessibility smoke

1. Test the main flows on a real phone as well as Playwright mobile emulation.
2. Confirm there is no unintended horizontal page overflow.
3. Confirm dialogs/forms remain usable with the on-screen keyboard.
4. Confirm primary actions remain reachable without hidden/off-screen controls.
5. Tab through login and representative forms with a physical keyboard and confirm visible focus.
6. Verify Arabic/English mixed values (phone, SKU, document numbers, money) remain readable.

## 13. End-to-end business-day scenario

Using only synthetic Staging records, execute one representative day:

1. Receive or prepare purchasable stock.
2. Create customers.
3. Create sales invoice and collection.
4. Create an order and delivery/COD path.
5. Create and progress a repair.
6. Create an expense.
7. Create one sales return/refund where eligible.
8. Create/settle one supplier or COD financial flow where configured.
9. Review inventory, customer, supplier, treasury and general-ledger totals.
10. Run end-of-day reports and reconcile them to the operations above.

Any unexplained financial/inventory difference is a release blocker.
