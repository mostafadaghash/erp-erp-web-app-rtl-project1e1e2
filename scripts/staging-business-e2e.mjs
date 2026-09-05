import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  launchStagingBrowser,
  observeRuntimeFailures,
  redactEvidence,
  safeScreenshot,
  signIn,
  stagingConfig,
} from "./staging-browser-e2e.mjs";

const outputRoot = resolve("test-results/staging-business-e2e");
const requiredFixtureStrings = [
  "dataset",
  "branchName",
  "customerName",
  "productName",
  "supplierName",
  "cashAccountName",
  "codAccountName",
  "settlementAccountName",
  "city",
  "address",
  "shippingCompany",
];

const scenarios = [
  "invoice_collection_sales_return",
  "invoice_collection_refund",
  "purchase_receipt_return_supplier_payment",
  "repair_collection",
  "order_delivery_cod_settlement",
  "expense_disbursement",
];

const navigationTargets = {
  salesInvoices: { group: "sales", item: "invoices", page: "invoices-page" },
  salesReturns: { group: "sales", item: "sales-returns", page: "sales-returns-page" },
  orders: { group: "sales", item: "orders", page: "orders-page" },
  newPurchase: { group: "purchases", item: "new-purchase-invoice", page: "new-purchase-invoice-page" },
  purchases: { group: "purchases", item: "shipments", page: "shipments-page" },
  purchaseReturns: { group: "purchases", item: "purchase-returns", page: "purchase-returns-page" },
  supplierPayments: { group: "accounting", item: "supplier-payments", page: "supplier-payments-page" },
  repairs: { group: "service", item: "repairs", page: "repairs-page" },
  deliveries: { group: "shipping", item: "deliveries", page: "deliveries-page" },
  expenses: { group: "accounting", item: "expenses", page: "expenses-page" },
};

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function businessConfig() {
  const staging = stagingConfig();
  assert.equal(
    process.env.E2E_MUTATIONS_CONFIRMED,
    "isolated-staging-only",
    "E2E_MUTATIONS_CONFIRMED must equal isolated-staging-only",
  );

  let fixtures;
  try {
    fixtures = JSON.parse(process.env.E2E_BUSINESS_FIXTURES_JSON ?? "");
  } catch {
    throw new Error("E2E_BUSINESS_FIXTURES_JSON must be valid JSON");
  }
  assert.ok(fixtures && typeof fixtures === "object" && !Array.isArray(fixtures));
  for (const field of requiredFixtureStrings) {
    assert.ok(
      typeof fixtures[field] === "string" && fixtures[field].trim(),
      `Missing business fixture: ${field}`,
    );
  }
  assert.equal(
    fixtures.dataset,
    "disposable-staging",
    "Business E2E requires a disposable-staging dataset",
  );
  const accountBranchName = process.env.E2E_ACCOUNT_BRANCH_NAME?.trim();
  if (accountBranchName) {
    assert.equal(
      accountBranchName,
      fixtures.branchName,
      "E2E_ACCOUNT_BRANCH_NAME must match E2E_BUSINESS_FIXTURES_JSON.branchName",
    );
  }

  const operationDate = fixtures.operationDate ?? new Date().toISOString().slice(0, 10);
  assert.ok(isIsoDate(operationDate), "operationDate must be a real ISO date");
  const purchaseUnitCost = fixtures.purchaseUnitCost ?? 10;
  const invoiceCollectionAmount = fixtures.invoiceCollectionAmount ?? 1;
  const repairLaborCost = fixtures.repairLaborCost ?? 20;
  const repairCollectionAmount = fixtures.repairCollectionAmount ?? 5;
  const expenseAmount = fixtures.expenseAmount ?? 1;
  const orderUnitPrice = fixtures.orderUnitPrice ?? 100;
  for (const [name, value] of Object.entries({
    purchaseUnitCost,
    invoiceCollectionAmount,
    repairLaborCost,
    repairCollectionAmount,
    expenseAmount,
    orderUnitPrice,
  })) {
    assert.ok(Number.isFinite(value) && value > 0 && value <= 100_000, `${name} must be a bounded positive number`);
    assert.equal(Math.round(value * 100), value * 100, `${name} must have at most two decimals`);
  }
  assert.ok(repairCollectionAmount <= repairLaborCost, "Repair collection cannot exceed labor cost");

  const manager = staging.accounts.find((account) => account.role === "manager");
  const accountant = staging.accounts.find((account) => account.role === "accountant");
  assert.ok(manager, "The mutable business suite requires the branch manager E2E account");
  assert.ok(accountant, "The mutable business suite requires the accountant E2E account");
  return {
    ...staging,
    operator: manager,
    financialOperator: accountant,
    fixtures: {
      ...fixtures,
      operationDate,
      purchaseUnitCost,
      invoiceCollectionAmount,
      repairLaborCost,
      repairCollectionAmount,
      expenseAmount,
      orderUnitPrice,
    },
  };
}

async function stableSelector(locator) {
  const testId = await locator.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;
  const aria = await locator.getAttribute("aria-label");
  if (aria) return `[aria-label="${aria.replaceAll('"', '\\"')}"]`;
  throw new Error("Mutable E2E select requires a stable selector");
}

async function selectContaining(select, expected) {
  await select.waitFor({ state: "visible", timeout: 30_000 });
  await select.page().waitForFunction(
    ({ selector, text }) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLSelectElement && [...element.options].some((option) => option.text.trim().includes(text));
    },
    { selector: await stableSelector(select), text: expected },
    { timeout: 30_000 },
  );
  const options = await select.locator("option").evaluateAll((rows) =>
    rows.map((row) => ({ value: row.value, label: row.textContent?.trim() ?? "" })),
  );
  const match = options.find((option) => option.value && option.label.includes(expected));
  assert.ok(match, `Missing option containing: ${expected}`);
  await select.selectOption(match.value);
  return match;
}

async function selectExact(select, expected) {
  await select.waitFor({ state: "visible", timeout: 30_000 });
  await select.page().waitForFunction(
    ({ selector, text }) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLSelectElement && [...element.options].some((option) => option.value && option.text.trim() === text);
    },
    { selector: await stableSelector(select), text: expected },
    { timeout: 30_000 },
  );
  const options = await select.locator("option").evaluateAll((rows) =>
    rows.map((row) => ({ value: row.value, label: row.textContent?.trim() ?? "" })),
  );
  const matches = options.filter((option) => option.value && option.label === expected);
  assert.equal(matches.length, 1, `Expected exactly one option named: ${expected}`);
  await select.selectOption(matches[0].value);
  return matches[0];
}

async function attributeSet(locator, attribute) {
  const count = await locator.count();
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const value = await locator.nth(index).getAttribute(attribute);
    if (value) values.push(value);
  }
  return new Set(values);
}

async function entityByAttribute(page, testId, attribute, value) {
  await page.waitForFunction(
    ({ testId: id, attribute: field, value: expected }) =>
      [...document.querySelectorAll(`[data-testid="${id}"]`)].some(
        (element) => element.getAttribute(field) === expected,
      ),
    { testId, attribute, value },
    { timeout: 30_000 },
  );
  const rows = page.getByTestId(testId);
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    if ((await rows.nth(index).getAttribute(attribute)) === value) return rows.nth(index);
  }
  throw new Error(`Cannot resolve ${testId} by ${attribute}`);
}

async function waitForNewEntity(page, testId, attribute, before) {
  const previous = [...before];
  await page.waitForFunction(
    ({ testId: id, attribute: field, previous: old }) =>
      [...document.querySelectorAll(`[data-testid="${id}"]`)].some((element) => {
        const value = element.getAttribute(field);
        return value && !old.includes(value);
      }),
    { testId, attribute, previous },
    { timeout: 45_000 },
  );
  const rows = page.getByTestId(testId);
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const value = await rows.nth(index).getAttribute(attribute);
    if (value && !before.has(value)) return { locator: rows.nth(index), value };
  }
  throw new Error(`No new ${testId} appeared`);
}

async function waitForEntityState(page, testId, identityAttribute, identity, stateAttribute, state) {
  await page.waitForFunction(
    ({ testId: id, identityAttribute: key, identity: value, stateAttribute: field, state: expected }) =>
      [...document.querySelectorAll(`[data-testid="${id}"]`)].some(
        (element) => element.getAttribute(key) === value && element.getAttribute(field) === expected,
      ),
    { testId, identityAttribute, identity, stateAttribute, state },
    { timeout: 45_000 },
  );
  return entityByAttribute(page, testId, identityAttribute, identity);
}

async function waitForToast(page, message) {
  const toast = page.getByText(message, { exact: false }).last();
  await toast.waitFor({ state: "visible", timeout: 45_000 });
  return toast.innerText();
}

async function openNavigationGroup(page, groupKey) {
  const navigation = page.getByRole("navigation", { name: "القائمة الرئيسية" });
  const group = navigation.getByTestId(`nav-group-${groupKey}`);
  await group.waitFor({ state: "visible", timeout: 30_000 });
  if ((await group.getAttribute("aria-expanded")) !== "true") await group.click();
  return navigation;
}

async function navigate(page, targetKey) {
  const target = navigationTargets[targetKey];
  assert.ok(target, `Unknown navigation target: ${targetKey}`);
  const navigation = await openNavigationGroup(page, target.group);
  const button = navigation.getByTestId(`nav-${target.item}`);
  await button.waitFor({ state: "visible", timeout: 30_000 });
  await button.click();
  await page.getByTestId(target.page).waitFor({ state: "visible", timeout: 45_000 });
}

async function chooseCombobox(input, query, expectedLabel) {
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.fill(query);
  await input.press("Enter");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await input.inputValue()) === expectedLabel) return;
    await input.page().waitForTimeout(50);
  }
  assert.equal(await input.inputValue(), expectedLabel, `Combobox did not select: ${expectedLabel}`);
}

async function exactProductResult(page, productName) {
  const results = page.getByTestId("invoice-product-result");
  await page.waitForFunction(
    (name) => [...document.querySelectorAll('[data-testid="invoice-product-result"]')].some((element) => element.getAttribute("data-product-name") === name),
    productName,
    { timeout: 30_000 },
  );
  const count = await results.count();
  for (let index = 0; index < count; index += 1) {
    if ((await results.nth(index).getAttribute("data-product-name")) === productName) return results.nth(index);
  }
  throw new Error(`Product picker did not return ${productName}`);
}

async function addInvoiceProduct(page, productName) {
  await page.getByTestId("invoice-product-search").fill(productName);
  await (await exactProductResult(page, productName)).click();
}

async function createInvoice(page, fixtures, marker, quantity) {
  const before = await attributeSet(page.getByTestId("invoice-row"), "data-invoice-number");
  await page.getByTestId("invoices-page").getByRole("button", { name: "فاتورة بيع جديدة", exact: true }).click();
  await page.getByTestId("new-invoice-page").waitFor({ state: "visible", timeout: 30_000 });
  await selectContaining(page.getByTestId("invoice-customer-select"), fixtures.customerName);
  for (let index = 0; index < quantity; index += 1) await addInvoiceProduct(page, fixtures.productName);
  await page.getByTestId("invoice-notes").fill(marker);
  const rawTotal = Number(await page.getByTestId("new-invoice-total").getAttribute("data-value"));
  assert.ok(Number.isFinite(rawTotal) && rawTotal > fixtures.invoiceCollectionAmount);
  const total = Number(rawTotal.toFixed(2));
  await page.getByTestId("invoice-payment-method").selectOption("credit");
  await page.getByTestId("invoice-submit").click();
  await waitForToast(page, "تم إنشاء الفاتورة بنجاح");
  await page.getByTestId("invoices-page").waitFor({ state: "visible", timeout: 30_000 });
  const created = await waitForNewEntity(page, "invoice-row", "data-invoice-number", before);
  return { number: created.value, total };
}

async function collectInvoice(page, fixtures, invoice, marker) {
  const row = await entityByAttribute(page, "invoice-row", "data-invoice-number", invoice.number);
  await row.getByTestId("invoice-collect").click();
  await page.getByTestId("invoice-collection-form").waitFor();
  await page.getByTestId("invoice-collection-amount").fill(String(fixtures.invoiceCollectionAmount));
  await selectContaining(page.getByTestId("invoice-collection-account"), fixtures.cashAccountName);
  await page.getByTestId("invoice-collection-date").fill(fixtures.operationDate);
  await page.getByTestId("invoice-collection-notes").fill(marker);
  await page.getByTestId("invoice-collection-submit").click();
  await waitForToast(page, "تم التحصيل");
  await page.getByTestId("invoice-collection-form").waitFor({ state: "detached" });
}

async function refundInvoice(page, fixtures, invoice, marker) {
  const row = await entityByAttribute(page, "invoice-row", "data-invoice-number", invoice.number);
  const paidBefore = Number(await row.getAttribute("data-paid"));
  assert.ok(paidBefore >= fixtures.invoiceCollectionAmount);
  await row.getByTestId("invoice-refund").click();
  await page.getByTestId("invoice-refund-form").waitFor();
  await page.getByTestId("invoice-refund-amount").fill(String(fixtures.invoiceCollectionAmount));
  await selectContaining(page.getByTestId("invoice-refund-account"), fixtures.cashAccountName);
  await page.getByTestId("invoice-refund-date").fill(fixtures.operationDate);
  await page.getByTestId("invoice-refund-reason").fill(marker);
  await page.getByTestId("invoice-refund-submit").click();
  await waitForToast(page, "تم الاسترداد");
  await page.getByTestId("invoice-refund-form").waitFor({ state: "detached" });
  const expectedPaid = Number((paidBefore - fixtures.invoiceCollectionAmount).toFixed(2));
  await page.waitForFunction(
    ({ number, expected }) => [...document.querySelectorAll('[data-testid="invoice-row"]')].some(
      (element) => element.getAttribute("data-invoice-number") === number && Number(element.getAttribute("data-paid")) === expected,
    ),
    { number: invoice.number, expected: expectedPaid },
    { timeout: 45_000 },
  );
  return expectedPaid;
}

async function createSalesReturn(page, fixtures, invoice, marker) {
  await navigate(page, "salesReturns");
  await page.getByTestId("sales-return-new").click();
  const picker = page.getByTestId("sales-return-invoice-picker");
  await picker.waitFor({ state: "visible", timeout: 30_000 });
  const starts = picker.getByTestId("sales-return-start");
  await page.waitForFunction(
    (number) => [...document.querySelectorAll('[data-testid="sales-return-invoice-picker"] [data-testid="sales-return-start"]')].some((element) => element.getAttribute("data-invoice-number") === number),
    invoice.number,
    { timeout: 45_000 },
  );
  const count = await starts.count();
  let selected = false;
  for (let index = 0; index < count; index += 1) {
    if ((await starts.nth(index).getAttribute("data-invoice-number")) === invoice.number) {
      await starts.nth(index).click();
      selected = true;
      break;
    }
  }
  assert.ok(selected, `Sales return picker did not expose invoice ${invoice.number}`);
  const form = page.getByTestId("sales-return-form");
  await form.waitFor({ state: "visible", timeout: 30_000 });
  await form.getByLabel(`كمية إرجاع ${fixtures.productName}`).fill("1");
  await page.getByTestId("sales-return-reason").fill(marker);
  await page.getByTestId("sales-return-submit").click();
  await waitForToast(page, "تم إنشاء مرتجع البيع وإعادة المخزون");
  await form.waitFor({ state: "detached" });
}

async function transitionOrder(page, orderNumber, state) {
  let row = await entityByAttribute(page, "order-row", "data-order-number", orderNumber);
  await row.getByTestId("order-action-toggle").click();
  const menu = row.getByTestId("order-actions-menu");
  await menu.waitFor({ state: "visible", timeout: 30_000 });
  const action = menu.locator(`[data-status-action="${state}"]`);
  await action.waitFor({ state: "visible", timeout: 30_000 });
  await action.click();
  row = await waitForEntityState(page, "order-row", "data-order-number", orderNumber, "data-status", state);
  assert.equal(await row.getAttribute("data-status"), state);
}

async function createOrderAndLinkedInvoice(page, fixtures, marker) {
  await navigate(page, "salesInvoices");
  const invoicesBefore = await attributeSet(page.getByTestId("invoice-row"), "data-invoice-number");
  await navigate(page, "orders");
  const ordersBefore = await attributeSet(page.getByTestId("order-row"), "data-order-number");
  await page.getByTestId("order-create-open").click();
  const submit = page.getByTestId("order-intake-submit");
  await submit.waitFor({ state: "visible", timeout: 30_000 });

  const customerInput = page.getByPlaceholder("ابحث باسم العميل أو الهاتف...", { exact: true });
  await chooseCombobox(customerInput, fixtures.customerName, fixtures.customerName);
  const item = page.getByTestId("order-intake-item").first();
  const productInput = item.getByPlaceholder("الصنف...", { exact: true });
  await chooseCombobox(productInput, fixtures.productName, fixtures.productName);
  await item.getByTestId("order-intake-quantity").fill("1");
  await page.getByTestId("order-internal-notes").fill(marker);
  await submit.click();
  await waitForToast(page, "تم إنشاء طلب البيع وإضافته للمتابعة");

  const createdOrder = await waitForNewEntity(page, "order-row", "data-order-number", ordersBefore);
  let row = createdOrder.locator;
  await row.getByTestId("order-price-open").click();
  const price = page.getByTestId("order-price-input").first();
  await price.waitFor({ state: "visible", timeout: 30_000 });
  await price.fill(String(fixtures.orderUnitPrice));
  await page.getByTestId("order-price-submit").click();
  await waitForToast(page, "تم تسعير جميع أصناف الطلب");

  for (const state of ["confirmed", "preparing", "ready"]) {
    await transitionOrder(page, createdOrder.value, state);
  }

  await navigate(page, "salesInvoices");
  const linkedInvoice = await waitForNewEntity(page, "invoice-row", "data-invoice-number", invoicesBefore);
  const invoiceRow = linkedInvoice.locator;
  const linkedTotal = Number(await invoiceRow.getAttribute("data-remaining"));
  assert.ok(Number.isFinite(linkedTotal) && linkedTotal > 0, "Order-linked invoice must have a positive COD balance");
  return { orderNumber: createdOrder.value, invoiceNumber: linkedInvoice.value };
}

async function createDeliveryCycle(page, fixtures, marker, orderNumber, invoiceNumber) {
  await navigate(page, "deliveries");
  const branch = page.getByTestId("delivery-branch-select");
  await branch.waitFor({ state: "visible", timeout: 30_000 });
  await selectExact(branch, fixtures.branchName);
  const before = await attributeSet(page.getByTestId("delivery-row"), "data-delivery-number");
  await page.getByTestId("delivery-create-open").click();
  await page.getByTestId("delivery-action-modal").waitFor();
  await selectContaining(page.getByTestId("delivery-order-select"), orderNumber);
  await selectContaining(page.getByTestId("delivery-invoice-select"), invoiceNumber);
  await page.getByTestId("delivery-city").fill(fixtures.city);
  await page.getByTestId("delivery-address").fill(fixtures.address);
  await page.getByTestId("delivery-company").fill(fixtures.shippingCompany);
  await page.getByTestId("delivery-tracking").fill(marker);
  await page.getByTestId("delivery-carrier-fee").fill("0");
  await page.getByTestId("delivery-action-date").fill(fixtures.operationDate);
  await page.getByTestId("delivery-action-submit").click();
  await waitForToast(page, "تم إنشاء الشحنة بنجاح");
  await page.getByTestId("delivery-action-modal").waitFor({ state: "detached" });
  const created = await waitForNewEntity(page, "delivery-row", "data-delivery-number", before);

  let row = created.locator;
  await row.getByTestId("delivery-ship-open").click();
  await page.getByTestId("delivery-action-submit").click();
  await waitForToast(page, "تم تسجيل إرسال الشحنة");
  row = await waitForEntityState(page, "delivery-row", "data-delivery-number", created.value, "data-status", "shipped");
  await row.getByTestId("delivery-confirm-open").click();
  await selectContaining(page.getByTestId("delivery-confirmation-account"), fixtures.codAccountName);
  await page.getByTestId("delivery-action-date").fill(fixtures.operationDate);
  await page.getByTestId("delivery-action-submit").click();
  await waitForToast(page, "تم تسجيل التسليم والتحصيل بنجاح");
  await waitForEntityState(page, "delivery-row", "data-delivery-number", created.value, "data-status", "delivered");

  await page.getByTestId("delivery-settlement-open").click();
  await selectContaining(page.getByTestId("delivery-settlement-source"), fixtures.codAccountName);
  const settlementItem = page.locator(`[data-testid="delivery-settlement-item"][data-delivery-number="${created.value}"]`);
  await settlementItem.waitFor({ timeout: 30_000 });
  await settlementItem.check();
  await selectContaining(page.getByTestId("delivery-settlement-destination"), fixtures.settlementAccountName);
  await page.getByTestId("delivery-action-date").fill(fixtures.operationDate);
  await page.getByTestId("delivery-action-submit").click();
  await waitForToast(page, "تمت تسوية مبالغ التحصيل بنجاح");
  return created.value;
}

async function createPurchaseCycle(page, fixtures, marker) {
  await navigate(page, "purchases");
  const before = await attributeSet(page.getByTestId("shipment-row"), "data-shipment-number");

  await navigate(page, "newPurchase");
  await selectContaining(page.getByTestId("purchase-supplier-select"), fixtures.supplierName);
  await page.getByTestId("purchase-product-search").fill(fixtures.productName);
  const result = page.getByTestId("purchase-product-result").filter({ hasText: fixtures.productName }).first();
  await result.waitFor({ state: "visible", timeout: 30_000 });
  await result.click();
  await page.locator("[data-purchase-quantity]").first().fill("3");
  await page.locator("[data-purchase-unit-cost]").first().fill(String(fixtures.purchaseUnitCost));
  await page.getByTestId("purchase-shipping-cost").fill("0");
  await page.getByTestId("purchase-notes").fill(marker);
  await page.getByTestId("purchase-submit").click();
  await waitForToast(page, "تم إنشاء فاتورة المشتريات وحفظها بانتظار الاستلام");
  await page.getByTestId("shipments-page").waitFor({ state: "visible", timeout: 45_000 });

  const created = await waitForNewEntity(page, "shipment-row", "data-shipment-number", before);
  let row = created.locator;
  await row.locator('[data-testid="shipment-status-next"][data-next-status="in_transit"]').click();
  await waitForToast(page, "تم تحديث حالة عملية الشراء");
  row = await waitForEntityState(page, "shipment-row", "data-shipment-number", created.value, "data-status", "in_transit");
  await row.locator('[data-testid="shipment-status-next"][data-next-status="arrived"]').click();
  const receive = page.getByTestId("shipment-receive-form");
  await receive.waitFor();
  await page.getByTestId("shipment-receive-date").fill(fixtures.operationDate);
  await page.getByTestId("shipment-external-invoice").fill(marker);
  await page.getByTestId("shipment-receive-submit").click();
  const receiptToast = await waitForToast(page, "تم الاستلام بمستند");
  const receiptNumber = receiptToast.match(/PUR-\d{4}-\d+/)?.[0];
  assert.ok(receiptNumber, "Receive toast must expose the created purchase receipt number");
  await receive.waitFor({ state: "detached" });

  await navigate(page, "purchaseReturns");
  await selectContaining(page.getByTestId("purchase-return-supplier"), fixtures.supplierName);
  await selectContaining(page.getByTestId("purchase-return-receipt"), receiptNumber);
  const returnItem = page.getByTestId("purchase-return-item").filter({ hasText: fixtures.productName }).first();
  await returnItem.waitFor();
  await returnItem.getByTestId("purchase-return-quantity").fill("1");
  await page.getByTestId("purchase-return-reason").fill(marker);
  await page.getByTestId("purchase-return-submit").click();
  await waitForToast(page, "تم ترحيل مرتجع المشتريات");

  await navigate(page, "supplierPayments");
  await selectContaining(page.getByTestId("supplier-payment-supplier"), fixtures.supplierName);
  await selectContaining(page.getByTestId("supplier-payment-account"), fixtures.cashAccountName);
  const receipt = page.locator(`[data-testid="supplier-payment-receipt"][data-receipt-number="${receiptNumber}"]`);
  await receipt.waitFor({ timeout: 30_000 });
  const remaining = Number(await receipt.getAttribute("data-remaining"));
  assert.ok(Number.isFinite(remaining) && remaining > 0);
  await receipt.getByTestId("supplier-payment-allocation").fill(String(Math.min(fixtures.purchaseUnitCost, remaining)));
  await page.getByTestId("supplier-payment-notes").fill(marker);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("supplier-payment-submit").click();
  await waitForToast(page, "تم تسجيل دفعة المورد");
  return { shipmentNumber: created.value, receiptNumber };
}

async function createRepairCycle(page, fixtures, marker) {
  await navigate(page, "repairs");
  const branch = page.getByTestId("repair-branch-select");
  if (await branch.count()) {
    await branch.waitFor({ state: "visible", timeout: 30_000 });
    await selectExact(branch, fixtures.branchName);
  }
  const before = await attributeSet(page.getByTestId("repair-card"), "data-repair-number");
  await page.getByTestId("repair-create-open").click();
  await page.getByTestId("repair-create-form").waitFor();
  await selectContaining(page.getByTestId("repair-customer-select"), fixtures.customerName);
  await page.getByTestId("repair-device-brand").fill("E2E");
  await page.getByTestId("repair-device-model").fill(marker);
  await page.getByTestId("repair-problem").fill(`اختبار صيانة ${marker}`);
  await page.getByTestId("repair-labor-cost").fill(String(fixtures.repairLaborCost));
  await page.getByTestId("repair-notes").fill(marker);
  await page.getByTestId("repair-submit").click();
  await waitForToast(page, "تم إنشاء أمر الصيانة بنجاح");
  await page.getByTestId("repair-create-form").waitFor({ state: "detached" });
  const created = await waitForNewEntity(page, "repair-card", "data-repair-number", before);
  await created.locator.getByTestId("repair-collect-open").click();
  await page.getByTestId("repair-collection-form").waitFor();
  await page.getByTestId("repair-collection-amount").fill(String(fixtures.repairCollectionAmount));
  await selectContaining(page.getByTestId("repair-collection-account"), fixtures.cashAccountName);
  await page.getByTestId("repair-collection-date").fill(fixtures.operationDate);
  await page.getByTestId("repair-collection-submit").click();
  await waitForToast(page, "تم تحصيل دفعة الصيانة");
  return created.value;
}

async function createExpenseCycle(page, fixtures, marker) {
  await navigate(page, "expenses");
  const title = `${marker}-EXPENSE`;
  const before = await attributeSet(page.getByTestId("expense-row"), "data-expense-title");
  await page.getByTestId("expense-create-open").click();
  await page.getByTestId("expense-create-form").waitFor();
  await page.getByTestId("expense-title").fill(title);
  await page.getByTestId("expense-category").selectOption({ label: "أخرى" });
  await page.getByTestId("expense-amount").fill(String(fixtures.expenseAmount));
  await page.getByTestId("expense-date").fill(fixtures.operationDate);
  await selectContaining(page.getByTestId("expense-account"), fixtures.cashAccountName);
  await page.getByTestId("expense-notes").fill(marker);
  await page.getByTestId("expense-submit").click();
  await waitForToast(page, "تم إضافة المصروف بنجاح");
  await page.getByTestId("expense-create-form").waitFor({ state: "detached" });
  const created = await waitForNewEntity(page, "expense-row", "data-expense-title", before);
  assert.equal(created.value, title);
  assert.equal(await created.locator.getAttribute("data-status"), "active");
  return title;
}

async function main() {
  const config = businessConfig();
  if (process.argv.includes("--validate-config")) {
    console.log(JSON.stringify({
      target: config.baseUrl,
      operatorRole: config.operator.role,
      financialOperatorRole: config.financialOperator.role,
      dataset: config.fixtures.dataset,
      branchName: config.fixtures.branchName,
      operationDate: config.fixtures.operationDate,
      scenarios,
    }));
    return;
  }

  await mkdir(outputRoot, { recursive: true });
  const browser = await launchStagingBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
  });
  const page = await context.newPage();
  const runtimeFailures = observeRuntimeFailures(page, config.baseUrl);
  const marker = `E2E-${Date.now().toString(36).toUpperCase()}`;
  const completed = [];
  const documents = {};
  const runStep = async (name, action) => {
    const startedAt = Date.now();
    const value = await action();
    completed.push({ name, durationMs: Date.now() - startedAt });
    await safeScreenshot(page, join(outputRoot, `${String(completed.length).padStart(2, "0")}-${name}.png`));
    return value;
  };

  try {
    await signIn(page, config.baseUrl, config.operator);
    await navigate(page, "salesInvoices");
    const salesInvoice = await runStep("invoice-create", () => createInvoice(page, config.fixtures, `${marker}-SALE`, 2));
    documents.salesInvoice = salesInvoice.number;
    documents.refundInvoice = salesInvoice.number;
    await runStep("invoice-collection", () => collectInvoice(page, config.fixtures, salesInvoice, `${marker}-COLLECTION`));
    await runStep("sales-return", () => createSalesReturn(page, config.fixtures, salesInvoice, `${marker}-SALES-RETURN`));

    const orderResult = await runStep("order-ready", () => createOrderAndLinkedInvoice(page, config.fixtures, `${marker}-ORDER`));
    documents.order = orderResult.orderNumber;
    documents.deliveryInvoice = orderResult.invoiceNumber;
    documents.delivery = await runStep("delivery-cod-settlement", () => createDeliveryCycle(page, config.fixtures, marker, orderResult.orderNumber, orderResult.invoiceNumber));

    Object.assign(documents, await runStep("purchase-return-payment", () => createPurchaseCycle(page, config.fixtures, `${marker}-PURCHASE`)));
    documents.repair = await runStep("repair-collection", () => createRepairCycle(page, config.fixtures, `${marker}-REPAIR`));

    await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
    await signIn(page, config.baseUrl, config.financialOperator);
    await navigate(page, "salesInvoices");
    await runStep("invoice-refund", () => refundInvoice(page, config.fixtures, salesInvoice, `${marker}-REFUND`));
    documents.expense = await runStep("expense-disbursement", () => createExpenseCycle(page, config.fixtures, marker));

    assert.deepEqual(runtimeFailures, [], "Business browser flow reported server/runtime failures");
    const report = {
      target: config.baseUrl,
      dataset: config.fixtures.dataset,
      branchName: config.fixtures.branchName,
      operatorRole: config.operator.role,
      financialOperatorRole: config.financialOperator.role,
      marker,
      generatedAt: new Date().toISOString(),
      browser: await browser.version(),
      scenarios,
      completed,
      documents,
      runtimeFailures,
    };
    await writeFile(join(outputRoot, "acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Staging mutable business acceptance passed (${completed.length} checkpoints).`);
  } catch (error) {
    await safeScreenshot(page, join(outputRoot, "failure.png"));
    await writeFile(join(outputRoot, "failure.json"), `${JSON.stringify({
      marker,
      generatedAt: new Date().toISOString(),
      completed,
      documents,
      runtimeFailures,
      message: redactEvidence(
        error instanceof Error ? error.message : "Unknown business E2E failure",
      ),
    }, null, 2)}\n`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
