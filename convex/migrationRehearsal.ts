import { internalMutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { AuthUser } from "./lib/auth.ts";
import { logAction } from "./lib/auth.ts";
import { changeProductStock } from "./lib/inventory.ts";
import { INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules.ts";
import { postFinancialTransaction } from "./lib/finance.ts";
import { initializeCustomerBalance } from "./lib/customerLedger.ts";
import { initializeSupplierBalance } from "./lib/supplierLedger.ts";
import { roundMoney } from "../shared/businessRules.ts";

const REHEARSAL_FLAG = "isolated-migration-rehearsal-only";
const PROTECTED_DEPLOYMENTS = new Set([
  "brave-dachshund-76",
  "academic-puma-235",
  "courteous-dotterel-331",
]);
const GENERATED_COD_PREFIX = "MIGCOD-";

const accountType = v.union(
  v.literal("cash"),
  v.literal("instapay"),
  v.literal("vodafone_cash"),
  v.literal("fawry_clearing"),
  v.literal("paymob_clearing"),
  v.literal("card_clearing"),
  v.literal("cod_clearing"),
  v.literal("bank"),
  v.literal("other"),
);

const branchRow = v.object({
  legacyId: v.string(), code: v.string(), name: v.string(), address: v.string(),
  phone: v.optional(v.string()), isActive: v.boolean(),
});
const customerRow = v.object({
  legacyId: v.string(), branchCode: v.string(), name: v.string(), phone: v.string(),
  email: v.optional(v.string()), address: v.optional(v.string()),
  receivableBalance: v.number(), advanceBalance: v.number(), isActive: v.boolean(),
});
const supplierRow = v.object({
  legacyId: v.string(), name: v.string(), phone: v.string(), email: v.optional(v.string()),
  address: v.optional(v.string()), isActive: v.boolean(),
  balances: v.array(v.object({ branchCode: v.string(), balance: v.number() })),
});
const productRow = v.object({
  legacyId: v.string(), sku: v.string(), barcode: v.optional(v.string()), name: v.string(),
  supplierLegacyId: v.optional(v.string()), category: v.optional(v.string()), stock: v.number(),
  minStock: v.number(), costPrice: v.number(), sellPrice: v.number(), inventoryValue: v.number(),
  unit: v.string(), isActive: v.boolean(),
});
const financialAccountRow = v.object({
  legacyId: v.string(), branchCode: v.string(), code: v.string(), name: v.string(), type: accountType,
  balance: v.number(), allowNegative: v.boolean(), settlementDelayDays: v.number(), isActive: v.boolean(),
});
const codRow = v.object({
  legacyId: v.string(), branchCode: v.string(), carrier: v.string(), referenceNumber: v.optional(v.string()),
  amount: v.number(), status: v.union(v.literal("with_carrier"), v.literal("settled"), v.literal("reversed")),
});
const controlsValidator = v.object({
  stockQuantity: v.optional(v.number()), inventoryValue: v.optional(v.number()),
  customerReceivable: v.optional(v.number()), customerAdvance: v.optional(v.number()),
  supplierPayable: v.optional(v.number()), financialAccountBalance: v.optional(v.number()),
  codWithCarriers: v.optional(v.number()),
});
const countsValidator = v.object({
  branches: v.number(), customers: v.number(), suppliers: v.number(), products: v.number(),
  financialAccounts: v.number(), codWithCarriers: v.number(),
});

function assertRehearsalEnvironment(targetDeployment: string) {
  const configuredDeployment = process.env.MIGRATION_REHEARSAL_DEPLOYMENT?.trim();
  if (process.env.MIGRATION_REHEARSAL_ENABLED !== REHEARSAL_FLAG) {
    throw new ConvexError("Migration rehearsal is disabled on this deployment");
  }
  if (!configuredDeployment || configuredDeployment !== targetDeployment) {
    throw new ConvexError("Migration rehearsal deployment binding mismatch");
  }
  if (PROTECTED_DEPLOYMENTS.has(configuredDeployment)) {
    throw new ConvexError("Migration rehearsal is forbidden on a permanent deployment");
  }
}

function expectedConfirmation(targetDeployment: string, migrationRunId: string, fingerprint: string) {
  return `APPLY:${targetDeployment}:${migrationRunId}:${fingerprint.slice(0, 12)}`;
}

function assertMoney(value: number, label: string, allowNegative = false) {
  if (!Number.isFinite(value) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7 || (!allowNegative && value < 0)) {
    throw new ConvexError(`${label} is not valid money`);
  }
}

function migrationUserId(migrationRunId: string) {
  return `migration-rehearsal:${migrationRunId}`;
}

async function existingRun(ctx: Parameters<typeof apply.handler>[0] extends never ? never : any, migrationRunId: string) {
  const logs = await ctx.db.query("auditLogs")
    .withIndex("by_module_action", (q: any) => q.eq("module", "migration_rehearsal").eq("action", "complete"))
    .collect();
  return logs.find((log: any) => log.recordId === migrationRunId) ?? null;
}

async function assertCleanTarget(ctx: any) {
  const checks = await Promise.all([
    ctx.db.query("branches").first(),
    ctx.db.query("customers").first(),
    ctx.db.query("suppliers").first(),
    ctx.db.query("products").first(),
    ctx.db.query("categories").first(),
    ctx.db.query("financialAccounts").first(),
    ctx.db.query("financeSettings").first(),
    ctx.db.query("customerLedgerEntries").first(),
    ctx.db.query("supplierLedgerEntries").first(),
    ctx.db.query("financialTransactions").first(),
    ctx.db.query("inventoryMovements").first(),
    ctx.db.query("userProfiles").first(),
    ctx.db.query("auditLogs").first(),
  ]);
  if (checks.some(Boolean)) throw new ConvexError("Migration rehearsal target is not empty");
}

export const apply = internalMutation({
  args: {
    targetDeployment: v.string(), confirmation: v.string(), migrationRunId: v.string(), fingerprint: v.string(),
    cutoverDate: v.string(), sourceSystem: v.string(),
    accepted: v.object({
      branches: v.array(branchRow), customers: v.array(customerRow), suppliers: v.array(supplierRow),
      products: v.array(productRow), financialAccounts: v.array(financialAccountRow), cod: v.array(codRow),
    }),
  },
  handler: async (ctx, args) => {
    assertRehearsalEnvironment(args.targetDeployment);
    if (!/^MIG-[A-F0-9]{16}$/.test(args.migrationRunId)) throw new ConvexError("Invalid migrationRunId");
    if (!/^[a-f0-9]{64}$/.test(args.fingerprint)) throw new ConvexError("Invalid migration fingerprint");
    if (args.migrationRunId !== `MIG-${args.fingerprint.slice(0, 16).toUpperCase()}`) throw new ConvexError("Migration run and fingerprint do not match");
    if (args.confirmation !== expectedConfirmation(args.targetDeployment, args.migrationRunId, args.fingerprint)) throw new ConvexError("Migration rehearsal confirmation mismatch");

    const prior = await existingRun(ctx, args.migrationRunId);
    if (prior) {
      if (prior.sourceId !== args.fingerprint) throw new ConvexError("Migration run already exists with a different fingerprint");
      return { duplicate: true, migrationRunId: args.migrationRunId, fingerprint: args.fingerprint };
    }
    await assertCleanTarget(ctx);

    if (args.accepted.branches.length === 0) throw new ConvexError("At least one branch is required");
    if (args.accepted.branches.length > 1 && args.accepted.products.length > 0) {
      throw new ConvexError("Current migration schema lacks product branchCode; multi-branch product rehearsal is blocked until the package contract is upgraded");
    }

    const now = Date.now();
    const operatorId = migrationUserId(args.migrationRunId);
    const employeeId = await ctx.db.insert("userProfiles", {
      userId: operatorId,
      name: "Migration Rehearsal",
      role: "admin",
      permissions: [],
      isActive: true,
    });
    const user: AuthUser = {
      userId: operatorId,
      employeeId,
      name: "Migration Rehearsal",
      role: "admin",
      isActive: true,
      permissions: [],
    };

    const branchByCode = new Map<string, Id<"branches">>();
    for (const row of args.accepted.branches) {
      if (branchByCode.has(row.code)) throw new ConvexError(`Duplicate branch code: ${row.code}`);
      const id = await ctx.db.insert("branches", {
        name: row.name, address: row.address, phone: row.phone, isActive: row.isActive,
      });
      branchByCode.set(row.code, id);
    }

    const supplierByLegacy = new Map<string, Id<"suppliers">>();
    const supplierPhones = new Set<string>();
    for (const row of args.accepted.suppliers) {
      if (supplierByLegacy.has(row.legacyId) || supplierPhones.has(row.phone)) throw new ConvexError("Duplicate supplier migration key or phone");
      const id = await ctx.db.insert("suppliers", {
        name: row.name, phone: row.phone, email: row.email, address: row.address,
        balance: 0, isActive: row.isActive,
      });
      supplierByLegacy.set(row.legacyId, id);
      supplierPhones.add(row.phone);
    }

    const customerPhones = new Set<string>();
    const customerRows: Array<{ id: Id<"customers">; branchId: Id<"branches">; row: typeof args.accepted.customers[number] }> = [];
    for (const row of args.accepted.customers) {
      const branchId = branchByCode.get(row.branchCode);
      if (!branchId) throw new ConvexError(`Unknown customer branchCode: ${row.branchCode}`);
      const phoneKey = `${row.branchCode}|${row.phone}`;
      if (customerPhones.has(phoneKey)) throw new ConvexError(`Duplicate customer phone in branch: ${phoneKey}`);
      assertMoney(row.receivableBalance, "customer receivable");
      assertMoney(row.advanceBalance, "customer advance");
      if (row.receivableBalance > 0 && row.advanceBalance > 0) throw new ConvexError("Customer cannot have receivable and advance openings together");
      const id = await ctx.db.insert("customers", {
        name: row.name, phone: row.phone, email: row.email, address: row.address,
        balance: 0, totalPurchases: 0, branchId, isActive: row.isActive,
      });
      customerRows.push({ id, branchId, row });
      customerPhones.add(phoneKey);
    }

    const categoryByName = new Map<string, Id<"categories">>();
    const productSkus = new Set<string>();
    const defaultProductBranchId = branchByCode.values().next().value as Id<"branches"> | undefined;
    if (args.accepted.products.length > 0 && !defaultProductBranchId) throw new ConvexError("Product branch is unavailable");
    for (const row of args.accepted.products) {
      if (productSkus.has(row.sku)) throw new ConvexError(`Duplicate product SKU: ${row.sku}`);
      if (!Number.isInteger(row.stock) || row.stock < 0 || !Number.isInteger(row.minStock) || row.minStock < 0) throw new ConvexError("Invalid product stock values");
      assertMoney(row.inventoryValue, "product inventory value");
      if (!Number.isFinite(row.costPrice) || row.costPrice < 0 || !Number.isFinite(row.sellPrice) || row.sellPrice < 0) throw new ConvexError("Invalid product prices");
      if (row.stock === 0 && row.inventoryValue !== 0) throw new ConvexError("Zero-stock product cannot have opening inventory value");
      let categoryId: Id<"categories"> | undefined;
      if (row.category) {
        categoryId = categoryByName.get(row.category);
        if (!categoryId) {
          categoryId = await ctx.db.insert("categories", { name: row.category });
          categoryByName.set(row.category, categoryId);
        }
      }
      const supplierId = row.supplierLegacyId ? supplierByLegacy.get(row.supplierLegacyId) : undefined;
      if (row.supplierLegacyId && !supplierId) throw new ConvexError(`Unknown product supplierLegacyId: ${row.supplierLegacyId}`);
      const id = await ctx.db.insert("products", {
        name: row.name, sku: row.sku, barcode: row.barcode, categoryId, supplierId,
        costPrice: row.costPrice, inventoryValue: 0, sellPrice: row.sellPrice, stock: 0, minStock: row.minStock,
        unit: row.unit, branchId: defaultProductBranchId, isActive: row.isActive,
      });
      if (row.stock > 0) {
        await changeProductStock(ctx, user, {
          productId: id,
          quantityDelta: row.stock,
          unitCost: row.costPrice,
          valueDelta: row.inventoryValue,
          type: INVENTORY_MOVEMENT_TYPES.openingBalance,
          reason: `Migration opening ${args.migrationRunId}`,
          referenceType: "migration_rehearsal",
          referenceId: row.legacyId,
        });
      }
      productSkus.add(row.sku);
    }

    const financeSettingsId = await ctx.db.insert("financeSettings", {
      isInitialized: false,
      cutoverDate: args.cutoverDate,
      defaultClearingDelayDays: 0,
      updatedAt: now,
    });

    const importedAccountIds: Id<"financialAccounts">[] = [];
    const importedAccountKeys = new Set<string>();
    for (const row of args.accepted.financialAccounts) {
      const branchId = branchByCode.get(row.branchCode);
      if (!branchId) throw new ConvexError(`Unknown financial account branchCode: ${row.branchCode}`);
      if (row.code.startsWith(GENERATED_COD_PREFIX)) throw new ConvexError(`Reserved financial account code prefix: ${GENERATED_COD_PREFIX}`);
      assertMoney(row.balance, "financial opening balance");
      const key = `${row.branchCode}|${row.code}`;
      if (importedAccountKeys.has(key)) throw new ConvexError(`Duplicate financial account code in branch: ${key}`);
      const id = await ctx.db.insert("financialAccounts", {
        name: row.name,
        code: row.code,
        uniqueKey: `${branchId}:${row.code}`,
        type: row.type,
        branchId,
        isActive: row.isActive,
        currentBalance: 0,
        allowNegative: row.allowNegative,
        settlementDelayDays: row.settlementDelayDays,
        createdAt: now,
        createdBy: operatorId,
        updatedAt: now,
      });
      importedAccountIds.push(id);
      importedAccountKeys.add(key);
    }

    for (const [code, branchId] of branchByCode.entries()) {
      const branch = await ctx.db.get(branchId);
      if (!branch?.isActive) continue;
      const hasCash = args.accepted.financialAccounts.some((row) => row.branchCode === code && row.type === "cash" && row.isActive);
      if (!hasCash) throw new ConvexError(`Active branch requires an active cash account: ${branch.name}`);
    }

    const codAccountByCarrier = new Map<string, Id<"financialAccounts">>();
    let codAccountSequence = 0;
    for (const row of args.accepted.cod.filter((item) => item.status === "with_carrier" && item.amount > 0)) {
      assertMoney(row.amount, "COD opening amount");
      const branchId = branchByCode.get(row.branchCode);
      const branch = branchId ? await ctx.db.get(branchId) : null;
      if (!branchId || !branch?.isActive) throw new ConvexError(`COD opening requires an active branch: ${row.branchCode}`);
      const carrierKey = `${row.branchCode}|${row.carrier}`;
      if (codAccountByCarrier.has(carrierKey)) continue;
      codAccountSequence += 1;
      const code = `${GENERATED_COD_PREFIX}${String(codAccountSequence).padStart(3, "0")}`;
      const accountId = await ctx.db.insert("financialAccounts", {
        name: `COD قديم - ${row.carrier}`,
        code,
        uniqueKey: `${branchId}:${code}`,
        type: "cod_clearing",
        branchId,
        isActive: true,
        currentBalance: 0,
        allowNegative: false,
        settlementDelayDays: 0,
        createdAt: now,
        createdBy: operatorId,
        updatedAt: now,
        openingBalancePostedAt: now,
      });
      codAccountByCarrier.set(carrierKey, accountId);
    }

    for (let index = 0; index < args.accepted.financialAccounts.length; index += 1) {
      const row = args.accepted.financialAccounts[index];
      const accountId = importedAccountIds[index];
      if (!row.isActive && row.balance !== 0) throw new ConvexError(`Inactive financial account cannot carry an opening balance: ${row.code}`);
      if (row.balance > 0) {
        const account = await ctx.db.get(accountId);
        if (!account) throw new ConvexError("Financial account disappeared during migration");
        await postFinancialTransaction(ctx, user, {
          type: "opening_balance",
          requestId: `${args.migrationRunId}:finance:${row.legacyId}`,
          date: args.cutoverDate,
          amount: row.balance,
          description: `Migration opening: ${row.name}`,
          branchId: account.branchId,
          referenceType: "migration_account_opening",
          referenceId: row.legacyId,
          referenceNumber: row.code,
          movements: [{ accountId, signedAmount: row.balance }],
          allowBeforeInitialization: true,
        });
      }
      await ctx.db.patch(accountId, { openingBalancePostedAt: now, updatedAt: Date.now() });
    }

    await ctx.db.patch(financeSettingsId, {
      isInitialized: true,
      initializedAt: Date.now(),
      initializedBy: operatorId,
      updatedAt: Date.now(),
    });

    for (const item of customerRows) {
      await initializeCustomerBalance(ctx, user, {
        customerId: item.id,
        branchId: item.branchId,
        receivableBalance: item.row.receivableBalance,
        advanceBalance: item.row.advanceBalance,
        totalPurchases: 0,
        date: args.cutoverDate,
        requestId: `${args.migrationRunId}:customer:${item.row.legacyId}`,
        notes: `Migration opening ${args.migrationRunId}`,
      });
    }

    for (const supplier of args.accepted.suppliers) {
      const supplierId = supplierByLegacy.get(supplier.legacyId);
      if (!supplierId) throw new ConvexError(`Supplier mapping missing: ${supplier.legacyId}`);
      for (const balance of supplier.balances) {
        assertMoney(balance.balance, "supplier opening balance");
        const branchId = branchByCode.get(balance.branchCode);
        if (!branchId) throw new ConvexError(`Unknown supplier balance branchCode: ${balance.branchCode}`);
        await initializeSupplierBalance(ctx, user, {
          requestId: `${args.migrationRunId}:supplier:${supplier.legacyId}:${balance.branchCode}`,
          supplierId,
          branchId,
          date: args.cutoverDate,
          balance: balance.balance,
          notes: `Migration opening ${args.migrationRunId}`,
        });
      }
    }

    for (const row of args.accepted.cod) {
      if (row.status !== "with_carrier" || row.amount === 0) continue;
      const branchId = branchByCode.get(row.branchCode);
      const accountId = codAccountByCarrier.get(`${row.branchCode}|${row.carrier}`);
      if (!branchId || !accountId) throw new ConvexError(`COD migration mapping missing: ${row.legacyId}`);
      await postFinancialTransaction(ctx, user, {
        type: "delivery_cod_collection",
        requestId: `${args.migrationRunId}:cod:${row.legacyId}`,
        date: args.cutoverDate,
        amount: row.amount,
        description: `Legacy COD with carrier: ${row.carrier}`,
        branchId,
        referenceType: "migration_cod_opening",
        referenceId: row.legacyId,
        referenceNumber: row.referenceNumber ?? row.legacyId,
        movements: [{ accountId, signedAmount: row.amount }],
      });
    }

    await logAction(ctx, user, {
      action: "complete",
      module: "migration_rehearsal",
      recordId: args.migrationRunId,
      recordLabel: args.sourceSystem,
      details: `Migration rehearsal completed on ${args.targetDeployment}`,
      branchId: null,
      sourceType: "migration_fingerprint",
      sourceId: args.fingerprint,
      after: {
        branches: args.accepted.branches.length,
        customers: args.accepted.customers.length,
        suppliers: args.accepted.suppliers.length,
        products: args.accepted.products.length,
        financialAccounts: args.accepted.financialAccounts.length,
        codRows: args.accepted.cod.length,
      },
    });

    return {
      duplicate: false,
      migrationRunId: args.migrationRunId,
      fingerprint: args.fingerprint,
      targetDeployment: args.targetDeployment,
      counts: {
        branches: args.accepted.branches.length,
        customers: args.accepted.customers.length,
        suppliers: args.accepted.suppliers.length,
        products: args.accepted.products.length,
        financialAccounts: args.accepted.financialAccounts.length,
        codWithCarriers: args.accepted.cod.filter((row) => row.status === "with_carrier").length,
      },
    };
  },
});

export const reconcile = internalQuery({
  args: {
    targetDeployment: v.string(), migrationRunId: v.string(), fingerprint: v.string(),
    controls: controlsValidator, expectedCounts: countsValidator, expectedSkus: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    assertRehearsalEnvironment(args.targetDeployment);
    const prior = await existingRun(ctx, args.migrationRunId);
    if (!prior || prior.sourceId !== args.fingerprint) throw new ConvexError("Matching completed migration rehearsal was not found");

    const [branches, customers, suppliers, products, customerBalances, supplierBalances, accounts, codTransactions, financeSettings] = await Promise.all([
      ctx.db.query("branches").collect(),
      ctx.db.query("customers").collect(),
      ctx.db.query("suppliers").collect(),
      ctx.db.query("products").collect(),
      ctx.db.query("customerBalances").collect(),
      ctx.db.query("supplierBalances").collect(),
      ctx.db.query("financialAccounts").collect(),
      ctx.db.query("financialTransactions").withIndex("by_type", q => q.eq("type", "delivery_cod_collection")).collect(),
      ctx.db.query("financeSettings").first(),
    ]);

    const importedAccounts = accounts.filter((account) => !account.code.startsWith(GENERATED_COD_PREFIX));
    const migrationCodTransactions = codTransactions.filter((transaction) => transaction.status === "posted" && transaction.referenceType === "migration_cod_opening");
    const actual = {
      stockQuantity: products.reduce((sum, product) => sum + product.stock, 0),
      inventoryValue: roundMoney(products.reduce((sum, product) => sum + (product.inventoryValue ?? 0), 0)),
      customerReceivable: roundMoney(customerBalances.reduce((sum, balance) => sum + balance.receivableBalance, 0)),
      customerAdvance: roundMoney(customerBalances.reduce((sum, balance) => sum + balance.advanceBalance, 0)),
      supplierPayable: roundMoney(supplierBalances.reduce((sum, balance) => sum + balance.balance, 0)),
      financialAccountBalance: roundMoney(importedAccounts.reduce((sum, account) => sum + account.currentBalance, 0)),
      codWithCarriers: roundMoney(migrationCodTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)),
    };
    const actualCounts = {
      branches: branches.length,
      customers: customers.length,
      suppliers: suppliers.length,
      products: products.length,
      financialAccounts: importedAccounts.length,
      codWithCarriers: migrationCodTransactions.length,
    };
    const differences: Array<{ metric: string; expected: number | string; actual: number | string }> = [];
    for (const [metric, expected] of Object.entries(args.controls)) {
      if (expected === undefined) continue;
      const value = actual[metric as keyof typeof actual];
      if (Math.abs(value - expected) >= 0.005) differences.push({ metric, expected, actual: value });
    }
    for (const [metric, expected] of Object.entries(args.expectedCounts)) {
      const value = actualCounts[metric as keyof typeof actualCounts];
      if (value !== expected) differences.push({ metric: `count:${metric}`, expected, actual: value });
    }
    const actualSkus = products.map((product) => product.sku).sort();
    const expectedSkus = [...args.expectedSkus].sort();
    if (JSON.stringify(actualSkus) !== JSON.stringify(expectedSkus)) {
      differences.push({ metric: "skuMapping", expected: expectedSkus.join(","), actual: actualSkus.join(",") });
    }
    if (!financeSettings?.isInitialized) differences.push({ metric: "financeInitialized", expected: "true", actual: "false" });

    return {
      passed: differences.length === 0,
      migrationRunId: args.migrationRunId,
      fingerprint: args.fingerprint,
      targetDeployment: args.targetDeployment,
      actual,
      actualCounts,
      differences,
      financeInitialized: financeSettings?.isInitialized === true,
    };
  },
});
