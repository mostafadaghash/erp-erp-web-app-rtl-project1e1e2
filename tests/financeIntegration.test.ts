import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";
import { symlink, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const extensionlessModules = [
  ["convex/_generated/server", "server.js"], ["convex/lib/auth", "auth.ts"],
  ["convex/lib/finance", "finance.ts"], ["convex/lib/documentNumbers", "documentNumbers.ts"],
  ["convex/lib/permissions", "permissions.ts"], ["shared/businessRules", "businessRules.ts"],
] as const;

async function installNodeResolutionLinks() {
  for (const [path, target] of extensionlessModules) if (!existsSync(resolve(path))) await symlink(target, resolve(path));
}
async function removeNodeResolutionLinks() {
  for (const [path] of extensionlessModules) if (existsSync(resolve(path))) await unlink(resolve(path));
}

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "../convex/finance.ts": () => import("../convex/finance.ts"),
  "../convex/branches.ts": () => import("../convex/branches.ts"),
  "../convex/auditLogs.ts": () => import("../convex/auditLogs.ts"),
};

const permissions = ["view_finance", "manage_financial_accounts", "initialize_finance", "transfer_funds", "record_collections", "record_disbursements", "settle_clearing_accounts", "reverse_financial_transactions"];

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const branchId = await ctx.db.insert("branches", { name: "القاهرة", address: "القاهرة", isActive: true });
    await ctx.db.insert("userProfiles", { userId: "admin", tokenIdentifier: "admin", name: "مدير الاختبار", role: "admin", branchId, permissions, isActive: true });
    return { branchId };
  });
  return { t: t.withIdentity({ subject: "admin", tokenIdentifier: "admin" }), raw: t, ...ids };
}

test("Convex financial harness enforces initialization and atomic idempotent ledger movements", async () => {
  await installNodeResolutionLinks();
  try {
  const { t, raw, branchId } = await setup();
  const cash = await t.mutation(api.finance.createAccount, { name: "الخزينة", code: "CASH", type: "cash", branchId });
  const bank = await t.mutation(api.finance.createAccount, { name: "البنك", code: "BANK", type: "bank", branchId });
  await assert.rejects(t.mutation(api.finance.transferFunds, { sourceAccountId: cash, destinationAccountId: bank, amount: 1, date: "2026-07-21", requestId: "before-init" }), /غير مهيأ/);
  await assert.rejects(t.mutation(api.finance.createAccount, { name: "مكرر", code: "cash", type: "cash", branchId }), /مستخدم/);
  await t.mutation(api.finance.configureInitialization, { cutoverDate: "2026-07-21", defaultClearingDelayDays: 1 });
  await t.mutation(api.finance.postOpeningBalance, { accountId: cash, amount: 1000, date: "2026-07-21", requestId: "opening-cash" });
  await t.mutation(api.finance.postOpeningBalance, { accountId: bank, amount: 0, date: "2026-07-21", requestId: "opening-bank" });
  await assert.rejects(t.mutation(api.finance.postOpeningBalance, { accountId: cash, amount: 1, date: "2026-07-21", requestId: "opening-again" }), /تم تسجيل/);
  await t.mutation(api.finance.confirmInitialization, {});
  await assert.rejects(t.mutation(api.finance.configureInitialization, { cutoverDate: "2026-07-22", defaultClearingDelayDays: 1 }), /نهائياً/);
  const first = await t.mutation(api.finance.transferFunds, { sourceAccountId: cash, destinationAccountId: bank, amount: 250, date: "2026-07-21", requestId: "transfer-1" });
  const duplicate = await t.mutation(api.finance.transferFunds, { sourceAccountId: cash, destinationAccountId: bank, amount: 250, date: "2026-07-21", requestId: "transfer-1" });
  assert.equal(first, duplicate);
  const snapshot = await raw.run(async ctx => ({ accounts: await ctx.db.query("financialAccounts").collect(), transactions: await ctx.db.query("financialTransactions").collect(), movements: await ctx.db.query("financialMovements").collect() }));
  assert.equal(snapshot.accounts.find(a => a._id === cash)?.currentBalance, 750);
  assert.equal(snapshot.accounts.find(a => a._id === bank)?.currentBalance, 250);
  assert.equal(snapshot.transactions.filter(tx => tx.type === "account_transfer").length, 1);
  assert.equal(snapshot.movements.filter(m => m.transactionId === first).length, 2);
  await assert.rejects(t.mutation(api.finance.transferFunds, { sourceAccountId: cash, destinationAccountId: bank, amount: 1, date: "2026-07-20", requestId: "before-cutover" }), /يسبق تاريخ القطع/);
  } finally { await removeNodeResolutionLinks(); }
});
