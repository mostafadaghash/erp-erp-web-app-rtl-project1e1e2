import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path: string) => readFileSync(path, "utf8");
const customerLedger = read("convex/lib/customerLedger.ts");
const supplierLedger = read("convex/lib/supplierLedger.ts");
const supplierPayments = read("convex/supplierPayments.ts");
const auditUi = read("src/components/AuditLogsPage.tsx");

test("ALP-01 customer ledger audit links the operational document and branch", () => {
  assert.match(customerLedger, /module: "customer_ledger"[\s\S]*branchId: input\.branchId/);
  assert.match(customerLedger, /sourceType: input\.referenceType[\s\S]*sourceId: input\.referenceId[\s\S]*sourceNumber: input\.referenceNumber/);
  assert.match(customerLedger, /relatedType: "customer"[\s\S]*relatedId: String\(input\.customerId\)/);
});

test("ALP-02 customer ledger audit captures safe balances and reversal lineage", () => {
  assert.match(customerLedger, /reversalOfId: input\.originalEntryId \? String\(input\.originalEntryId\) : undefined/);
  assert.match(customerLedger, /before: \{[\s\S]*receivableBalance: receivableBefore[\s\S]*advanceBalance: advanceBefore[\s\S]*totalPurchases: totalPurchasesBefore/);
  assert.match(customerLedger, /after: \{[\s\S]*receivableBalance: receivableAfter[\s\S]*advanceBalance: advanceAfter[\s\S]*totalPurchases: totalPurchasesAfter/);
  const duplicate = customerLedger.indexOf("if (prior)");
  const audit = customerLedger.indexOf("await logAction(ctx, user", duplicate);
  assert.ok(duplicate >= 0 && audit > duplicate);
});

test("ALP-03 supplier ledger audit links source document supplier and branch", () => {
  assert.match(supplierLedger, /module: "supplier_ledger"[\s\S]*branchId: input\.branchId/);
  assert.match(supplierLedger, /sourceType: input\.referenceType[\s\S]*sourceId: input\.referenceId[\s\S]*sourceNumber: input\.referenceNumber/);
  assert.match(supplierLedger, /relatedType: "supplier"[\s\S]*relatedId: String\(input\.supplierId\)/);
});

test("ALP-04 supplier ledger audit preserves reversal lineage and safe balances", () => {
  assert.match(supplierLedger, /reversalOfId: input\.originalEntryId \? String\(input\.originalEntryId\) : undefined/);
  assert.match(supplierLedger, /before: \{ balance: balanceBefore \}/);
  assert.match(supplierLedger, /after: \{[\s\S]*amountDelta[\s\S]*balance: balanceAfter[\s\S]*reversalReason/);
  const duplicate = supplierLedger.indexOf("if (previous)");
  const audit = supplierLedger.indexOf("await logAction(ctx, user", duplicate);
  assert.ok(duplicate >= 0 && audit > duplicate);
});

test("ALP-05 supplier payment audit links payment ledger and financial transaction", () => {
  assert.match(supplierPayments, /module: "supplier_payments"[\s\S]*sourceType: "supplier_payment"/);
  assert.match(supplierPayments, /relatedType: "supplier_ledger_entry"[\s\S]*relatedId: String\(ledger\._id\)[\s\S]*relatedNumber: ledger\.entryNumber/);
  assert.match(supplierPayments, /financialTransactionId: String\(financial\.transactionId\)/);
  assert.match(supplierPayments, /after: \{[\s\S]*allocationsCount: sorted\.length[\s\S]*supplierName: supplier\.name[\s\S]*accountName: account\.name/);
});

test("ALP-06 supplier payment reversal links new and original finance transactions", () => {
  assert.match(supplierPayments, /action: "reverse"[\s\S]*financialTransactionId: String\(financialId\)/);
  assert.match(supplierPayments, /reversalOfId: String\(payment\.financialTransactionId\)/);
  assert.match(supplierPayments, /before: \{ status: "posted", amount: payment\.amount \}/);
  assert.match(supplierPayments, /after: \{[\s\S]*status: "reversed"[\s\S]*reversalReason: reason/);
});

test("ALP-07 idempotent retries do not append duplicate payment audits", () => {
  const createRetry = supplierPayments.indexOf("if (retry)");
  const createAudit = supplierPayments.indexOf('action: "post",\n    module: "supplier_payments"', createRetry);
  assert.ok(createRetry >= 0 && createAudit > createRetry);
  const reverseRetry = supplierPayments.indexOf('if (payment.status === "reversed")');
  const reverseAudit = supplierPayments.indexOf('action: "reverse",\n    module: "supplier_payments"', reverseRetry);
  assert.ok(reverseRetry >= 0 && reverseAudit > reverseRetry);
});

test("ALP-08 audit UI names ledger and payment references without URL navigation", () => {
  for (const token of ["customer_ledger", "supplier_ledger", "supplier_payments", "customer_ledger_entry", "supplier_ledger_entry", "supplier_payment", "supplier_payment_reversal"]) {
    assert.match(auditUi, new RegExp(token));
  }
  assert.doesNotMatch(auditUi, /href=\{.*log\./);
  assert.doesNotMatch(auditUi, /navigate\(.*log\./);
  const newAudits = customerLedger + "
" + supplierLedger + "
" + supplierPayments;
  assert.doesNotMatch(newAudits, /before:\s*\{[^}]*(requestId|idempotency|fingerprint|token)/i);
  assert.doesNotMatch(newAudits, /after:\s*\{[^}]*(requestId|idempotency|fingerprint|token)/i);
});
