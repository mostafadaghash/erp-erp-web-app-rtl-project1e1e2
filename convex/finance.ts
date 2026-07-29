import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v, ConvexError } from "convex/values";
import { assertBranchAccess, requireAdmin, requirePermission, resolveWriteBranch } from "./lib/auth";
import { assertFinancialAccountBranch, calculateAvailableBalance, findFinancialTransactionByRequest, postFinancialTransaction, requireActiveFinancialAccount } from "./lib/finance";
import { isValidIsoDate, roundMoney } from "../shared/businessRules";

const accountType = v.union(v.literal("cash"), v.literal("instapay"), v.literal("vodafone_cash"), v.literal("fawry_clearing"), v.literal("paymob_clearing"), v.literal("card_clearing"), v.literal("bank"), v.literal("other"));
const clearingTypes = ["paymob_clearing", "fawry_clearing", "card_clearing"] as const;

export const createAccount = mutation({ args: { name: v.string(), code: v.string(), type: accountType, branchId: v.optional(v.id("branches")), allowNegative: v.optional(v.boolean()), settlementDelayDays: v.optional(v.number()) }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "manage_financial_accounts");
  const branchId = resolveWriteBranch(user, args.branchId);
  if (!branchId) throw new ConvexError("الفرع مطلوب");
  const branch = await ctx.db.get(branchId); if (!branch?.isActive) throw new ConvexError("الفرع غير نشط");
  const code = args.code.trim().toUpperCase(), name = args.name.trim(); if (!code || !name) throw new ConvexError("اسم وكود الحساب مطلوبان");
  const uniqueKey = `${branchId}:${code}`;
  if (await ctx.db.query("financialAccounts").withIndex("by_unique_key", q => q.eq("uniqueKey", uniqueKey)).unique()) throw new ConvexError("كود الحساب مستخدم داخل الفرع");
  const delay = args.settlementDelayDays ?? (args.type === "paymob_clearing" ? 1 : 0);
  if (!Number.isInteger(delay) || delay < 0) throw new ConvexError("مدة التسوية غير صالحة");
  return await ctx.db.insert("financialAccounts", { name, code, uniqueKey, type: args.type, branchId, isActive: true, currentBalance: 0,
    allowNegative: args.allowNegative ?? false, settlementDelayDays: delay, createdAt: Date.now(), createdBy: user.userId, updatedAt: Date.now() });
} });

export const updateAccount = mutation({ args: { accountId: v.id("financialAccounts"), name: v.optional(v.string()), type: v.optional(accountType), settlementDelayDays: v.optional(v.number()), isActive: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "manage_financial_accounts"); const account = await ctx.db.get(args.accountId); if (!account) throw new ConvexError("الحساب غير موجود"); assertBranchAccess(user, account);
  if (args.isActive === false && account.currentBalance !== 0) throw new ConvexError("لا يمكن تعطيل حساب رصيده غير صفر");
  if (args.type && args.type !== account.type && await ctx.db.query("financialMovements").withIndex("by_account", q => q.eq("accountId", account._id)).first()) throw new ConvexError("لا يمكن تغيير نوع حساب له حركات");
  if (args.settlementDelayDays !== undefined && (!Number.isInteger(args.settlementDelayDays) || args.settlementDelayDays < 0)) throw new ConvexError("مدة التسوية غير صالحة");
  await ctx.db.patch(account._id, { name: args.name?.trim() || account.name, type: args.type ?? account.type, settlementDelayDays: args.settlementDelayDays ?? account.settlementDelayDays, isActive: args.isActive ?? account.isActive, updatedAt: Date.now() });
} });

export const configureInitialization = mutation({ args: { cutoverDate: v.string(), defaultClearingDelayDays: v.number() }, handler: async (ctx, args) => {
  await requirePermission(ctx, "initialize_finance"); if (!isValidIsoDate(args.cutoverDate)) throw new ConvexError("تاريخ بدء النظام غير صالح");
  const settings = await ctx.db.query("financeSettings").first(); if (settings?.isInitialized) throw new ConvexError("تم تشغيل النظام المالي نهائياً");
  if (settings) await ctx.db.patch(settings._id, { cutoverDate: args.cutoverDate, defaultClearingDelayDays: args.defaultClearingDelayDays, updatedAt: Date.now() });
  else await ctx.db.insert("financeSettings", { isInitialized: false, cutoverDate: args.cutoverDate, defaultClearingDelayDays: args.defaultClearingDelayDays, updatedAt: Date.now() });
} });

export const postOpeningBalance = mutation({ args: { accountId: v.id("financialAccounts"), amount: v.number(), date: v.string(), requestId: v.string() }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "initialize_finance"); const account = await requireActiveFinancialAccount(ctx, args.accountId); assertBranchAccess(user, account);
  const settings = await ctx.db.query("financeSettings").first(); if (!settings) throw new ConvexError("أدخل تاريخ بدء النظام أولاً"); if (settings.isInitialized) throw new ConvexError("تم تشغيل النظام المالي نهائياً");
  if (!isValidIsoDate(args.date) || args.date < settings.cutoverDate) throw new ConvexError("تاريخ الرصيد الافتتاحي غير صالح");
  if (!Number.isFinite(args.amount) || args.amount < 0) throw new ConvexError("الرصيد الافتتاحي غير صالح");
  if (account.openingBalancePostedAt) throw new ConvexError("تم تسجيل رصيد افتتاحي لهذا الحساب");
  if (account.currentBalance !== 0) throw new ConvexError("الحساب لا يبدأ من صفر");
  if (args.amount === 0) { await ctx.db.patch(account._id, { openingBalancePostedAt: Date.now(), updatedAt: Date.now() }); return null; }
  const posted = await postFinancialTransaction(ctx, user, { type: "opening_balance", requestId: args.requestId, date: args.date, amount: args.amount,
    description: `رصيد افتتاحي: ${account.name}`, branchId: account.branchId, referenceType: "opening_account", referenceId: String(account._id), movements: [{ accountId: account._id, signedAmount: args.amount }], allowBeforeInitialization: true });
  if (!posted.duplicate) await ctx.db.patch(account._id, { openingBalancePostedAt: Date.now(), updatedAt: Date.now() }); return posted.transactionId;
} });

export const confirmInitialization = mutation({ args: {}, handler: async (ctx) => { const user = await requirePermission(ctx, "initialize_finance"); const settings = await ctx.db.query("financeSettings").first(); if (!settings) throw new ConvexError("أدخل تاريخ بدء النظام أولاً"); if (settings.isInitialized) throw new ConvexError("تم تشغيل النظام المالي بالفعل");
  const branches = await ctx.db.query("branches").collect(); for (const branch of branches.filter(b => b.isActive)) { const accounts = await ctx.db.query("financialAccounts").withIndex("by_branch", q => q.eq("branchId", branch._id)).collect(); if (!accounts.some(a => a.isActive && a.type === "cash")) throw new ConvexError(`يجب إنشاء خزينة نقدية نشطة للفرع: ${branch.name}`); if (accounts.some(a => !a.openingBalancePostedAt)) throw new ConvexError(`يجب تسجيل الرصيد الافتتاحي لكل حساب في الفرع: ${branch.name}`); }
  await ctx.db.patch(settings._id, { isInitialized: true, initializedAt: Date.now(), initializedBy: user.userId, updatedAt: Date.now() });
} });

export const transferFunds = mutation({ args: { sourceAccountId: v.id("financialAccounts"), destinationAccountId: v.id("financialAccounts"), amount: v.number(), date: v.string(), requestId: v.string(), notes: v.optional(v.string()) }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "transfer_funds"); if (args.sourceAccountId === args.destinationAccountId) throw new ConvexError("اختر حسابين مختلفين"); const source = await requireActiveFinancialAccount(ctx, args.sourceAccountId), destination = await requireActiveFinancialAccount(ctx, args.destinationAccountId);
  if (user.role !== "admin" && user.role !== "accountant") { assertBranchAccess(user, source); assertBranchAccess(user, destination); }
  return (await postFinancialTransaction(ctx, user, { type: "account_transfer", requestId: args.requestId, date: args.date, amount: args.amount, description: args.notes?.trim() || `تحويل من ${source.name} إلى ${destination.name}`, branchId: source.branchId, destinationBranchId: destination.branchId, movements: [{ accountId: source._id, signedAmount: -args.amount }, { accountId: destination._id, signedAmount: args.amount }] })).transactionId;
} });

export const settleClearingAccount = mutation({ args: { sourceAccountId: v.id("financialAccounts"), destinationAccountId: v.id("financialAccounts"), grossAmount: v.number(), feeAmount: v.number(), settlementDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "settle_clearing_accounts"), source = await requireActiveFinancialAccount(ctx, args.sourceAccountId), destination = await requireActiveFinancialAccount(ctx, args.destinationAccountId); assertBranchAccess(user, source); assertBranchAccess(user, destination);
  if (source.branchId !== destination.branchId) throw new ConvexError("لا يمكن التسوية بين فرعين مختلفين");
  if (!clearingTypes.includes(source.type as typeof clearingTypes[number])) throw new ConvexError("الحساب المصدر ليس حساب تسوية"); if (destination.type !== "bank" && destination.type !== "cash") throw new ConvexError("وجهة التسوية يجب أن تكون بنكاً أو خزينة نقدية");
  const gross = roundMoney(args.grossAmount), fee = roundMoney(args.feeAmount); if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(fee) || fee < 0 || fee > gross) throw new ConvexError("مبالغ التسوية غير صالحة");
  if (gross > await calculateAvailableBalance(ctx, source._id, args.settlementDate)) throw new ConvexError("الرصيد المتاح للتسوية غير كافٍ");
  return (await postFinancialTransaction(ctx, user, { type: source.type === "paymob_clearing" ? "paymob_settlement" : "clearing_settlement", requestId: args.requestId, date: args.settlementDate, amount: gross, feeAmount: fee, description: args.notes?.trim() || `تسوية ${source.name}`, branchId: source.branchId, movements: [{ accountId: source._id, signedAmount: -gross }, { accountId: destination._id, signedAmount: gross - fee }] })).transactionId;
} });

export const reverseTransaction = mutation({ args: { transactionId: v.id("financialTransactions"), reason: v.string(), date: v.string(), requestId: v.string() }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "reverse_financial_transactions"), original = await ctx.db.get(args.transactionId); if (!original) throw new ConvexError("المعاملة غير موجودة"); assertBranchAccess(user, original);
  const reason = args.reason.trim(); if (!reason) throw new ConvexError("سبب العكس مطلوب");
  const reversalDescription = `عكس ${original.transactionNumber}: ${reason}`;
  const retry = await findFinancialTransactionByRequest(ctx, "reversal", user.userId, args.requestId);
  if (retry) {
    if (retry.originalTransactionId !== original._id || retry.date !== args.date || retry.description !== reversalDescription) throw new ConvexError("معرف طلب العكس مستخدم ببيانات مختلفة");
    return retry._id;
  }
  if (original.status === "reversed" || original.reversalTransactionId) throw new ConvexError("تم عكس المعاملة سابقاً");
  if (!["opening_balance", "account_transfer", "paymob_settlement", "clearing_settlement"].includes(original.type)) throw new ConvexError("استخدم مسار الاسترداد الخاص بالمستند للحفاظ على اتساقه");
  const movements = await ctx.db.query("financialMovements").withIndex("by_transaction", q => q.eq("transactionId", original._id)).collect();
  const posted = await postFinancialTransaction(ctx, user, { type: "reversal", requestId: args.requestId, date: args.date, amount: original.amount, feeAmount: 0, description: reversalDescription, branchId: original.branchId, destinationBranchId: original.destinationBranchId, referenceType: "financial_transaction", referenceId: String(original._id), referenceNumber: original.transactionNumber, originalTransactionId: original._id, movements: movements.map(movement => ({ accountId: movement.accountId, signedAmount: -movement.signedAmount })) });
  if (!posted.duplicate) await ctx.db.patch(original._id, { status: "reversed", reversedAt: Date.now(), reversedBy: user.userId, reversalReason: reason, reversalTransactionId: posted.transactionId });
  return posted.transactionId;
} });

export const collectionAccountPicker = query({ args: {}, handler: async ctx => { const user = await requirePermission(ctx, "record_collections"); const accounts = await ctx.db.query("financialAccounts").withIndex("by_active", q => q.eq("isActive", true)).collect(); return accounts.filter(a => user.role === "admin" || user.role === "accountant" || a.branchId === user.branchId).map(({ _id, name, type, branchId }) => ({ _id, name, type, branchId })); } });
export const refundAccountPicker = query({ args: {}, handler: async ctx => { const user = await requirePermission(ctx, "refund_collections"); const accounts = await ctx.db.query("financialAccounts").withIndex("by_active", q => q.eq("isActive", true)).collect(); return accounts.filter(a => user.role === "admin" || user.role === "accountant" || a.branchId === user.branchId).map(({ _id, name, type, branchId }) => ({ _id, name, type, branchId })); } });
export const disbursementAccountPicker = query({ args: {}, handler: async ctx => { const user = await requirePermission(ctx, "record_disbursements"); const accounts = await ctx.db.query("financialAccounts").withIndex("by_active", q => q.eq("isActive", true)).collect(); return accounts.filter(a => user.role === "admin" || user.role === "accountant" || a.branchId === user.branchId).map(({ _id, name, type, branchId }) => ({ _id, name, type, branchId })); } });
export const accounts = query({ args: { branchId: v.optional(v.id("branches")), onDate: v.optional(v.string()) }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_finance"); const branchId = user.role === "admin" || user.role === "accountant" ? args.branchId : user.branchId; const rows = branchId ? await ctx.db.query("financialAccounts").withIndex("by_branch", q => q.eq("branchId", branchId)).collect() : await ctx.db.query("financialAccounts").collect(); return await Promise.all(rows.map(async account => { const availableBalance = await calculateAvailableBalance(ctx, account._id, args.onDate ?? new Date().toISOString().slice(0, 10)); return { ...account, availableBalance, pendingBalance: roundMoney(account.currentBalance - availableBalance) }; })); } });
export const initializationStatus = query({ args: {}, handler: async ctx => { await requirePermission(ctx, "view_finance"); const settings = await ctx.db.query("financeSettings").first(); const accounts = await ctx.db.query("financialAccounts").collect(); return { state: !settings ? "unconfigured" : settings.isInitialized ? "initialized" : "configuring", settings, accountCount: accounts.length, openingBalancesRemaining: accounts.filter(a => !a.openingBalancePostedAt).length }; } });
export const ledger = query({ args: { branchId: v.optional(v.id("branches")), accountId: v.optional(v.id("financialAccounts")), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_finance"); const branchId = user.role === "admin" || user.role === "accountant" ? args.branchId : user.branchId; if (!branchId) throw new ConvexError("اختر فرعاً"); const page = args.accountId ? await ctx.db.query("financialMovements").withIndex("by_account", q => q.eq("accountId", args.accountId!)).order("desc").paginate(args.paginationOpts) : await ctx.db.query("financialMovements").withIndex("by_branch_date", q => q.eq("branchId", branchId)).order("desc").paginate(args.paginationOpts); return { ...page, page: await Promise.all(page.page.map(async movement => { const transaction = await ctx.db.get(movement.transactionId); const [account, branch, employee, supplier] = await Promise.all([ctx.db.get(movement.accountId), ctx.db.get(movement.branchId), transaction ? ctx.db.query("userProfiles").withIndex("by_user", q => q.eq("userId", transaction.userId)).first() : null, transaction?.supplierId ? ctx.db.get(transaction.supplierId) : null]); if (!account || !transaction) throw new ConvexError("حركة مالية غير مكتملة"); return { ...movement, accountName: account.name, accountType: account.type, branchName: branch?.name ?? "—", transactionNumber: transaction.transactionNumber, transactionType: transaction.type, description: transaction.description, referenceNumber: transaction.referenceNumber, customerId: transaction.customerId, supplierId: transaction.supplierId, supplierName: supplier?.name, employeeName: employee?.name ?? transaction.userId, transactionStatus: transaction.status, feeAmount: transaction.feeAmount, incoming: movement.signedAmount > 0 ? movement.signedAmount : 0, outgoing: movement.signedAmount < 0 ? -movement.signedAmount : 0 }; })) }; } });

export const legacyReview = query({ args: {}, handler: async ctx => { await requirePermission(ctx, "initialize_finance"); const [invoices, orders, repairs, expenses, payments] = await Promise.all([ctx.db.query("invoices").collect(), ctx.db.query("orders").collect(), ctx.db.query("repairs").collect(), ctx.db.query("expenses").collect(), ctx.db.query("payments").collect()]); return { invoicesWithPaid: invoices.filter(x => x.paid > 0).length, ordersWithDeposit: orders.filter(x => x.deposit > 0).length, repairsWithDeposit: repairs.filter(x => x.deposit > 0).length, expenses: expenses.length, legacyPayments: payments.length, requiresMigrationDecision: payments.length > 0 }; } });
export const legacyPaymentsCount = query({ args: {}, handler: async ctx => { await requireAdmin(ctx); return { count: (await ctx.db.query("payments").collect()).length }; } });

export const referenceTransactions = query({ args: { referenceType: v.string(), referenceId: v.string() }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_finance"); const rows = await ctx.db.query("financialTransactions").withIndex("by_reference", q => q.eq("referenceType", args.referenceType).eq("referenceId", args.referenceId)).collect(); return rows.filter(row => user.role === "admin" || user.role === "accountant" || row.branchId === user.branchId); } });

export const dailySummary = query({ args: { branchId: v.id("branches"), date: v.string() }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_finance"); assertBranchAccess(user, { branchId: args.branchId }); if (!isValidIsoDate(args.date)) throw new ConvexError("التاريخ غير صالح"); const movements = await ctx.db.query("financialMovements").withIndex("by_branch_date", q => q.eq("branchId", args.branchId).eq("date", args.date)).collect(); const opening = roundMoney(movements.reduce((sum, m) => sum + m.balanceBefore, 0)); const incoming = roundMoney(movements.filter(m => m.signedAmount > 0).reduce((s, m) => s + m.signedAmount, 0)); const outgoing = roundMoney(movements.filter(m => m.signedAmount < 0).reduce((s, m) => s - m.signedAmount, 0)); const accounts = await ctx.db.query("financialAccounts").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect(); return { openingBalance: opening, incoming, outgoing, netMovement: roundMoney(incoming - outgoing), closingBalance: roundMoney(accounts.reduce((s, a) => s + a.currentBalance, 0)), pending: roundMoney(accounts.reduce((s, a) => s + a.currentBalance, 0) - (await Promise.all(accounts.map(a => calculateAvailableBalance(ctx, a._id, args.date)))).reduce((s, n) => s + n, 0)), availableForSettlement: roundMoney((await Promise.all(accounts.map(a => calculateAvailableBalance(ctx, a._id, args.date)))).reduce((s, n) => s + n, 0)) }; } });

export const collectionSummary = query({ args: { branchId: v.id("branches"), date: v.string() }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_finance"); assertBranchAccess(user, { branchId: args.branchId }); const transactions = await ctx.db.query("financialTransactions").withIndex("by_branch_date", q => q.eq("branchId", args.branchId).eq("date", args.date)).collect(); const rows = transactions.filter(t => ["invoice_payment", "invoice_refund", "order_deposit", "order_refund", "repair_payment", "repair_refund"].includes(t.type)); return { rows, totalCollections: roundMoney(rows.filter(t => !t.type.endsWith("refund")).reduce((s, t) => s + t.amount, 0)), totalRefunds: roundMoney(rows.filter(t => t.type.endsWith("refund")).reduce((s, t) => s + t.amount, 0)), netCollections: roundMoney(rows.reduce((s, t) => s + (t.type.endsWith("refund") ? -t.amount : t.amount), 0)) }; } });
