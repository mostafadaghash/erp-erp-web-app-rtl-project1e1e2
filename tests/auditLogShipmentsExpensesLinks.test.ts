import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path: string) => readFileSync(path, "utf8");
const shipments = read("convex/shipments.ts");
const expenses = read("convex/expenses.ts");
const auditUi = read("src/components/AuditLogsPage.tsx");
const shipmentCreate = shipments.slice(shipments.indexOf("export const create"), shipments.indexOf("export const updateStatus"));
const shipmentStatus = shipments.slice(shipments.indexOf("export const updateStatus"), shipments.indexOf("export const receive"));
const shipmentReceive = shipments.slice(shipments.indexOf("export const receive"), shipments.indexOf("export const remove"));
const expenseCreate = expenses.slice(expenses.indexOf("export const create"), expenses.indexOf("export const voidExpense"));
const expenseVoid = expenses.slice(expenses.indexOf("export const voidExpense"), expenses.indexOf("export { voidExpense as void }"));

test("ASE-01 shipment creation links branch shipment supplier and bounded totals", () => {
  assert.match(shipmentCreate, /branchId,[\s\S]*sourceType: "shipment"[\s\S]*relatedType: "supplier"/);
  assert.match(shipmentCreate, /after: \{[\s\S]*status: "ordered"[\s\S]*itemsCount: items\.length[\s\S]*grandTotal/);
});

test("ASE-02 shipment status audit records exact transition and cancellation reason", () => {
  assert.match(shipmentStatus, /action: "update_status"/);
  assert.match(shipmentStatus, /before: \{ status: shipment\.status \}/);
  assert.match(shipmentStatus, /after: \{ status: args\.status, cancellationReason: args\.reason\?\.trim\(\) \?\? null \}/);
});

test("ASE-03 shipment receipt links purchase receipt journal and safe financial summary", () => {
  assert.match(shipmentReceive, /relatedType: "purchase_receipt"[\s\S]*relatedId: String\(purchaseReceiptId\)[\s\S]*relatedNumber: receiptNumber/);
  assert.match(shipmentReceive, /journalEntryId: journal\?\._id \? String\(journal\._id\) : undefined/);
  assert.match(shipmentReceive, /after: \{[\s\S]*status: "arrived"[\s\S]*payableAmount[\s\S]*totalLandedCost[\s\S]*hasSupplierLedgerEntry/);
});

test("ASE-04 idempotent shipment receipt returns before direct audit append", () => {
  const retry = shipmentReceive.indexOf('if (shipment.status === "arrived")');
  const audit = shipmentReceive.indexOf('action: "receive"', retry);
  assert.ok(retry >= 0 && audit > retry);
});

test("ASE-05 expense creation links expense account and financial transaction", () => {
  assert.match(expenseCreate, /sourceType: "expense"[\s\S]*relatedType: "financial_account"/);
  assert.match(expenseCreate, /financialTransactionId: String\(posted\.transactionId\)/);
  assert.match(expenseCreate, /after: \{[\s\S]*status: "active"[\s\S]*category[\s\S]*amount: roundMoney\(args\.amount\)[\s\S]*accountName/);
});

test("ASE-06 expense void distinguishes reversal transaction from original", () => {
  assert.match(expenseVoid, /financialTransactionId: reversalTransactionId/);
  assert.match(expenseVoid, /reversalOfId: expense\.financialTransactionId \? String\(expense\.financialTransactionId\) : undefined/);
  assert.match(expenseVoid, /before: \{ status: expense\.status, amount: expense\.amount \}/);
  assert.match(expenseVoid, /after: \{ status: "voided"[\s\S]*voidReason: reason \}/);
});

test("ASE-07 duplicate expense reversal returns before direct audit append", () => {
  const retry = expenseVoid.indexOf("if (posted.duplicate) return posted.transactionId");
  const audit = expenseVoid.indexOf('action: "void"', retry);
  assert.ok(retry >= 0 && audit > retry);
});

test("ASE-08 audit UI names shipment expense receipt and void fields without navigation", () => {
  for (const token of ["receive", "void", "shipment", "expense", "financial_account", "purchaseReceiptNumber", "totalLandedCost", "voidReason"]) {
    assert.match(auditUi, new RegExp(token));
  }
  assert.doesNotMatch(auditUi, /href=\{.*log\./);
  assert.doesNotMatch(auditUi, /navigate\(.*log\./);
  const newAudits = shipmentCreate + "\n" + shipmentStatus + "\n" + shipmentReceive + "\n" + expenseCreate + "\n" + expenseVoid;
  assert.doesNotMatch(newAudits, /before:\s*\{[^}]*(requestId|idempotency|fingerprint|token)/i);
  assert.doesNotMatch(newAudits, /after:\s*\{[^}]*(requestId|idempotency|fingerprint|token)/i);
});
