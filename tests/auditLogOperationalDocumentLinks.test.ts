import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path: string) => readFileSync(path, "utf8");
const invoices = read("convex/invoices.ts");
const orders = read("convex/orders.ts");
const deliveries = read("convex/deliveries.ts");
const repairs = read("convex/repairs.ts");
const salesReturns = read("convex/salesReturns.ts");
const purchaseReturns = read("convex/purchaseReturns.ts");
const auditUi = read("src/components/AuditLogsPage.tsx");

function expectAll(source: string, tokens: string[]) {
  for (const token of tokens) assert.ok(source.includes(token), `Missing ${token}`);
}

function auditSnapshots(source: string) {
  return [...source.matchAll(/(?:before|after):\s*\{([^{}]*)\}/g)]
    .map((match) => match[1])
    .join("\n");
}

test("AOD-01 invoices expose document branch customer and safe state snapshots", () => {
  expectAll(invoices, [
    'sourceType: "invoice"',
    'sourceNumber: invoiceNumber',
    'branchId,',
    'relatedType: args.customerId ? "customer" : undefined',
    'before: { status: inv.status, total: inv.total, paid: inv.paid, remaining: inv.remaining }',
    'after: { status: "cancelled", cancellationReason: reason }',
  ]);
});

test("AOD-02 order deposits and refunds link their financial transactions", () => {
  expectAll(orders, [
    'sourceType: "order"',
    'action: "record_payment"',
    'financialTransactionId: String(posted.transactionId)',
    'action: "refund"',
    'before: { status: order.status, deposit: order.deposit, remaining: order.remaining }',
  ]);
  const duplicateReturn = orders.indexOf('if (posted.duplicate) return posted.transactionId;');
  const paymentAudit = orders.indexOf('action: "record_payment"', duplicateReturn);
  assert.ok(duplicateReturn >= 0 && paymentAudit > duplicateReturn);
});

test("AOD-03 delivery creation confirmation and reversal expose document lineage", () => {
  expectAll(deliveries, [
    'sourceType:"delivery"',
    'relatedType:"invoice"',
    'relatedType:"delivery_confirmation"',
    'financialTransactionId:financialTransactionId?String(financialTransactionId):undefined',
    'reversalOfId:confirmation.financialTransactionId?String(confirmation.financialTransactionId):undefined',
  ]);
});

test("AOD-04 COD settlements are audited on post and reversal", () => {
  expectAll(deliveries, [
    'module:"cod_settlements"',
    'sourceType:"cod_settlement"',
    'deliveriesCount:deliveries.length',
    'financialTransactionId:String(posted.transactionId)',
    'reversalOfId:String(settlement.financialTransactionId)',
  ]);
  const createRetry = deliveries.indexOf('if(prior){if(prior.requestFingerprint!==fp)');
  const settlementAudit = deliveries.indexOf('module:"cod_settlements"', createRetry);
  assert.ok(createRetry >= 0 && settlementAudit > createRetry);
});

test("AOD-05 repairs use safe summaries and never snapshot the tracking token", () => {
  expectAll(repairs, [
    'sourceType: "repair"',
    'journalEntryId: journal?._id ? String(journal._id) : undefined',
    'publicTrackingRotated: true',
    'hasDiagnosis:',
    'journalEntryId: cancellationJournal?._id ? String(cancellationJournal._id) : undefined',
  ]);
  assert.doesNotMatch(auditSnapshots(repairs), /trackingToken/i);
});

test("AOD-06 sales return credit notes link invoices and finance reversals", () => {
  expectAll(salesReturns, [
    'sourceType: "sales_return"',
    'relatedType: "invoice"',
    'financialTransactionId: transactionId ? String(transactionId) : undefined',
    'financialTransactionId: reversalTransactionId ? String(reversalTransactionId) : undefined',
    'reversalOfId: note.financialTransactionId ? String(note.financialTransactionId) : undefined',
  ]);
});

test("AOD-07 purchase returns link receipt finance journal and reversal lineage", () => {
  expectAll(purchaseReturns, [
    'sourceType:"purchase_return"',
    'relatedType:"purchase_receipt"',
    'financialTransactionId:financial?.transactionId?String(financial.transactionId):undefined',
    'journalEntryId:journal?._id?String(journal._id):undefined',
    'financialTransactionId:reversalFinancialTransactionId?String(reversalFinancialTransactionId):undefined',
    'journalEntryId:reversalJournal?._id?String(reversalJournal._id):undefined',
  ]);
});

test("AOD-08 operational audit snapshots exclude request and idempotency material", () => {
  const snapshots = [invoices, orders, deliveries, repairs, salesReturns, purchaseReturns]
    .map(auditSnapshots)
    .join("\n");
  assert.doesNotMatch(snapshots, /requestId|requestFingerprint|idempotencyKey|trackingToken/i);
});

test("AOD-09 Audit Log UI labels new actions modules documents and fields", () => {
  expectAll(auditUi, [
    'record_payment: { label: "تحصيل"',
    'cod_settlements: "تسويات COD"',
    'sales_returns: "مرتجعات المبيعات"',
    'purchase_returns: "مرتجعات المشتريات"',
    'delivery_confirmation: "تأكيد توصيل"',
    'cod_settlement: "تسوية COD"',
    'sales_return: "إشعار دائن مبيعات"',
    'publicTrackingRotated: "تم تجديد التتبع"',
  ]);
  assert.doesNotMatch(auditUi, /href=\{.*log\./);
  assert.doesNotMatch(auditUi, /navigate\(.*log\./);
});
