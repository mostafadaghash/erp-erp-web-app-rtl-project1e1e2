import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const applicationTables = {
  generalLedgerSettings: defineTable({
    baseCurrency:v.literal("EGP"),chartVersion:v.string(),status:v.literal("foundation_ready"),operationalPostingEnabled:v.boolean(),
    financialPostingEnabled:v.optional(v.boolean()),financialPostingCutoverDate:v.optional(v.string()),financialPostingRequestId:v.optional(v.string()),financialPostingFingerprint:v.optional(v.string()),financialPostingActivatedAt:v.optional(v.number()),financialPostingActivatedBy:v.optional(v.string()),
    cutoverDate:v.string(),initializedAt:v.number(),initializedBy:v.string(),initializationRequestId:v.string(),initializationFingerprint:v.string(),
  }).index("by_request",["initializationRequestId"]),
  chartOfAccounts: defineTable({
    code:v.string(),normalizedCode:v.string(),nameAr:v.string(),nameEn:v.optional(v.string()),parentId:v.optional(v.id("chartOfAccounts")),accountClass:v.union(v.literal("asset"),v.literal("liability"),v.literal("equity"),v.literal("revenue"),v.literal("expense")),normalSide:v.union(v.literal("debit"),v.literal("credit")),isContra:v.boolean(),isPosting:v.boolean(),isSystem:v.boolean(),systemKey:v.optional(v.string()),isActive:v.boolean(),createdAt:v.number(),createdBy:v.string(),deactivatedAt:v.optional(v.number()),deactivatedBy:v.optional(v.string()),
  }).index("by_code",["normalizedCode"]).index("by_parent",["parentId"]).index("by_class",["accountClass"]).index("by_system_key",["systemKey"]).index("by_active",["isActive"]),
  accountingPeriods: defineTable({periodKey:v.string(),startDate:v.string(),endDate:v.string(),status:v.union(v.literal("open"),v.literal("closed")),closedAt:v.optional(v.number()),closedBy:v.optional(v.string()),closeReason:v.optional(v.string()),reopenedAt:v.optional(v.number()),reopenedBy:v.optional(v.string()),reopenReason:v.optional(v.string())}).index("by_key",["periodKey"]).index("by_status",["status"]).index("by_start",["startDate"]),
  generalLedgerOpenings: defineTable({branchId:v.id("branches"),openingDate:v.string(),status:v.literal("confirmed"),isZeroOpening:v.boolean(),openingEntryId:v.optional(v.id("journalEntries")),requestId:v.string(),fingerprint:v.string(),confirmedAt:v.number(),confirmedBy:v.string()}).index("by_branch",["branchId"]).index("by_request",["requestId"]),
  journalEntries: defineTable({entryNumber:v.string(),branchId:v.id("branches"),entryDate:v.string(),periodKey:v.string(),sourceType:v.union(v.literal("opening"),v.literal("manual"),v.literal("reversal"),v.literal("financial"),v.literal("financial_reversal"),v.literal("operational"),v.literal("operational_reversal")),status:v.union(v.literal("posted"),v.literal("reversed")),memo:v.string(),totalDebit:v.number(),totalCredit:v.number(),lineCount:v.number(),requestId:v.string(),idempotencyKey:v.string(),requestFingerprint:v.string(),originalEntryId:v.optional(v.id("journalEntries")),reversalEntryId:v.optional(v.id("journalEntries")),reversalReason:v.optional(v.string()),reversalDate:v.optional(v.string()),operationType:v.optional(v.string()),referenceType:v.optional(v.string()),referenceId:v.optional(v.string()),referenceNumber:v.optional(v.string()),financialTransactionId:v.optional(v.id("financialTransactions")),postedAt:v.number(),postedBy:v.string(),reversedAt:v.optional(v.number()),reversedBy:v.optional(v.string())}).index("by_number",["entryNumber"]).index("by_idempotency",["idempotencyKey"]).index("by_branch_date",["branchId","entryDate"]).index("by_branch_period",["branchId","periodKey"]).index("by_status",["status"]).index("by_original",["originalEntryId"]).index("by_financial_transaction",["financialTransactionId"]).index("by_reference",["referenceType","referenceId"]),
  journalLines: defineTable({entryId:v.id("journalEntries"),entryNumber:v.string(),lineNumber:v.number(),branchId:v.id("branches"),entryDate:v.string(),periodKey:v.string(),accountId:v.id("chartOfAccounts"),accountCodeSnapshot:v.string(),accountNameSnapshot:v.string(),normalSideSnapshot:v.union(v.literal("debit"),v.literal("credit")),debit:v.number(),credit:v.number(),description:v.optional(v.string())}).index("by_entry",["entryId"]).index("by_account_branch_date",["accountId","branchId","entryDate"]).index("by_account_branch_date_number_line",["accountId","branchId","entryDate","entryNumber","lineNumber"]).index("by_branch_date",["branchId","entryDate"]).index("by_account_period",["accountId","periodKey"]),
  generalLedgerDailyBalances: defineTable({key:v.string(),branchId:v.id("branches"),accountId:v.id("chartOfAccounts"),entryDate:v.string(),debitTotal:v.number(),creditTotal:v.number(),updatedAt:v.number(),lastEntryId:v.id("journalEntries")}).index("by_key",["key"]).index("by_account_branch_date",["accountId","branchId","entryDate"]),
  generalLedgerAccountBalances: defineTable({key:v.string(),branchId:v.id("branches"),accountId:v.id("chartOfAccounts"),debitTotal:v.number(),creditTotal:v.number(),netDebitBalance:v.number(),updatedAt:v.number(),lastEntryId:v.id("journalEntries")}).index("by_key",["key"]).index("by_branch",["branchId"]),
  generalLedgerPeriodBalances: defineTable({key:v.string(),branchId:v.id("branches"),accountId:v.id("chartOfAccounts"),periodKey:v.string(),debitTotal:v.number(),creditTotal:v.number(),netDebitMovement:v.number(),updatedAt:v.number(),lastEntryId:v.id("journalEntries")}).index("by_key",["key"]).index("by_branch_period",["branchId","periodKey"]).index("by_account_branch_period",["accountId","branchId","periodKey"]).index("by_period",["periodKey"]),
  documentCounters: defineTable({
    key: v.string(), documentType: v.string(), year: v.number(), nextValue: v.number(), updatedAt: v.number(),
  }).index("by_key", ["key"]),

  financeSettings: defineTable({
    isInitialized: v.boolean(), cutoverDate: v.string(),
    initializedAt: v.optional(v.number()), initializedBy: v.optional(v.string()),
    defaultClearingDelayDays: v.number(), updatedAt: v.number(),
  }),

  financialAccounts: defineTable({
    name: v.string(), code: v.string(), uniqueKey: v.string(),
    type: v.union(v.literal("cash"), v.literal("instapay"), v.literal("vodafone_cash"), v.literal("fawry_clearing"), v.literal("paymob_clearing"), v.literal("card_clearing"), v.literal("cod_clearing"), v.literal("bank"), v.literal("other")),
    branchId: v.id("branches"), isActive: v.boolean(), currentBalance: v.number(),
    allowNegative: v.boolean(), settlementDelayDays: v.number(), createdAt: v.number(),
    createdBy: v.string(), updatedAt: v.number(), openingBalancePostedAt: v.optional(v.number()),
  }).index("by_branch", ["branchId"]).index("by_type", ["type"]).index("by_unique_key", ["uniqueKey"]).index("by_active", ["isActive"]),

  financialTransactions: defineTable({
    transactionNumber: v.string(), idempotencyKey: v.string(), requestFingerprint: v.optional(v.string()),
    type: v.union(v.literal("opening_balance"), v.literal("invoice_payment"), v.literal("order_deposit"), v.literal("repair_payment"), v.literal("expense_payment"), v.literal("supplier_payment"), v.literal("supplier_refund"), v.literal("account_transfer"), v.literal("paymob_settlement"), v.literal("clearing_settlement"), v.literal("delivery_cod_collection"), v.literal("cod_settlement"), v.literal("invoice_refund"), v.literal("sales_return_refund"), v.literal("order_refund"), v.literal("repair_refund"), v.literal("reversal")),
    status: v.union(v.literal("posted"), v.literal("reversed")), date: v.string(), amount: v.number(), feeAmount: v.number(), netAmount: v.number(),
    description: v.string(), referenceType: v.optional(v.string()), referenceId: v.optional(v.string()), referenceNumber: v.optional(v.string()),
    customerId: v.optional(v.id("customers")), supplierId: v.optional(v.id("suppliers")), branchId: v.id("branches"), destinationBranchId: v.optional(v.id("branches")), userId: v.string(), createdAt: v.number(),
    reversedAt: v.optional(v.number()), reversedBy: v.optional(v.string()), reversalReason: v.optional(v.string()),
    reversalTransactionId: v.optional(v.id("financialTransactions")), originalTransactionId: v.optional(v.id("financialTransactions")),
  }).index("by_transaction_number", ["transactionNumber"]).index("by_idempotency_key", ["idempotencyKey"]).index("by_branch_date", ["branchId", "date"]).index("by_branch_type_status", ["branchId", "type", "status"]).index("by_reference", ["referenceType", "referenceId"]).index("by_status", ["status"]).index("by_type", ["type"]),

  financialMovements: defineTable({
    transactionId: v.id("financialTransactions"), accountId: v.id("financialAccounts"), signedAmount: v.number(), balanceBefore: v.number(), balanceAfter: v.number(), branchId: v.id("branches"), date: v.string(), availableAt: v.optional(v.string()), createdAt: v.number(),
  }).index("by_account", ["accountId"]).index("by_transaction", ["transactionId"]).index("by_branch_date", ["branchId", "date"]).index("by_account_date", ["accountId", "date"]),

  // إعدادات النظام
  settings: defineTable({
    storeName: v.string(),
    shortName: v.optional(v.string()),
    tagline: v.optional(v.string()),
    legalName: v.optional(v.string()),
    storeType: v.string(),
    primaryColor: v.string(),
    secondaryColor: v.string(),
    logoUrl: v.optional(v.string()),
    faviconUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    faviconStorageId: v.optional(v.id("_storage")),
    invoiceFooter: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    currency: v.string(),
    taxRate: v.number(),
    whatsappNumber: v.optional(v.string()),
    modules: v.optional(v.object({
      invoices:   v.optional(v.boolean()),
      orders:     v.optional(v.boolean()),
      deliveries: v.optional(v.boolean()),
      repairs:    v.optional(v.boolean()),
      expenses:   v.optional(v.boolean()),
      suppliers:  v.optional(v.boolean()),
      shipments:  v.optional(v.boolean()),
      crm:        v.optional(v.boolean()),
      branches:   v.optional(v.boolean()),
      employees:  v.optional(v.boolean()),
      reports:    v.optional(v.boolean()),
    })),
  }),

  // الفروع
  branches: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    address: v.string(),
    phone: v.optional(v.string()),
    managerId: v.optional(v.string()),
    isActive: v.boolean(),
  }).index("by_code", ["code"]),

  // الموردين
  suppliers: defineTable({
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    balance: v.number(),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  }).index("by_phone", ["phone"]),

  supplierBalances: defineTable({
    key: v.string(), supplierId: v.id("suppliers"), branchId: v.id("branches"), balance: v.number(), updatedAt: v.number(),
  }).index("by_key", ["key"]).index("by_supplier", ["supplierId"]).index("by_branch", ["branchId"]).index("by_supplier_branch", ["supplierId", "branchId"]),

  supplierLedgerEntries: defineTable({
    entryNumber: v.string(), idempotencyKey: v.string(), supplierId: v.id("suppliers"), supplierName: v.string(), branchId: v.id("branches"),
    type: v.union(v.literal("opening_balance"), v.literal("purchase_receipt"), v.literal("purchase_return"), v.literal("supplier_payment"), v.literal("supplier_refund"), v.literal("adjustment"), v.literal("reversal")),
    status: v.union(v.literal("posted"), v.literal("reversed")), date: v.string(), amountDelta: v.number(), balanceBefore: v.number(), balanceAfter: v.number(),
    referenceType: v.string(), referenceId: v.string(), referenceNumber: v.string(), externalInvoiceNumber: v.optional(v.string()), dueDate: v.optional(v.string()), description: v.string(), userId: v.string(), createdAt: v.number(),
    reversedAt: v.optional(v.number()), reversedBy: v.optional(v.string()), reversalReason: v.optional(v.string()), reversalDate: v.optional(v.string()), reversalEntryId: v.optional(v.id("supplierLedgerEntries")), originalEntryId: v.optional(v.id("supplierLedgerEntries")),
  }).index("by_entry_number", ["entryNumber"]).index("by_idempotency_key", ["idempotencyKey"]).index("by_supplier_branch_date", ["supplierId", "branchId", "date"]).index("by_branch_date", ["branchId", "date"]).index("by_reference", ["referenceType", "referenceId"]).index("by_status", ["status"]).index("by_type", ["type"]),

  supplierPayments: defineTable({
    paymentNumber: v.string(), idempotencyKey: v.string(), requestId: v.string(), requestFingerprint: v.string(),
    supplierId: v.id("suppliers"), supplierName: v.string(), branchId: v.id("branches"), accountId: v.id("financialAccounts"), accountName: v.string(),
    date: v.string(), amount: v.number(), notes: v.optional(v.string()), status: v.union(v.literal("posted"), v.literal("reversed")),
    financialTransactionId: v.optional(v.id("financialTransactions")), supplierLedgerEntryId: v.optional(v.id("supplierLedgerEntries")), createdBy: v.string(), createdAt: v.number(),
    reversedAt: v.optional(v.number()), reversedBy: v.optional(v.string()), reversalReason: v.optional(v.string()), reversalDate: v.optional(v.string()), reversalFingerprint: v.optional(v.string()), reversalRequestId: v.optional(v.string()),
    reversalFinancialTransactionId: v.optional(v.id("financialTransactions")), reversalSupplierLedgerEntryId: v.optional(v.id("supplierLedgerEntries")),
  }).index("by_payment_number", ["paymentNumber"]).index("by_idempotency_key", ["idempotencyKey"]).index("by_supplier_branch_date", ["supplierId", "branchId", "date"]).index("by_branch_date", ["branchId", "date"]).index("by_branch_reversal_date", ["branchId", "reversalDate"]).index("by_account_date", ["accountId", "date"]).index("by_status", ["status"]),

  customerBalances: defineTable({
    key: v.string(), customerId: v.id("customers"), branchId: v.id("branches"),
    receivableBalance: v.number(), advanceBalance: v.number(), totalPurchases: v.number(),
    openingBalancePostedAt: v.optional(v.number()), updatedAt: v.number(),
  }).index("by_key", ["key"]).index("by_customer_branch", ["customerId", "branchId"]).index("by_branch", ["branchId"]),

  customerLedgerEntries: defineTable({
    entryNumber: v.string(), idempotencyKey: v.string(), requestId: v.string(), requestFingerprint: v.string(),
    type: v.union(v.literal("opening_balance"), v.literal("invoice_charge"), v.literal("invoice_adjustment"), v.literal("invoice_cancel"), v.literal("invoice_payment"), v.literal("invoice_refund"), v.literal("sales_return"), v.literal("sales_return_reversal"), v.literal("order_deposit"), v.literal("order_deposit_application"), v.literal("delivery_cod_collection"), v.literal("delivery_cod_reversal"), v.literal("order_refund"), v.literal("repair_charge"), v.literal("repair_adjustment"), v.literal("repair_cancel"), v.literal("repair_payment"), v.literal("repair_refund"), v.literal("reversal")),
    status: v.union(v.literal("posted"), v.literal("reversed")), customerId: v.id("customers"), customerName: v.string(), branchId: v.id("branches"), date: v.string(),
    receivableDelta: v.number(), advanceDelta: v.number(), purchasesDelta: v.number(), receivableBefore: v.number(), receivableAfter: v.number(), advanceBefore: v.number(), advanceAfter: v.number(), totalPurchasesBefore: v.number(), totalPurchasesAfter: v.number(),
    description: v.string(), referenceType: v.string(), referenceId: v.string(), referenceNumber: v.string(), createdBy: v.string(), createdAt: v.number(),
    reversedAt: v.optional(v.number()), reversedBy: v.optional(v.string()), reversalReason: v.optional(v.string()), reversalEntryId: v.optional(v.id("customerLedgerEntries")), originalEntryId: v.optional(v.id("customerLedgerEntries")),
  }).index("by_entry_number", ["entryNumber"]).index("by_idempotency_key", ["idempotencyKey"]).index("by_customer_branch_date", ["customerId", "branchId", "date"]).index("by_branch_date", ["branchId", "date"]).index("by_reference", ["referenceType", "referenceId"]).index("by_type", ["type"]).index("by_status", ["status"]),

  supplierPaymentAllocations: defineTable({
    paymentId: v.id("supplierPayments"), purchaseReceiptId: v.id("purchaseReceipts"), receiptNumber: v.string(), supplierId: v.id("suppliers"), branchId: v.id("branches"), amount: v.number(), date: v.string(), createdAt: v.number(),
  }).index("by_payment", ["paymentId"]).index("by_purchase_receipt", ["purchaseReceiptId"]).index("by_supplier_branch_date", ["supplierId", "branchId", "date"]),

  purchaseReceipts: defineTable({
    receiptNumber: v.string(), shipmentId: v.id("shipments"), shipmentNumber: v.string(), supplierId: v.id("suppliers"), supplierName: v.string(), externalInvoiceNumber: v.optional(v.string()), externalInvoiceKey: v.optional(v.string()), invoiceDate: v.optional(v.string()), receiptDate: v.string(), dueDate: v.optional(v.string()),
    items: v.array(v.object({ productId: v.id("products"), productName: v.string(), quantity: v.number(), unitCost: v.number(), lineTotal: v.number(), allocatedFreight: v.number(), landedUnitCost: v.number(), inventoryValueAdded: v.number() })),
    goodsTotal: v.number(), totalFreight: v.number(), supplierFreightAmount: v.number(), externalFreightAmount: v.number(), totalLandedCost: v.number(), payableAmount: v.number(), creditedTotal: v.optional(v.number()), returnedGoodsTotal: v.optional(v.number()), returnedFreightTotal: v.optional(v.number()), netPayableAmount: v.optional(v.number()), paidAmount: v.number(), remainingAmount: v.number(), status: v.union(v.literal("unpaid"), v.literal("partial"), v.literal("paid")), branchId: v.id("branches"), supplierLedgerEntryId: v.optional(v.id("supplierLedgerEntries")), journalEntryId: v.optional(v.id("journalEntries")), arrivalRequestId: v.string(), createdBy: v.string(), createdAt: v.number(),
  }).index("by_receipt_number", ["receiptNumber"]).index("by_shipment", ["shipmentId"]).index("by_supplier_branch_date", ["supplierId", "branchId", "receiptDate"]).index("by_branch_date", ["branchId", "receiptDate"]).index("by_external_invoice_key", ["externalInvoiceKey"]).index("by_arrival_request", ["arrivalRequestId"]),

  purchaseReturns: defineTable({
    returnNumber:v.string(), purchaseReceiptId:v.id("purchaseReceipts"), receiptNumber:v.string(), shipmentId:v.id("shipments"), shipmentNumber:v.string(), supplierId:v.id("suppliers"), supplierName:v.string(), branchId:v.id("branches"), externalInvoiceNumber:v.optional(v.string()), externalCreditNoteNumber:v.optional(v.string()), externalCreditNoteKey:v.optional(v.string()), date:v.string(), reason:v.string(),
    items:v.array(v.object({receiptItemIndex:v.number(),productId:v.id("products"),productName:v.string(),quantityReturned:v.number(),historicalUnitCost:v.number(),historicalLineTotal:v.number(),goodsCreditAmount:v.number(),historicalLandedUnitCost:v.number(),inventoryValueRemoved:v.number()})),
    goodsCredit:v.number(),freightCredit:v.number(),totalCredit:v.number(),inventoryValueRemoved:v.number(),debtReduction:v.number(),cashRefund:v.number(),refundAccountId:v.optional(v.id("financialAccounts")),refundAccountName:v.optional(v.string()),status:v.union(v.literal("posted"),v.literal("reversed")),idempotencyKey:v.string(),requestId:v.string(),requestFingerprint:v.string(),supplierLedgerEntryId:v.optional(v.id("supplierLedgerEntries")),supplierRefundLedgerEntryId:v.optional(v.id("supplierLedgerEntries")),financialTransactionId:v.optional(v.id("financialTransactions")),journalEntryId:v.optional(v.id("journalEntries")),createdBy:v.string(),createdAt:v.number(),
    reversedAt:v.optional(v.number()),reversedBy:v.optional(v.string()),reversalReason:v.optional(v.string()),reversalDate:v.optional(v.string()),reversalRequestId:v.optional(v.string()),reversalFingerprint:v.optional(v.string()),reversalFinancialTransactionId:v.optional(v.id("financialTransactions")),reversalSupplierLedgerEntryId:v.optional(v.id("supplierLedgerEntries")),reversalSupplierRefundLedgerEntryId:v.optional(v.id("supplierLedgerEntries")),reversalJournalEntryId:v.optional(v.id("journalEntries")),
  }).index("by_return_number",["returnNumber"]).index("by_purchase_receipt",["purchaseReceiptId"]).index("by_supplier_branch_date",["supplierId","branchId","date"]).index("by_branch_date",["branchId","date"]).index("by_branch_reversal_date",["branchId","reversalDate"]).index("by_idempotency_key",["idempotencyKey"]).index("by_external_credit_note_key",["externalCreditNoteKey"]).index("by_supplier_branch_external_credit_note",["supplierId","branchId","externalCreditNoteKey"]).index("by_status",["status"]),

  // الفئات
  categories: defineTable({
    name: v.string(),
    icon: v.optional(v.string()),
    parentId: v.optional(v.id("categories")),
  }),

  // المنتجات
  products: defineTable({
    name: v.string(),
    sku: v.string(),
    barcode: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    supplierId: v.optional(v.id("suppliers")),
    costPrice: v.number(),
    inventoryValue: v.optional(v.number()),
    sellPrice: v.number(),
    stock: v.number(),
    minStock: v.number(),
    unit: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    isActive: v.boolean(),
    warrantyMonths: v.optional(v.number()),
  }).index("by_sku", ["sku"]).index("by_category", ["categoryId"]).index("by_branch", ["branchId"]),

  inventoryMovements: defineTable({
    productId: v.id("products"),
    productName: v.string(),
    type: v.string(),
    quantityDelta: v.number(),
    stockBefore: v.number(),
    stockAfter: v.number(),
    reason: v.string(),
    referenceId: v.optional(v.string()),
    referenceType: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    userId: v.string(),
    createdAt: v.number(),
    unitCost: v.optional(v.number()), valueDelta: v.optional(v.number()),
    inventoryValueBefore: v.optional(v.number()), inventoryValueAfter: v.optional(v.number()),
    averageCostBefore: v.optional(v.number()), averageCostAfter: v.optional(v.number()),
  })
    .index("by_product", ["productId"])
    .index("by_branch", ["branchId"])
    .index("by_type", ["type"]),

  // العملاء
  customers: defineTable({
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    balance: v.number(),
    totalPurchases: v.number(),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    isActive: v.optional(v.boolean()),
  })
    .index("by_phone", ["phone"])
    .index("by_branch", ["branchId"])
    .index("by_branch_phone", ["branchId", "phone"]),

  // الفواتير / المبيعات
  invoices: defineTable({
    invoiceNumber: v.string(),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      discount: v.number(),
      total: v.number(),
      unitCost: v.optional(v.number()), costTotal: v.optional(v.number()), lineNetTotal: v.optional(v.number()),
    })),
    subtotal: v.number(),
    discount: v.number(),
    tax: v.number(),
    total: v.number(),
    cogsTotal: v.optional(v.number()), creditedTotal: v.optional(v.number()), netTotal: v.optional(v.number()), costingVersion: v.optional(v.number()),
    paid: v.number(),
    remaining: v.number(),
    paymentMethod: v.string(),
    status: v.string(),
    notes: v.optional(v.string()),
    date: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    userId: v.optional(v.string()),
    creationRequestId: v.optional(v.string()),
    type: v.string(),
    journalEntryId: v.optional(v.id("journalEntries")), lastAdjustmentJournalEntryId: v.optional(v.id("journalEntries")), cancellationJournalEntryId: v.optional(v.id("journalEntries")),
    cancelledAt: v.optional(v.number()), cancelledBy: v.optional(v.string()), cancellationReason: v.optional(v.string()),
  }).index("by_invoice_number", ["invoiceNumber"]).index("by_customer", ["customerId"]).index("by_branch_status", ["branchId", "status"]).index("by_branch_date", ["branchId", "date"]).index("by_status", ["status"]).index("by_creation_request", ["creationRequestId"]),

  salesReturns: defineTable({
    creditNoteNumber: v.string(), invoiceId: v.id("invoices"), invoiceNumber: v.string(),
    customerId: v.optional(v.id("customers")), customerName: v.string(),
    items: v.array(v.object({ productId: v.id("products"), productName: v.string(), quantityReturned: v.number(), unitPrice: v.number(), creditAmount: v.number(), historicalUnitCost: v.number(), returnedCostTotal: v.number() })),
    subtotal: v.number(), totalCredit: v.number(), totalCogsReversed: v.number(), debtReduction: v.number(), cashRefund: v.number(),
    reason: v.string(), date: v.string(), branchId: v.id("branches"), status: v.union(v.literal("posted"), v.literal("reversed")),
    creationRequestId: v.string(), createdBy: v.string(), createdAt: v.number(), financialTransactionId: v.optional(v.id("financialTransactions")), journalEntryId: v.optional(v.id("journalEntries")),
    reversedAt: v.optional(v.number()), reversedBy: v.optional(v.string()), reversalReason: v.optional(v.string()), reversalDate: v.optional(v.string()),
    reversalRequestId: v.optional(v.string()), reversalTransactionId: v.optional(v.id("financialTransactions")), reversalJournalEntryId: v.optional(v.id("journalEntries")),
  }).index("by_credit_note_number", ["creditNoteNumber"]).index("by_invoice", ["invoiceId"]).index("by_customer", ["customerId"]).index("by_branch_date", ["branchId", "date"]).index("by_branch_reversal_date", ["branchId", "reversalDate"]).index("by_creation_request", ["creationRequestId"]),

  // الطلبات / الأوردرات
  orders: defineTable({
    orderNumber: v.string(),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    items: v.array(v.object({
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      notes: v.optional(v.string()),
    })),
    total: v.number(),
    deposit: v.number(),
    remaining: v.number(),
    status: v.string(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    creationRequestId: v.optional(v.string()),
    appliedDeposit: v.optional(v.number()), linkedInvoiceId: v.optional(v.id("invoices")),
    cancelledAt: v.optional(v.number()), cancelledBy: v.optional(v.string()), cancellationReason: v.optional(v.string()),
  }).index("by_status", ["status"]).index("by_branch_status", ["branchId", "status"]).index("by_customer", ["customerId"]).index("by_order_number", ["orderNumber"]).index("by_creation_request", ["creationRequestId"]),

  orderStatsState: defineTable({
    key: v.literal("orders"),
    status: v.union(v.literal("building"), v.literal("ready")),
    activeGeneration: v.optional(v.number()),
    buildingGeneration: v.optional(v.number()),
    rebuildCursor: v.optional(v.string()),
    processedCount: v.number(),
    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    startedBy: v.string(),
  }).index("by_key", ["key"]),

  orderStatsAggregates: defineTable({
    key: v.string(),
    generation: v.number(),
    scope: v.union(v.literal("global"), v.literal("branch")),
    branchId: v.optional(v.id("branches")),
    pending: v.number(),
    confirmed: v.number(),
    ready: v.number(),
    delivered: v.number(),
    totalValue: v.number(),
    pendingValue: v.number(),
    total: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]).index("by_generation", ["generation"]),

  // الصيانة
  repairs: defineTable({
    repairNumber: v.string(),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.string(),
    deviceType: v.string(),
    deviceBrand: v.string(),
    deviceModel: v.string(),
    problem: v.string(),
    diagnosis: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    accessories: v.optional(v.string()),
    intakeCondition: v.optional(v.string()),
    qualityCheckNotes: v.optional(v.string()),
    parts: v.array(v.object({
      name: v.string(),
      cost: v.number(),
      quantity: v.number(),
      productId: v.optional(v.id("products")),
      unitPrice: v.optional(v.number()),
      lineTotal: v.optional(v.number()),
      historicalUnitCost: v.optional(v.number()),
      inventoryValueRemoved: v.optional(v.number()),
    })),
    laborCost: v.number(),
    partsTotal: v.optional(v.number()),
    partsCogsTotal: v.optional(v.number()),
    costingVersion: v.optional(v.number()),
    totalCost: v.number(),
    deposit: v.number(),
    remaining: v.number(),
    status: v.string(),
    technicianId: v.optional(v.string()),
    assignedTechnicianProfileId: v.optional(v.id("userProfiles")),
    technicianName: v.optional(v.string()),
    receivedDate: v.string(),
    expectedDate: v.optional(v.string()),
    deliveredDate: v.optional(v.string()),
    deliveredBy: v.optional(v.string()),
    warrantyDays: v.optional(v.number()),
    warrantyUntil: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    trackingToken: v.optional(v.string()),
    creationRequestId: v.optional(v.string()),
    creationFingerprint: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    journalEntryId: v.optional(v.id("journalEntries")),
    cancellationJournalEntryId: v.optional(v.id("journalEntries")),
    cancellationRequestId: v.optional(v.string()),
    cancellationFingerprint: v.optional(v.string()),
    cancellationDate: v.optional(v.string()),
    cancelledAt: v.optional(v.number()), cancelledBy: v.optional(v.string()), cancellationReason: v.optional(v.string()),
  }).index("by_repair_number", ["repairNumber"]).index("by_customer", ["customerId"]).index("by_status", ["status"]).index("by_branch_status", ["branchId", "status"]).index("by_branch_received", ["branchId", "receivedDate"]).index("by_tracking", ["trackingToken"]).index("by_creation_request", ["creationRequestId"]),

  repairStatusHistory: defineTable({
    repairId: v.id("repairs"),
    repairNumber: v.string(),
    branchId: v.id("branches"),
    fromStatus: v.optional(v.union(
      v.literal("received"),
      v.literal("in_progress"),
      v.literal("ready"),
      v.literal("delivered"),
      v.literal("cancelled"),
    )),
    toStatus: v.union(
      v.literal("received"),
      v.literal("in_progress"),
      v.literal("ready"),
      v.literal("delivered"),
      v.literal("cancelled"),
    ),
    date: v.string(),
    diagnosisSnapshot: v.optional(v.string()),
    technicianNameSnapshot: v.optional(v.string()),
    qualityCheckNotesSnapshot: v.optional(v.string()),
    reason: v.optional(v.string()),
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
    changedAt: v.number(),
    changedBy: v.string(),
  }).index("by_repair_date", ["repairId", "date"]).index("by_branch_date", ["branchId", "date"]).index("by_idempotency_key", ["idempotencyKey"]),

  // الشحن
  shipments: defineTable({
    shipmentNumber: v.string(),
    supplierId: v.optional(v.id("suppliers")),
    supplierName: v.string(),
    items: v.array(v.object({
      productId: v.optional(v.id("products")),
      productName: v.string(),
      quantity: v.number(),
      unitCost: v.number(),
      total: v.number(),
    })),
    totalCost: v.number(),
    shippingCost: v.number(),
    grandTotal: v.number(),
    status: v.string(),
    expectedDate: v.optional(v.string()),
    arrivedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    purchaseReceiptId: v.optional(v.id("purchaseReceipts")), arrivalRequestId: v.optional(v.string()),
    cancelledAt: v.optional(v.number()), cancelledBy: v.optional(v.string()), cancellationReason: v.optional(v.string()),
  }).index("by_status", ["status"]).index("by_shipment_number", ["shipmentNumber"]).index("by_branch", ["branchId"]),

  // المصروفات
  expenses: defineTable({
    title: v.string(),
    category: v.string(),
    amount: v.number(),
    date: v.string(),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    userId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("voided"))),
    financialTransactionId: v.optional(v.id("financialTransactions")),
    voidedAt: v.optional(v.number()), voidedBy: v.optional(v.string()), voidReason: v.optional(v.string()),
  }).index("by_category", ["category"]).index("by_branch_date", ["branchId", "date"]),

  // المدفوعات / التحصيل
  payments: defineTable({
    type: v.string(),
    referenceId: v.optional(v.string()),
    referenceType: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    supplierName: v.optional(v.string()),
    amount: v.number(),
    method: v.string(),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    userId: v.optional(v.string()),
  }),

  // المستخدمين والصلاحيات
  userProfiles: defineTable({
    userId: v.string(),
    tokenIdentifier: v.optional(v.string()),
    name: v.string(),
    email: v.optional(v.string()),
    role: v.string(),
    branchId: v.optional(v.id("branches")),
    permissions: v.array(v.string()),
    isActive: v.boolean(),
    phone: v.optional(v.string()),
    inviteExpiresAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]).index("by_token", ["tokenIdentifier"]).index("by_email", ["email"]).index("by_role", ["role"]).index("by_branch", ["branchId"]),

  // CRM - العملاء المحتملون
  leads: defineTable({
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    source: v.string(),           // instagram, whatsapp, walk_in, referral, website, other
    status: v.string(),           // new, contacted, interested, negotiating, won, lost
    interest: v.optional(v.string()),  // ما يريد شراءه
    budget: v.optional(v.number()),
    assignedTo: v.optional(v.string()),  // اسم الموظف المسؤول
    branchId: v.optional(v.id("branches")),
    notes: v.optional(v.string()),
    lostReason: v.optional(v.string()),
    convertedToCustomerId: v.optional(v.id("customers")),
    lastContactDate: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
  }).index("by_status", ["status"]).index("by_source", ["source"]),

  // CRM - سجل التواصل مع العملاء المحتملين
  leadActivities: defineTable({
    leadId: v.id("leads"),
    type: v.string(),   // call, whatsapp, visit, email, note
    notes: v.string(),
    outcome: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  }).index("by_lead", ["leadId"]),

  // التوصيلات / الشحن للعملاء
  deliveries: defineTable({
    deliveryNumber: v.string(),
    orderId: v.optional(v.id("orders")),
    orderNumber: v.optional(v.string()),
    invoiceId: v.optional(v.id("invoices")), invoiceNumber: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.string(),
    city: v.string(),
    address: v.string(),
    items: v.array(v.object({
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
    })),
    totalAmount: v.number(),
    grandTotal: v.optional(v.number()),
    paymentMethod: v.string(),   // cod, prepaid, partial
    codAmount: v.optional(v.number()),   // مبلغ الدفع عند الاستلام
    prepaidAmount: v.optional(v.number()),
    shippingCompany: v.string(),
    trackingNumber: v.optional(v.string()),
    shippingCost: v.number(),
    expectedCarrierFee: v.optional(v.number()), accountingVersion: v.optional(v.number()),
    requestId: v.optional(v.string()), idempotencyKey: v.optional(v.string()), requestFingerprint: v.optional(v.string()),
    codClearingAccountId: v.optional(v.id("financialAccounts")), codFinancialTransactionId: v.optional(v.id("financialTransactions")), codCustomerLedgerEntryId: v.optional(v.id("customerLedgerEntries")),
    codSettlementId: v.optional(v.id("codSettlements")), currentConfirmationId: v.optional(v.id("deliveryConfirmations")), confirmationRequestId: v.optional(v.string()), confirmationFingerprint: v.optional(v.string()),
    reversedAt: v.optional(v.number()), reversedBy: v.optional(v.string()), reversalReason: v.optional(v.string()), reversalDate: v.optional(v.string()), reversalRequestId: v.optional(v.string()), reversalFingerprint: v.optional(v.string()), reversalFinancialTransactionId: v.optional(v.id("financialTransactions")), reversalCustomerLedgerEntryId: v.optional(v.id("customerLedgerEntries")),
    status: v.string(),          // pending, shipped, delivered, returned, cancelled
    expectedDate: v.optional(v.string()),
    deliveredDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    createdBy: v.optional(v.string()),
    cancelledAt: v.optional(v.number()), cancelledBy: v.optional(v.string()), cancellationReason: v.optional(v.string()),
  }).index("by_delivery_number", ["deliveryNumber"]).index("by_status", ["status"]).index("by_city", ["city"]).index("by_order_status", ["orderId", "status"]).index("by_invoice_status", ["invoiceId", "status"]).index("by_idempotency_key", ["idempotencyKey"]).index("by_branch_status", ["branchId", "status"]).index("by_cod_account_status", ["codClearingAccountId", "status"]),

  codSettlements: defineTable({
    settlementNumber:v.string(),branchId:v.id("branches"),sourceAccountId:v.id("financialAccounts"),destinationAccountId:v.id("financialAccounts"),grossAmount:v.number(),feeAmount:v.number(),netAmount:v.number(),date:v.string(),status:v.union(v.literal("posted"),v.literal("reversed")),requestId:v.string(),idempotencyKey:v.string(),requestFingerprint:v.string(),financialTransactionId:v.id("financialTransactions"),createdBy:v.string(),createdAt:v.number(),notes:v.optional(v.string()),reversedAt:v.optional(v.number()),reversedBy:v.optional(v.string()),reversalReason:v.optional(v.string()),reversalDate:v.optional(v.string()),reversalRequestId:v.optional(v.string()),reversalFingerprint:v.optional(v.string()),reversalFinancialTransactionId:v.optional(v.id("financialTransactions")),
  }).index("by_number",["settlementNumber"]).index("by_branch_date",["branchId","date"]).index("by_branch_reversal_date",["branchId","reversalDate"]).index("by_source_date",["sourceAccountId","date"]).index("by_status",["status"]).index("by_idempotency_key",["idempotencyKey"]),
  codSettlementItems: defineTable({settlementId:v.id("codSettlements"),confirmationId:v.optional(v.id("deliveryConfirmations")),deliveryId:v.id("deliveries"),deliveryNumber:v.string(),invoiceId:v.id("invoices"),invoiceNumber:v.string(),codAmount:v.number(),branchId:v.id("branches"),date:v.string()}).index("by_settlement",["settlementId"]).index("by_delivery",["deliveryId"]).index("by_confirmation",["confirmationId"]).index("by_branch_date",["branchId","date"]),

  deliveryConfirmations: defineTable({
    deliveryId:v.id("deliveries"),deliveryNumber:v.string(),attemptNumber:v.number(),branchId:v.id("branches"),invoiceId:v.id("invoices"),orderId:v.id("orders"),customerId:v.id("customers"),codAmount:v.number(),codClearingAccountId:v.optional(v.id("financialAccounts")),status:v.union(v.literal("posted"),v.literal("reversed")),date:v.string(),requestId:v.string(),idempotencyKey:v.string(),requestFingerprint:v.string(),financialTransactionId:v.optional(v.id("financialTransactions")),customerLedgerEntryId:v.optional(v.id("customerLedgerEntries")),reversalRequestId:v.optional(v.string()),reversalFingerprint:v.optional(v.string()),reversalFinancialTransactionId:v.optional(v.id("financialTransactions")),reversalCustomerLedgerEntryId:v.optional(v.id("customerLedgerEntries")),reversalReason:v.optional(v.string()),reversalDate:v.optional(v.string()),reversedAt:v.optional(v.number()),reversedBy:v.optional(v.string()),createdBy:v.string(),createdAt:v.number()
  }).index("by_delivery_status",["deliveryId","status"]).index("by_delivery",["deliveryId"]).index("by_idempotency",["idempotencyKey"]).index("by_branch_date",["branchId","date"]).index("by_branch_reversal_date",["branchId","reversalDate"]).index("by_financial_transaction",["financialTransactionId"]),

  // سجل المراجعة
  auditLogs: defineTable({
    userId: v.optional(v.string()),
    userName: v.optional(v.string()),
    action: v.string(),          // create, update, delete, view
    module: v.string(),          // invoices, orders, repairs, etc.
    recordId: v.optional(v.string()),
    recordLabel: v.optional(v.string()),
    details: v.optional(v.string()),
    beforeSnapshot: v.optional(v.array(v.object({ field: v.string(), value: v.string() }))),
    afterSnapshot: v.optional(v.array(v.object({ field: v.string(), value: v.string() }))),
    changedFields: v.optional(v.array(v.string())),
    snapshotVersion: v.optional(v.number()),
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    sourceNumber: v.optional(v.string()),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    relatedNumber: v.optional(v.string()),
    financialTransactionId: v.optional(v.string()),
    journalEntryId: v.optional(v.string()),
    reversalOfId: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    timestamp: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_module", ["module"])
    .index("by_action", ["action"])
    .index("by_branch", ["branchId"])
    .index("by_branch_module_action", ["branchId", "module", "action"])
    .index("by_user_module_action", ["userId", "module", "action"])
    .index("by_module_action", ["module", "action"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
