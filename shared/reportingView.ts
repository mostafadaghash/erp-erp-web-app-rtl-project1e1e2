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

export type ReportingSalesDetails = {
  scope: {
    from: string;
    to: string;
    branchId?: string;
    branchCount: number;
    consolidated: boolean;
    dateBasis: "operation_date";
  };
  invoices: Array<{
    _id: string;
    invoiceNumber: string;
    date: string;
    branchId: string;
    branchName: string;
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    itemCount: number;
    totalQuantity: number;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    creditedTotal: number;
    netTotal: number;
    paid: number;
    remaining: number;
    paymentMethod: string;
    status: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      total: number;
      costTotal?: number;
      grossProfit?: number;
    }>;
  }>;
};

export type ReportingSalesInvoice = ReportingSalesDetails["invoices"][number];
