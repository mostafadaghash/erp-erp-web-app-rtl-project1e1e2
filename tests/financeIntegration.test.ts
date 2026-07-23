import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { symlink, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";

const links = [
  ["convex/_generated/server", "server.js"], ["convex/lib/auth", "auth.ts"],
  ["convex/lib/finance", "finance.ts"], ["convex/lib/documentNumbers", "documentNumbers.ts"],
  ["convex/lib/permissions", "permissions.ts"], ["convex/lib/references", "references.ts"],
  ["convex/lib/inventory", "inventory.ts"], ["shared/businessRules", "businessRules.ts"],
  ["shared/inventoryRules", "inventoryRules.ts"],
] as const;

before(async () => { for (const [path, target] of links) if (!existsSync(resolve(path))) await symlink(target, resolve(path)); });
after(async () => { for (const [path] of links) if (existsSync(resolve(path))) await unlink(resolve(path)); });

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "../convex/finance.ts": () => import("../convex/finance.ts"),
  "../convex/invoices.ts": () => import("../convex/invoices.ts"),
  "../convex/orders.ts": () => import("../convex/orders.ts"),
  "../convex/repairs.ts": () => import("../convex/repairs.ts"),
  "../convex/expenses.ts": () => import("../convex/expenses.ts"),
  "../convex/auditLogs.ts": () => import("../convex/auditLogs.ts"),
};

const date = "2026-07-21";
async function setup(options: { initialized?: boolean; secondBranch?: boolean } = {}) {
  const raw = convexTest(schema, modules);
  const ids = await raw.run(async ctx => {
    const branchId = await ctx.db.insert("branches", { name: "القاهرة", address: "القاهرة", isActive: true });
    const branch2Id = options.secondBranch ? await ctx.db.insert("branches", { name: "الجيزة", address: "الجيزة", isActive: true }) : undefined;
    await ctx.db.insert("userProfiles", { userId: "admin", tokenIdentifier: "admin", name: "مدير", role: "admin", branchId, permissions: [], isActive: true });
    const customerId = await ctx.db.insert("customers", { name: "عميل", phone: "010", balance: 0, totalPurchases: 0, branchId, isActive: true });
    if (options.initialized) await ctx.db.insert("financeSettings", { isInitialized: true, cutoverDate: date, defaultClearingDelayDays: 1, updatedAt: Date.now() });
    return { branchId, branch2Id, customerId };
  });
  return { raw, t: raw.withIdentity({ subject: "admin", tokenIdentifier: "admin" }), ...ids };
}

async function account(env: Awaited<ReturnType<typeof setup>>, code: string, balance = 0, type: "cash" | "bank" | "paymob_clearing" = "cash", branchId = env.branchId, allowNegative = false, delay = 0) {
  return await env.raw.run(ctx => ctx.db.insert("financialAccounts", { name: code, code, uniqueKey: `${branchId}:${code}`, type, branchId, isActive: true, currentBalance: balance, allowNegative, settlementDelayDays: delay, openingBalancePostedAt: Date.now(), createdAt: Date.now(), createdBy: "seed", updatedAt: Date.now() }));
}

async function snapshot(env: Awaited<ReturnType<typeof setup>>) {
  return await env.raw.run(async ctx => ({ accounts: await ctx.db.query("financialAccounts").collect(), transactions: await ctx.db.query("financialTransactions").collect(), movements: await ctx.db.query("financialMovements").collect(), payments: await ctx.db.query("payments").collect(), expenses: await ctx.db.query("expenses").collect() }));
}

async function seedDocument(env: Awaited<ReturnType<typeof setup>>, kind: "invoice" | "order" | "repair", paid: number, total = 100) {
  return await env.raw.run(async ctx => {
    if (kind === "invoice") return await ctx.db.insert("invoices", { invoiceNumber: "INV-T", customerName: "عميل", items: [], subtotal: total, discount: 0, tax: 0, total, paid, remaining: total - paid, paymentMethod: "cash", status: paid ? "partial" : "pending", branchId: env.branchId, type: "sale" });
    if (kind === "order") { if (paid > 0) await ctx.db.insert("customerBalances", { key: `${env.customerId}:${env.branchId}`, customerId: env.customerId, branchId: env.branchId, receivableBalance: 0, advanceBalance: paid, totalPurchases: 0, updatedAt: Date.now() }); return await ctx.db.insert("orders", { orderNumber: "ORD-T", customerId: env.customerId, customerName: "عميل", items: [], total, deposit: paid, remaining: total - paid, status: "pending", branchId: env.branchId }); }
    return await ctx.db.insert("repairs", { repairNumber: "REP-T", customerName: "عميل", customerPhone: "010", deviceType: "هاتف", deviceBrand: "X", deviceModel: "Y", problem: "عطل", parts: [], laborCost: total, totalCost: total, receivedDate: date, status: "received", deposit: paid, remaining: total - paid, branchId: env.branchId });
  });
}

async function invoiceCreationArgs(env: Awaited<ReturnType<typeof setup>>, creationRequestId: string) {
  const { customerId, productId } = await env.raw.run(async ctx => ({
    customerId: await ctx.db.insert("customers", { name: "عميل", phone: "010", balance: 0, totalPurchases: 0, branchId: env.branchId, isActive: true }),
    productId: await ctx.db.insert("products", { name: "منتج", sku: `SKU-${creationRequestId}`, costPrice: 50, sellPrice: 100, stock: 10, minStock: 0, unit: "قطعة", branchId: env.branchId, isActive: true }),
  }));
  return { customerId, customerName: "عميل", items: [{ productId, productName: "منتج", quantity: 1, unitPrice: 100, discount: 0, total: 100 }], subtotal: 100, discount: 0, tax: 14, total: 114, creationRequestId, branchId: env.branchId };
}

const orderCreationArgs = (branchId: Awaited<ReturnType<typeof setup>>["branchId"], creationRequestId: string, customerId?: Awaited<ReturnType<typeof setup>>["customerId"]) => ({ customerId, customerName: "عميل", items: [{ productName: "قطعة", quantity: 1, unitPrice: 100 }], total: 100, creationRequestId, branchId });
const repairCreationArgs = (branchId: Awaited<ReturnType<typeof setup>>["branchId"], creationRequestId: string) => ({ customerName: "عميل", customerPhone: "010", deviceType: "هاتف", deviceBrand: "X", deviceModel: "Y", problem: "عطل", laborCost: 100, creationRequestId, branchId });

test("FIN-01 blocks transfers before initialization", async () => { const e = await setup(); const a = await account(e, "A", 10), b = await account(e, "B"); await assert.rejects(e.t.mutation(api.finance.transferFunds, { sourceAccountId: a, destinationAccountId: b, amount: 1, date, requestId: "r" }), /غير مهيأ/); });
test("FIN-02 blocks collections before initialization", async () => { const e = await setup(); const a = await account(e, "A"), id = await seedDocument(e, "invoice", 0); await assert.rejects(e.t.mutation(api.invoices.recordPayment, { invoiceId: id, amount: 1, accountId: a, paymentDate: date, requestId: "r" }), /غير مهيأ/); });
test("FIN-03 validates cutover date syntax", async () => { const e = await setup(); await assert.rejects(e.t.mutation(api.finance.configureInitialization, { cutoverDate: "21/07/2026", defaultClearingDelayDays: 1 }), /غير صالح/); });
test("FIN-04 rejects transactions before cutover", async () => { const e = await setup({ initialized: true }); const a = await account(e, "A", 10), b = await account(e, "B"); await assert.rejects(e.t.mutation(api.finance.transferFunds, { sourceAccountId: a, destinationAccountId: b, amount: 1, date: "2026-07-20", requestId: "r" }), /يسبق تاريخ القطع/); });
test("FIN-05 creates normalized financial accounts", async () => { const e = await setup(); const id = await e.t.mutation(api.finance.createAccount, { name: " خزينة ", code: " cash ", type: "cash", branchId: e.branchId }); const row = await e.raw.run(ctx => ctx.db.get(id)); assert.equal(row?.code, "CASH"); });
test("FIN-06 rejects duplicate account codes within a branch", async () => { const e = await setup(); await e.t.mutation(api.finance.createAccount, { name: "أ", code: "cash", type: "cash", branchId: e.branchId }); await assert.rejects(e.t.mutation(api.finance.createAccount, { name: "ب", code: "CASH", type: "cash", branchId: e.branchId }), /مستخدم/); });
test("FIN-07 permits the same account code in isolated branches", async () => { const e = await setup({ secondBranch: true }); assert.ok(e.branch2Id); const a = await e.t.mutation(api.finance.createAccount, { name: "أ", code: "CASH", type: "cash", branchId: e.branchId }); const b = await e.t.mutation(api.finance.createAccount, { name: "ب", code: "CASH", type: "cash", branchId: e.branch2Id }); assert.notEqual(a, b); });
test("FIN-08 posts a non-zero opening balance", async () => { const e = await setup(); const a = await e.t.mutation(api.finance.createAccount, { name: "أ", code: "A", type: "cash", branchId: e.branchId }); await e.t.mutation(api.finance.configureInitialization, { cutoverDate: date, defaultClearingDelayDays: 1 }); const tx = await e.t.mutation(api.finance.postOpeningBalance, { accountId: a, amount: 75, date, requestId: "r" }); assert.ok(tx); assert.equal((await e.raw.run(ctx => ctx.db.get(a)))?.currentBalance, 75); });
test("FIN-09 records a zero opening balance without a movement", async () => { const e = await setup(); const a = await e.t.mutation(api.finance.createAccount, { name: "أ", code: "A", type: "cash", branchId: e.branchId }); await e.t.mutation(api.finance.configureInitialization, { cutoverDate: date, defaultClearingDelayDays: 1 }); assert.equal(await e.t.mutation(api.finance.postOpeningBalance, { accountId: a, amount: 0, date, requestId: "r" }), null); assert.ok((await e.raw.run(ctx => ctx.db.get(a)))?.openingBalancePostedAt); });
test("FIN-10 rejects a repeated opening balance", async () => { const e = await setup(); const a = await e.t.mutation(api.finance.createAccount, { name: "أ", code: "A", type: "cash", branchId: e.branchId }); await e.t.mutation(api.finance.configureInitialization, { cutoverDate: date, defaultClearingDelayDays: 1 }); await e.t.mutation(api.finance.postOpeningBalance, { accountId: a, amount: 0, date, requestId: "one" }); await assert.rejects(e.t.mutation(api.finance.postOpeningBalance, { accountId: a, amount: 1, date, requestId: "two" }), /تم تسجيل/); });
test("FIN-11 refuses confirmation when a branch has no cash account", async () => { const e = await setup(); const a = await e.t.mutation(api.finance.createAccount, { name: "بنك", code: "B", type: "bank", branchId: e.branchId }); await e.t.mutation(api.finance.configureInitialization, { cutoverDate: date, defaultClearingDelayDays: 1 }); await e.t.mutation(api.finance.postOpeningBalance, { accountId: a, amount: 0, date, requestId: "r" }); await assert.rejects(e.t.mutation(api.finance.confirmInitialization, {}), /خزينة نقدية/); });
test("FIN-12 refuses confirmation when an opening balance is missing", async () => { const e = await setup(); await e.t.mutation(api.finance.createAccount, { name: "نقدي", code: "C", type: "cash", branchId: e.branchId }); await e.t.mutation(api.finance.configureInitialization, { cutoverDate: date, defaultClearingDelayDays: 1 }); await assert.rejects(e.t.mutation(api.finance.confirmInitialization, {}), /الرصيد الافتتاحي/); });
test("FIN-13 confirms complete initialization", async () => { const e = await setup(); const a = await e.t.mutation(api.finance.createAccount, { name: "نقدي", code: "C", type: "cash", branchId: e.branchId }); await e.t.mutation(api.finance.configureInitialization, { cutoverDate: date, defaultClearingDelayDays: 1 }); await e.t.mutation(api.finance.postOpeningBalance, { accountId: a, amount: 0, date, requestId: "r" }); await e.t.mutation(api.finance.confirmInitialization, {}); assert.equal((await e.t.query(api.finance.initializationStatus, {})).state, "initialized"); });
test("FIN-14 prevents cutover changes after confirmation", async () => { const e = await setup({ initialized: true }); await assert.rejects(e.t.mutation(api.finance.configureInitialization, { cutoverDate: "2026-08-01", defaultClearingDelayDays: 1 }), /نهائياً/); });

for (const [number, kind, paymentApi, refundApi] of [
  [15, "invoice", api.invoices.recordPayment, api.invoices.refundPayment],
  [16, "order", api.orders.addPayment, api.orders.refundDeposit],
  [17, "repair", api.repairs.recordPayment, api.repairs.refundPayment],
] as const) test(`FIN-${number} collects and refunds ${kind}`, async () => {
  const e = await setup({ initialized: true }), a = await account(e, "CASH", 20), id = await seedDocument(e, kind, 0);
  const paymentArgs = kind === "invoice" ? { invoiceId: id, amount: 40, accountId: a, paymentDate: date, requestId: "pay" } : kind === "order" ? { id, amount: 40, accountId: a, paymentDate: date, requestId: "pay" } : { repairId: id, amount: 40, accountId: a, paymentDate: date, requestId: "pay" };
  await e.t.mutation(paymentApi, paymentArgs);
  const refundArgs = kind === "invoice" ? { invoiceId: id, amount: 10, accountId: a, date, reason: "تصحيح", requestId: "refund" } : kind === "order" ? { id, amount: 10, accountId: a, date, reason: "تصحيح", requestId: "refund" } : { repairId: id, amount: 10, accountId: a, date, reason: "تصحيح", requestId: "refund" };
  await e.t.mutation(refundApi, refundArgs);
  assert.equal((await e.raw.run(ctx => ctx.db.get(a)))?.currentBalance, 50);
});

test("FIN-18 order creation posts its initial deposit", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH"); const id = await e.t.mutation(api.orders.create, { customerName: "عميل", items: [{ productName: "قطعة", quantity: 1, unitPrice: 100 }], total: 100, creationRequestId: "create-order", branchId: e.branchId, customerId: e.customerId, initialDeposit: { amount: 25, accountId: a, paymentDate: date, requestId: "initial" } }); const s = await snapshot(e); assert.ok(s.transactions.some(x => x.referenceId === String(id) && x.type === "order_deposit")); });
test("FIN-19 requestId makes invoice collection idempotent", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH"), id = await seedDocument(e, "invoice", 0); const args = { invoiceId: id, amount: 20, accountId: a, paymentDate: date, requestId: "same" }; assert.equal(await e.t.mutation(api.invoices.recordPayment, args), await e.t.mutation(api.invoices.recordPayment, args)); assert.equal((await snapshot(e)).transactions.length, 1); });
test("FIN-20 requestId makes order collection idempotent", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH"), id = await seedDocument(e, "order", 0); const args = { id, amount: 20, accountId: a, paymentDate: date, requestId: "same" }; assert.equal(await e.t.mutation(api.orders.addPayment, args), await e.t.mutation(api.orders.addPayment, args)); assert.equal((await snapshot(e)).transactions.length, 1); });
test("FIN-21 requestId makes repair collection idempotent", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH"), id = await seedDocument(e, "repair", 0); const args = { repairId: id, amount: 20, accountId: a, paymentDate: date, requestId: "same" }; assert.equal(await e.t.mutation(api.repairs.recordPayment, args), await e.t.mutation(api.repairs.recordPayment, args)); assert.equal((await snapshot(e)).transactions.length, 1); });
test("FIN-22 creates an expense linked to its account and transaction", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH", 100); const id = await e.t.mutation(api.expenses.create, { title: "إيجار", category: "تشغيل", amount: 30, date, accountId: a, requestId: "expense", branchId: e.branchId }); const row = await e.raw.run(ctx => ctx.db.get(id)); assert.ok(row?.financialTransactionId); assert.equal(row?.paymentMethod, "cash"); });
test("FIN-23 expense requestId is idempotent", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH", 100); const args = { title: "إيجار", category: "تشغيل", amount: 30, date, accountId: a, requestId: "same", branchId: e.branchId }; assert.equal(await e.t.mutation(api.expenses.create, args), await e.t.mutation(api.expenses.create, args)); assert.equal((await snapshot(e)).expenses.length, 1); });
test("FIN-24 voids an expense with an atomic financial reversal", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH", 100); const id = await e.t.mutation(api.expenses.create, { title: "إيجار", category: "تشغيل", amount: 30, date, accountId: a, requestId: "create", branchId: e.branchId }); await e.t.mutation(api.expenses.voidExpense, { id, reason: "خطأ", date, requestId: "void" }); const s = await snapshot(e); assert.equal(s.accounts.find(x => x._id === a)?.currentBalance, 100); assert.equal(s.expenses[0]?.status, "voided"); assert.equal(s.transactions.length, 2); });
test("FIN-25 transfers funds between two accounts", async () => { const e = await setup({ initialized: true }), a = await account(e, "A", 100), b = await account(e, "B"); await e.t.mutation(api.finance.transferFunds, { sourceAccountId: a, destinationAccountId: b, amount: 25, date, requestId: "transfer" }); const s = await snapshot(e); assert.equal(s.accounts.find(x => x._id === a)?.currentBalance, 75); assert.equal(s.accounts.find(x => x._id === b)?.currentBalance, 25); });
test("FIN-26 transfer requestId is idempotent", async () => { const e = await setup({ initialized: true }), a = await account(e, "A", 100), b = await account(e, "B"); const args = { sourceAccountId: a, destinationAccountId: b, amount: 25, date, requestId: "same" }; assert.equal(await e.t.mutation(api.finance.transferFunds, args), await e.t.mutation(api.finance.transferFunds, args)); assert.equal((await snapshot(e)).transactions.length, 1); });
test("FIN-27 prevents a negative balance unless explicitly allowed", async () => { const e = await setup({ initialized: true }), a = await account(e, "A", 5), b = await account(e, "B"); await assert.rejects(e.t.mutation(api.finance.transferFunds, { sourceAccountId: a, destinationAccountId: b, amount: 6, date, requestId: "r" }), /الرصيد غير كاف/); });
test("FIN-28 permits a negative balance when explicitly allowed", async () => { const e = await setup({ initialized: true }), a = await account(e, "A", 5, "cash", e.branchId, true), b = await account(e, "B"); await e.t.mutation(api.finance.transferFunds, { sourceAccountId: a, destinationAccountId: b, amount: 6, date, requestId: "r" }); assert.equal((await e.raw.run(ctx => ctx.db.get(a)))?.currentBalance, -1); });
test("FIN-29 reports clearing available and pending balances", async () => { const e = await setup({ initialized: true }), clearing = await account(e, "CLEAR", 0, "paymob_clearing", e.branchId, false, 2), cash = await account(e, "CASH", 100); await e.t.mutation(api.finance.transferFunds, { sourceAccountId: cash, destinationAccountId: clearing, amount: 40, date, requestId: "fund" }); const rows = await e.t.query(api.finance.accounts, { branchId: e.branchId, onDate: date }); const row = rows.find(x => x._id === clearing); assert.equal(row?.availableBalance, 0); assert.equal(row?.pendingBalance, 40); });
test("FIN-30 settles clearing gross amount and fees", async () => { const e = await setup({ initialized: true }), clearing = await account(e, "CLEAR", 0, "paymob_clearing", e.branchId, false, 0), cash = await account(e, "CASH", 100), bank = await account(e, "BANK", 0, "bank"); await e.t.mutation(api.finance.transferFunds, { sourceAccountId: cash, destinationAccountId: clearing, amount: 40, date, requestId: "fund" }); await e.t.mutation(api.finance.settleClearingAccount, { sourceAccountId: clearing, destinationAccountId: bank, grossAmount: 40, feeAmount: 3, settlementDate: date, requestId: "settle" }); const s = await snapshot(e); assert.equal(s.accounts.find(x => x._id === bank)?.currentBalance, 37); assert.equal(s.transactions.find(x => x.type === "paymob_settlement")?.feeAmount, 3); });
test("FIN-31 rejects settlement exceeding available balance", async () => { const e = await setup({ initialized: true }), clearing = await account(e, "CLEAR", 0, "paymob_clearing", e.branchId, false, 2), cash = await account(e, "CASH", 100), bank = await account(e, "BANK", 0, "bank"); await e.t.mutation(api.finance.transferFunds, { sourceAccountId: cash, destinationAccountId: clearing, amount: 40, date, requestId: "fund" }); await assert.rejects(e.t.mutation(api.finance.settleClearingAccount, { sourceAccountId: clearing, destinationAccountId: bank, grossAmount: 1, feeAmount: 0, settlementDate: date, requestId: "settle" }), /المتاح/); });
test("FIN-32 reverses an eligible transfer", async () => { const e = await setup({ initialized: true }), a = await account(e, "A", 100), b = await account(e, "B"); const tx = await e.t.mutation(api.finance.transferFunds, { sourceAccountId: a, destinationAccountId: b, amount: 25, date, requestId: "transfer" }); await e.t.mutation(api.finance.reverseTransaction, { transactionId: tx, reason: "خطأ", date, requestId: "reverse" }); const s = await snapshot(e); assert.equal(s.accounts.find(x => x._id === a)?.currentBalance, 100); assert.equal(s.transactions.find(x => x._id === tx)?.status, "reversed"); });
test("FIN-33 rejects generic reversal of document collections", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH"), id = await seedDocument(e, "invoice", 0); const tx = await e.t.mutation(api.invoices.recordPayment, { invoiceId: id, amount: 20, accountId: a, paymentDate: date, requestId: "pay" }); await assert.rejects(e.t.mutation(api.finance.reverseTransaction, { transactionId: tx, reason: "خطأ", date, requestId: "reverse" }), /مسار الاسترداد/); });
test("FIN-34 keeps currentBalance equal to the movement chain", async () => { const e = await setup({ initialized: true }), a = await account(e, "A", 100), b = await account(e, "B"); await e.t.mutation(api.finance.transferFunds, { sourceAccountId: a, destinationAccountId: b, amount: 25, date, requestId: "one" }); await e.t.mutation(api.finance.transferFunds, { sourceAccountId: b, destinationAccountId: a, amount: 10, date, requestId: "two" }); const s = await snapshot(e); for (const row of s.accounts) { const delta = s.movements.filter(x => x.accountId === row._id).reduce((sum, x) => sum + x.signedAmount, 0); assert.equal(row.currentBalance, (row.code === "A" ? 100 : 0) + delta); } });
test("FIN-35 never writes new rows to legacy payments", async () => { const e = await setup({ initialized: true }), a = await account(e, "CASH"), id = await seedDocument(e, "invoice", 0); await e.t.mutation(api.invoices.recordPayment, { invoiceId: id, amount: 20, accountId: a, paymentDate: date, requestId: "pay" }); assert.equal((await snapshot(e)).payments.length, 0); });
test("FIN-36 isolates finance data and permissions by role and branch", async () => { const e = await setup({ initialized: true, secondBranch: true }); assert.ok(e.branch2Id); await account(e, "A", 0, "cash", e.branchId); await account(e, "B", 0, "cash", e.branch2Id); await e.raw.run(ctx => ctx.db.insert("userProfiles", { userId: "employee", tokenIdentifier: "employee", name: "موظف", role: "employee", branchId: e.branchId, permissions: ["view_finance"], isActive: true })); const employee = e.raw.withIdentity({ subject: "employee", tokenIdentifier: "employee" }); const rows = await employee.query(api.finance.accounts, {}); assert.equal(rows.length, 1); await assert.rejects(employee.mutation(api.finance.createAccount, { name: "X", code: "X", type: "cash", branchId: e.branchId }), /صلاحية/); });

test("FIN-37 invoice creation atomically posts one idempotent initial payment", async () => {
  const e = await setup({ initialized: true }), a = await account(e, "CASH"), base = await invoiceCreationArgs(e, "invoice-create");
  const args = { ...base, initialPayment: { amount: 40, accountId: a, paymentDate: date, requestId: "invoice-initial" } };
  const id = await e.t.mutation(api.invoices.create, args); assert.equal(await e.t.mutation(api.invoices.create, args), id);
  const s = await snapshot(e), row = await e.raw.run(ctx => ctx.db.get(id));
  assert.deepEqual({ paid: row?.paid, remaining: row?.remaining, status: row?.status }, { paid: 40, remaining: 74, status: "partial" });
  assert.equal(s.transactions.filter(x => x.referenceId === String(id) && x.type === "invoice_payment").length, 1); assert.equal(s.accounts.find(x => x._id === a)?.currentBalance, 40);
});

test("FIN-38 order creation atomically posts one idempotent initial deposit", async () => {
  const e = await setup({ initialized: true }), a = await account(e, "CASH"), args = { ...orderCreationArgs(e.branchId, "order-create-2", e.customerId), initialDeposit: { amount: 25, accountId: a, paymentDate: date, requestId: "order-initial" } };
  const id = await e.t.mutation(api.orders.create, args); assert.equal(await e.t.mutation(api.orders.create, args), id); const s = await snapshot(e), row = await e.raw.run(ctx => ctx.db.get(id));
  assert.deepEqual({ deposit: row?.deposit, remaining: row?.remaining, status: row?.status }, { deposit: 25, remaining: 75, status: "pending" }); assert.equal(s.transactions.filter(x => x.referenceId === String(id)).length, 1); assert.equal(s.accounts.find(x => x._id === a)?.currentBalance, 25);
});

test("FIN-39 repair creation atomically posts one idempotent initial deposit", async () => {
  const e = await setup({ initialized: true }), a = await account(e, "CASH"), args = { ...repairCreationArgs(e.branchId, "repair-create"), initialDeposit: { amount: 30, accountId: a, paymentDate: date, requestId: "repair-initial" } };
  const id = await e.t.mutation(api.repairs.create, args); assert.equal(await e.t.mutation(api.repairs.create, args), id); const s = await snapshot(e), row = await e.raw.run(ctx => ctx.db.get(id));
  assert.deepEqual({ deposit: row?.deposit, remaining: row?.remaining, status: row?.status }, { deposit: 30, remaining: 70, status: "received" }); assert.equal(s.transactions.filter(x => x.referenceId === String(id)).length, 1); assert.equal(s.accounts.find(x => x._id === a)?.currentBalance, 30);
});

test("FIN-40 document creation without an initial payment leaves finance untouched", async () => {
  const e = await setup({ initialized: true }), a = await account(e, "CASH", 11), invoiceArgs = await invoiceCreationArgs(e, "invoice-no-pay");
  await e.t.mutation(api.invoices.create, invoiceArgs); await e.t.mutation(api.orders.create, orderCreationArgs(e.branchId, "order-no-pay")); await e.t.mutation(api.repairs.create, repairCreationArgs(e.branchId, "repair-no-pay"));
  const s = await snapshot(e); assert.equal(s.transactions.length, 0); assert.equal(s.movements.length, 0); assert.equal(s.accounts.find(x => x._id === a)?.currentBalance, 11);
});

test("FIN-41 initial payments reject inactive, cross-branch, pre-cutover, non-positive, and excess inputs", async () => {
  const e = await setup({ initialized: true, secondBranch: true }), active = await account(e, "ACTIVE"), inactive = await account(e, "OFF"), foreign = await account(e, "FOREIGN", 0, "cash", e.branch2Id!); await e.raw.run(ctx => ctx.db.patch(inactive, { isActive: false }));
  const attempt = async (suffix: string, payment: { amount: number; accountId: typeof active; paymentDate: string; requestId: string }) => e.t.mutation(api.orders.create, { ...orderCreationArgs(e.branchId, `reject-${suffix}`, e.customerId), initialDeposit: payment });
  await assert.rejects(attempt("inactive", { amount: 1, accountId: inactive, paymentDate: date, requestId: "i" }), /معطل/); await assert.rejects(attempt("foreign", { amount: 1, accountId: foreign, paymentDate: date, requestId: "f" }), /لا ينتمي/); await assert.rejects(attempt("date", { amount: 1, accountId: active, paymentDate: "2026-07-20", requestId: "d" }), /تاريخ القطع/); await assert.rejects(attempt("zero", { amount: 0, accountId: active, paymentDate: date, requestId: "z" }), /أكبر من صفر/); await assert.rejects(attempt("negative", { amount: -1, accountId: active, paymentDate: date, requestId: "n" }), /أكبر من صفر/); await assert.rejects(attempt("excess", { amount: 101, accountId: active, paymentDate: date, requestId: "e" }), /إجمالي/);
  assert.equal((await snapshot(e)).transactions.length, 0);
});

for (const [number, kind, refundApi] of [[42, "invoice", api.invoices.refundPayment], [43, "order", api.orders.refundDeposit], [44, "repair", api.repairs.refundPayment]] as const) test(`FIN-${number} ${kind} refund is idempotent and updates document and account`, async () => {
  const e = await setup({ initialized: true }), a = await account(e, "CASH", 50), id = await seedDocument(e, kind, 50);
  const args = kind === "invoice" ? { invoiceId: id, amount: 50, accountId: a, date, reason: "استرداد", requestId: "same-refund" } : kind === "order" ? { id, amount: 50, accountId: a, date, reason: "استرداد", requestId: "same-refund" } : { repairId: id, amount: 50, accountId: a, date, reason: "استرداد", requestId: "same-refund" };
  const tx = await e.t.mutation(refundApi, args); assert.equal(await e.t.mutation(refundApi, args), tx); const s = await snapshot(e), row = await e.raw.run(ctx => ctx.db.get(id));
  assert.equal(s.transactions.filter(x => x.type.endsWith("refund")).length, 1); assert.equal(s.accounts.find(x => x._id === a)?.currentBalance, 0); assert.equal(kind === "invoice" ? row?.paid : row?.deposit, 0); assert.equal(row?.remaining, 100); if (kind === "invoice") assert.equal(row?.status, "unpaid");
  await assert.rejects(e.t.mutation(refundApi, { ...args, amount: 1, requestId: "excess-refund" }), /غير صالح/);
});

test("FIN-45 refunds reject inactive and cross-branch accounts", async () => {
  const e = await setup({ initialized: true, secondBranch: true }), inactive = await account(e, "OFF", 100), foreign = await account(e, "OTHER", 100, "cash", e.branch2Id!), id = await seedDocument(e, "invoice", 20); await e.raw.run(ctx => ctx.db.patch(inactive, { isActive: false }));
  const base = { invoiceId: id, amount: 10, date, reason: "استرداد" };
  await assert.rejects(e.t.mutation(api.invoices.refundPayment, { ...base, accountId: inactive, requestId: "inactive" }), /معطل/); await assert.rejects(e.t.mutation(api.invoices.refundPayment, { ...base, accountId: foreign, requestId: "foreign" }), /لا ينتمي/); assert.equal((await snapshot(e)).transactions.length, 0);
});

test("FIN-46 generic reversal rejects every document collection type", async () => {
  const e = await setup({ initialized: true }), a = await account(e, "CASH");
  for (const kind of ["invoice", "order", "repair"] as const) { const id = await seedDocument(e, kind, 0); const tx = kind === "invoice" ? await e.t.mutation(api.invoices.recordPayment, { invoiceId: id, amount: 10, accountId: a, paymentDate: date, requestId: `pay-${kind}` }) : kind === "order" ? await e.t.mutation(api.orders.addPayment, { id, amount: 10, accountId: a, paymentDate: date, requestId: `pay-${kind}` }) : await e.t.mutation(api.repairs.recordPayment, { repairId: id, amount: 10, accountId: a, paymentDate: date, requestId: `pay-${kind}` }); await assert.rejects(e.t.mutation(api.finance.reverseTransaction, { transactionId: tx, reason: "خطأ", date, requestId: `reverse-${kind}` }), /مسار الاسترداد/); }
});
