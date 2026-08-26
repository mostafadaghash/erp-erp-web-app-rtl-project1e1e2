export const LAN_MIGRATION_MANIFEST_VERSION = 1;

export const LAN_DOMAINS = Object.freeze([
  {
    id: "foundation",
    order: 1,
    tables: [
      "settings",
      "branches",
      "userProfiles",
      "documentCounters",
      "auditLogs",
    ],
  },
  {
    id: "catalog",
    order: 2,
    tables: ["categories", "products", "inventoryMovements"],
  },
  {
    id: "contacts",
    order: 3,
    tables: [
      "customers",
      "customerBalances",
      "customerLedgerEntries",
      "suppliers",
      "supplierBalances",
      "supplierLedgerEntries",
    ],
  },
  {
    id: "sales",
    order: 4,
    tables: [
      "invoices",
      "salesReturns",
      "orders",
      "orderStatsState",
      "orderStatsAggregates",
      "payments",
    ],
  },
  {
    id: "purchasing",
    order: 5,
    tables: [
      "shipments",
      "purchaseReceipts",
      "purchaseReturns",
      "supplierPayments",
      "supplierPaymentAllocations",
    ],
  },
  {
    id: "finance",
    order: 6,
    tables: [
      "financeSettings",
      "financialAccounts",
      "financialTransactions",
      "financialMovements",
      "expenses",
    ],
  },
  {
    id: "general-ledger",
    order: 7,
    tables: [
      "generalLedgerSettings",
      "chartOfAccounts",
      "accountingPeriods",
      "generalLedgerOpenings",
      "journalEntries",
      "journalLines",
      "generalLedgerDailyBalances",
      "generalLedgerAccountBalances",
      "generalLedgerPeriodBalances",
    ],
  },
  {
    id: "operations",
    order: 8,
    tables: [
      "repairs",
      "repairStatusHistory",
      "deliveries",
      "codSettlements",
      "codSettlementItems",
      "deliveryConfirmations",
    ],
  },
  {
    id: "crm",
    order: 9,
    tables: ["leads", "leadActivities"],
  },
]);

export const LAN_TABLES = Object.freeze(
  LAN_DOMAINS.flatMap((domain) =>
    domain.tables.map((sourceTable) => ({
      sourceTable,
      targetTable: sourceTable.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      ),
      domain: domain.id,
      order: domain.order,
      status: "planned",
    })),
  ),
);

export const LAN_CONVEX_BASELINE = Object.freeze({
  directReactFiles: 32,
  generatedApiFiles: 30,
  schemaTables: 47,
});
