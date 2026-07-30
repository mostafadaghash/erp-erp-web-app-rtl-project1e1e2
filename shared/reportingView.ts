export type ReportingOverview = {
  scope: {
    from: string;
    to: string;
    branchId?: string;
    branchCount: number;
    consolidated: boolean;
    dateBasis: "operation_date";
  };
  sales: {
    invoiceCount: number;
    salesReturnCount: number;
    grossSales: number;
    salesReturns: number;
    netSales: number;
  };
  collections: {
    collections: number;
    refunds: number;
    reversedCollections: number;
    reversedRefunds: number;
    netCollections: number;
  };
  expenses: {
    operatingExpenses: number;
    carrierFees: number;
    totalExpenses: number;
  };
  purchases: {
    receiptCount: number;
    returnCount: number;
    landedPurchases: number;
    supplierLiabilityCreated: number;
    supplierCredits: number;
    netSupplierLiabilityCreated: number;
    returnedInventoryValue: number;
    supplierPayments: number;
  };
  cod: {
    collected: number;
    settled: number;
    netPeriodMovement: number;
    currentOutstanding: number;
    carrierFees: number;
  };
  currentBalances: {
    customerReceivables: number;
    customerAdvances: number;
    supplierPayables: number;
    liquidAccounts: number;
    otherClearingAccounts: number;
    inventoryValue?: number;
  };
  profitability: {
    complete: boolean;
    incompleteCogsInvoices: number;
    cogs: number | null;
    grossProfit: number | null;
    grossMargin: number | null;
    netProfit: number | null;
    netMargin: number | null;
  } | null;
  topProducts: Array<{
    productName: string;
    quantity: number;
    netSales: number;
    cogs?: number | null;
    grossProfit?: number | null;
  }>;
  trend: Array<{
    month: string;
    grossSales: number;
    salesReturns: number;
    netSales: number;
    operatingExpenses: number;
    carrierFees: number;
    landedPurchases: number;
    codCollected: number;
    codSettled: number;
    cogs?: number | null;
    grossProfit?: number | null;
    netProfit?: number | null;
    complete?: boolean;
  }>;
  completeness: {
    operationDatesOnly: boolean;
    incompleteCogsInvoices: number;
    legacyInventoryValueProducts: number;
    profitabilityAvailable: boolean;
  };
};
