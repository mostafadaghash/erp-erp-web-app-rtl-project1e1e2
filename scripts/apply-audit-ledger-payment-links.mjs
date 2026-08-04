import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const current = readFileSync(path, "utf8");
  const first = current.indexOf(before);
  if (first < 0) throw new Error(`Missing expected source in ${path}: ${before.slice(0, 120)}`);
  if (current.indexOf(before, first + before.length) >= 0) throw new Error(`Expected unique source in ${path}`);
  writeFileSync(path, current.replace(before, after));
}

replaceOnce(
  "convex/lib/customerLedger.ts",
  '  await logAction(ctx, user, { action: "post", module: "customer_ledger", recordId: entryId, recordLabel: entryNumber, details: `${input.description} (${customer.name})` });',
  `  await logAction(ctx, user, {
    action: input.type === "reversal" ? "reverse" : "post",
    module: "customer_ledger",
    recordId: String(entryId),
    recordLabel: entryNumber,
    details: input.description + " (" + customer.name + ")",
    branchId: input.branchId,
    sourceType: input.referenceType,
    sourceId: input.referenceId,
    sourceNumber: input.referenceNumber,
    relatedType: "customer",
    relatedId: String(input.customerId),
    reversalOfId: input.originalEntryId ? String(input.originalEntryId) : undefined,
    before: {
      receivableBalance: receivableBefore,
      advanceBalance: advanceBefore,
      totalPurchases: totalPurchasesBefore,
    },
    after: {
      type: input.type,
      status: "posted",
      date: input.date,
      receivableBalance: receivableAfter,
      advanceBalance: advanceAfter,
      totalPurchases: totalPurchasesAfter,
    },
  });`,
);

replaceOnce(
  "convex/lib/supplierLedger.ts",
  '  await logAction(ctx, user, { action: input.type === "reversal" ? "reverse" : "post", module: "supplier_ledger", recordId: id, recordLabel: entryNumber, details: JSON.stringify({ type: input.type, amountDelta, balanceBefore, balanceAfter, branchId: input.branchId }) });',
  `  await logAction(ctx, user, {
    action: input.type === "reversal" ? "reverse" : "post",
    module: "supplier_ledger",
    recordId: String(id),
    recordLabel: entryNumber,
    details: input.description,
    branchId: input.branchId,
    sourceType: input.referenceType,
    sourceId: input.referenceId,
    sourceNumber: input.referenceNumber,
    relatedType: "supplier",
    relatedId: String(input.supplierId),
    reversalOfId: input.originalEntryId ? String(input.originalEntryId) : undefined,
    before: { balance: balanceBefore },
    after: {
      type: input.type,
      status: "posted",
      date: input.date,
      amountDelta,
      balance: balanceAfter,
      reversalReason: input.reversalReason ?? null,
    },
  });`,
);

replaceOnce(
  "convex/supplierPayments.ts",
  '  await logAction(ctx, user, { action: "post", module: "supplier_payments", recordId: paymentId, recordLabel: paymentNumber, details: JSON.stringify({ amount, allocations: sorted.length }) });',
  `  await logAction(ctx, user, {
    action: "post",
    module: "supplier_payments",
    recordId: String(paymentId),
    recordLabel: paymentNumber,
    details: "دفعة مورد " + paymentNumber,
    branchId,
    sourceType: "supplier_payment",
    sourceId: String(paymentId),
    sourceNumber: paymentNumber,
    relatedType: "supplier_ledger_entry",
    relatedId: String(ledger._id),
    relatedNumber: ledger.entryNumber,
    financialTransactionId: String(financial.transactionId),
    after: {
      status: "posted",
      date: args.date,
      amount,
      allocationsCount: sorted.length,
      supplierName: supplier.name,
      accountName: account.name,
    },
  });`,
);

replaceOnce(
  "convex/supplierPayments.ts",
  '  await logAction(ctx, user, { action: "reverse", module: "supplier_payments", recordId: payment._id, recordLabel: payment.paymentNumber, details: reason }); return financialId;',
  `  await logAction(ctx, user, {
    action: "reverse",
    module: "supplier_payments",
    recordId: String(payment._id),
    recordLabel: payment.paymentNumber,
    details: reason,
    branchId: payment.branchId,
    sourceType: "supplier_payment",
    sourceId: String(payment._id),
    sourceNumber: payment.paymentNumber,
    relatedType: "supplier_ledger_entry",
    relatedId: String(ledger._id),
    relatedNumber: ledger.entryNumber,
    financialTransactionId: String(financialId),
    reversalOfId: String(payment.financialTransactionId),
    before: { status: "posted", amount: payment.amount },
    after: {
      status: "reversed",
      date: args.date,
      amount: payment.amount,
      reversalReason: reason,
    },
  });
  return financialId;`,
);

replaceOnce(
  "src/components/AuditLogsPage.tsx",
  '  general_ledger: "الأستاذ العام",\n};',
  '  general_ledger: "الأستاذ العام",\n  customer_ledger: "دفتر العملاء",\n  supplier_ledger: "دفتر الموردين",\n  supplier_payments: "مدفوعات الموردين",\n};',
);

replaceOnce(
  "src/components/AuditLogsPage.tsx",
  '  stock: "المخزون",\n};',
  '  stock: "المخزون",\n  type: "نوع الحركة",\n  status: "الحالة",\n  date: "التاريخ",\n  amount: "المبلغ",\n  amountDelta: "أثر الحركة",\n  balance: "الرصيد",\n  receivableBalance: "مديونية العميل",\n  advanceBalance: "الرصيد المقدم",\n  totalPurchases: "إجمالي المشتريات",\n  allocationsCount: "عدد التوزيعات",\n  accountName: "الحساب المالي",\n  supplierName: "المورد",\n  reversalReason: "سبب العكس",\n};',
);

replaceOnce(
  "src/components/AuditLogsPage.tsx",
  '  general_ledger_opening: "افتتاح الأستاذ",\n};',
  '  general_ledger_opening: "افتتاح الأستاذ",\n  customer: "عميل",\n  customer_ledger_entry: "حركة دفتر عميل",\n  supplier: "مورد",\n  supplier_ledger_entry: "حركة دفتر مورد",\n  supplier_payment: "سند دفع مورد",\n  supplier_payment_reversal: "عكس سند دفع مورد",\n  purchase_receipt: "مستند شراء",\n  purchase_return: "مرتجع شراء",\n  supplier_refund: "استرداد مورد",\n  invoice: "فاتورة",\n  order: "طلب",\n  repair: "إصلاح",\n  delivery: "توصيل",\n};',
);

writeFileSync(
  "tests/auditLogCustomerSupplierLedgerPayments.test.ts",
  `import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path: string) => readFileSync(path, "utf8");
const customerLedger = read("convex/lib/customerLedger.ts");
const supplierLedger = read("convex/lib/supplierLedger.ts");
const supplierPayments = read("convex/supplierPayments.ts");
const auditUi = read("src/components/AuditLogsPage.tsx");

test("ALP-01 customer ledger audit links the operational document and branch", () => {
  assert.match(customerLedger, /module: "customer_ledger"[\\s\\S]*branchId: input\\.branchId/);
  assert.match(customerLedger, /sourceType: input\\.referenceType[\\s\\S]*sourceId: input\\.referenceId[\\s\\S]*sourceNumber: input\\.referenceNumber/);
  assert.match(customerLedger, /relatedType: "customer"[\\s\\S]*relatedId: String\\(input\\.customerId\\)/);
});

test("ALP-02 customer ledger audit captures safe balances and reversal lineage", () => {
  assert.match(customerLedger, /reversalOfId: input\\.originalEntryId \\? String\\(input\\.originalEntryId\\) : undefined/);
  assert.match(customerLedger, /before: \\{[\\s\\S]*receivableBalance: receivableBefore[\\s\\S]*advanceBalance: advanceBefore[\\s\\S]*totalPurchases: totalPurchasesBefore/);
  assert.match(customerLedger, /after: \\{[\\s\\S]*receivableBalance: receivableAfter[\\s\\S]*advanceBalance: advanceAfter[\\s\\S]*totalPurchases: totalPurchasesAfter/);
  const duplicate = customerLedger.indexOf("if (prior)");
  const audit = customerLedger.indexOf("await logAction(ctx, user", duplicate);
  assert.ok(duplicate >= 0 && audit > duplicate);
});

test("ALP-03 supplier ledger audit links source document supplier and branch", () => {
  assert.match(supplierLedger, /module: "supplier_ledger"[\\s\\S]*branchId: input\\.branchId/);
  assert.match(supplierLedger, /sourceType: input\\.referenceType[\\s\\S]*sourceId: input\\.referenceId[\\s\\S]*sourceNumber: input\\.referenceNumber/);
  assert.match(supplierLedger, /relatedType: "supplier"[\\s\\S]*relatedId: String\\(input\\.supplierId\\)/);
});

test("ALP-04 supplier ledger audit preserves reversal lineage and safe balances", () => {
  assert.match(supplierLedger, /reversalOfId: input\\.originalEntryId \\? String\\(input\\.originalEntryId\\) : undefined/);
  assert.match(supplierLedger, /before: \\{ balance: balanceBefore \\}/);
  assert.match(supplierLedger, /after: \\{[\\s\\S]*amountDelta[\\s\\S]*balance: balanceAfter[\\s\\S]*reversalReason/);
  const duplicate = supplierLedger.indexOf("if (previous)");
  const audit = supplierLedger.indexOf("await logAction(ctx, user", duplicate);
  assert.ok(duplicate >= 0 && audit > duplicate);
});

test("ALP-05 supplier payment audit links payment ledger and financial transaction", () => {
  assert.match(supplierPayments, /module: "supplier_payments"[\\s\\S]*sourceType: "supplier_payment"/);
  assert.match(supplierPayments, /relatedType: "supplier_ledger_entry"[\\s\\S]*relatedId: String\\(ledger\\._id\\)[\\s\\S]*relatedNumber: ledger\\.entryNumber/);
  assert.match(supplierPayments, /financialTransactionId: String\\(financial\\.transactionId\\)/);
  assert.match(supplierPayments, /after: \\{[\\s\\S]*allocationsCount: sorted\\.length[\\s\\S]*supplierName: supplier\\.name[\\s\\S]*accountName: account\\.name/);
});

test("ALP-06 supplier payment reversal links new and original finance transactions", () => {
  assert.match(supplierPayments, /action: "reverse"[\\s\\S]*financialTransactionId: String\\(financialId\\)/);
  assert.match(supplierPayments, /reversalOfId: String\\(payment\\.financialTransactionId\\)/);
  assert.match(supplierPayments, /before: \\{ status: "posted", amount: payment\\.amount \\}/);
  assert.match(supplierPayments, /after: \\{[\\s\\S]*status: "reversed"[\\s\\S]*reversalReason: reason/);
});

test("ALP-07 idempotent retries do not append duplicate payment audits", () => {
  const createRetry = supplierPayments.indexOf("if (retry)");
  const createAudit = supplierPayments.indexOf('action: "post",\\n    module: "supplier_payments"', createRetry);
  assert.ok(createRetry >= 0 && createAudit > createRetry);
  const reverseRetry = supplierPayments.indexOf('if (payment.status === "reversed")');
  const reverseAudit = supplierPayments.indexOf('action: "reverse",\\n    module: "supplier_payments"', reverseRetry);
  assert.ok(reverseRetry >= 0 && reverseAudit > reverseRetry);
});

test("ALP-08 audit UI names ledger and payment references without URL navigation", () => {
  for (const token of ["customer_ledger", "supplier_ledger", "supplier_payments", "customer_ledger_entry", "supplier_ledger_entry", "supplier_payment", "supplier_payment_reversal"]) {
    assert.match(auditUi, new RegExp(token));
  }
  assert.doesNotMatch(auditUi, /href=\\{.*log\\./);
  assert.doesNotMatch(auditUi, /navigate\\(.*log\\./);
  const newAudits = customerLedger + "\n" + supplierLedger + "\n" + supplierPayments;
  assert.doesNotMatch(newAudits, /before:\\s*\\{[^}]*(requestId|idempotency|fingerprint|token)/i);
  assert.doesNotMatch(newAudits, /after:\\s*\\{[^}]*(requestId|idempotency|fingerprint|token)/i);
});
`,
);

writeFileSync(
  "tests/AUDIT_LOG_CUSTOMER_SUPPLIER_LEDGER_PAYMENTS_MATRIX.md",
  `# Audit Log — Customer/Supplier Ledgers & Payments Matrix

| ID | Contract | Automated evidence |
| --- | --- | --- |
| ALP-01 | Customer-ledger events expose branch and operational document references. | Source contract |
| ALP-02 | Customer-ledger snapshots contain safe before/after balances and reversal lineage. | Source contract |
| ALP-03 | Supplier-ledger events expose branch, source document, and supplier reference. | Source contract |
| ALP-04 | Supplier-ledger reversal events identify the original entry and safe balance movement. | Source contract |
| ALP-05 | Supplier-payment events link the payment, supplier-ledger entry, and financial transaction. | Source contract |
| ALP-06 | Supplier-payment reversals link the reversal financial transaction to the original financial transaction. | Source contract |
| ALP-07 | Idempotent retries return before audit writes for create and reverse flows. | Source contract |
| ALP-08 | Audit UI uses Arabic labels and never builds navigation from untrusted audit values. | Source contract |

## Manual acceptance

- Post a customer receipt/payment-backed ledger event and verify the audit row shows the branch, source document, customer, and before/after balances.
- Reverse a customer ledger event and verify the original ledger-entry identifier appears under “عكس لـ”.
- Post a supplier payment with multiple allocations and verify payment number, supplier-ledger entry, financial transaction, amount, account, and allocation count.
- Reverse the supplier payment and verify the reversal financial transaction and original financial transaction are distinguishable.
- Confirm long document identifiers wrap safely on mobile and no audit tag is clickable.

## Scope boundary

This slice changes audit metadata and presentation only. It does not alter balances, allocations, posting order, debit/credit mappings, idempotency keys, reversal validation, permissions, or branch ownership rules. Invoice/order/delivery/repair business workflows remain unchanged; their customer-ledger events inherit the centralized ledger audit links.
`,
);
