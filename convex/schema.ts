import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const applicationTables = {
  // إعدادات النظام
  settings: defineTable({
    storeName: v.string(),
    storeType: v.string(),
    primaryColor: v.string(),
    secondaryColor: v.string(),
    logoUrl: v.optional(v.string()),
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
    name: v.string(),
    address: v.string(),
    phone: v.optional(v.string()),
    managerId: v.optional(v.string()),
    isActive: v.boolean(),
  }),

  // الموردين
  suppliers: defineTable({
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    balance: v.number(),
    notes: v.optional(v.string()),
  }),

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
    sellPrice: v.number(),
    stock: v.number(),
    minStock: v.number(),
    unit: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    isActive: v.boolean(),
    warrantyMonths: v.optional(v.number()),
  }).index("by_sku", ["sku"]).index("by_category", ["categoryId"]),

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
  }).index("by_phone", ["phone"]),

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
    })),
    subtotal: v.number(),
    discount: v.number(),
    tax: v.number(),
    total: v.number(),
    paid: v.number(),
    remaining: v.number(),
    paymentMethod: v.string(),
    status: v.string(),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    userId: v.optional(v.string()),
    type: v.string(),
  }).index("by_invoice_number", ["invoiceNumber"]).index("by_customer", ["customerId"]).index("by_status", ["status"]),

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
  }).index("by_status", ["status"]),

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
    parts: v.array(v.object({
      name: v.string(),
      cost: v.number(),
      quantity: v.number(),
    })),
    laborCost: v.number(),
    totalCost: v.number(),
    deposit: v.number(),
    remaining: v.number(),
    status: v.string(),
    technicianId: v.optional(v.string()),
    technicianName: v.optional(v.string()),
    receivedDate: v.string(),
    expectedDate: v.optional(v.string()),
    deliveredDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    trackingToken: v.optional(v.string()),
  }).index("by_status", ["status"]).index("by_tracking", ["trackingToken"]),

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
  }).index("by_status", ["status"]),

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
  }).index("by_category", ["category"]),

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
    paymentMethod: v.string(),   // cod, prepaid, partial
    codAmount: v.optional(v.number()),   // مبلغ الدفع عند الاستلام
    prepaidAmount: v.optional(v.number()),
    shippingCompany: v.string(),
    trackingNumber: v.optional(v.string()),
    shippingCost: v.number(),
    status: v.string(),          // pending, shipped, delivered, returned, cancelled
    expectedDate: v.optional(v.string()),
    deliveredDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  }).index("by_status", ["status"]).index("by_city", ["city"]),

  // سجل العمليات
  auditLogs: defineTable({
    userId: v.optional(v.string()),
    userName: v.optional(v.string()),
    action: v.string(),          // create, update, delete, view
    module: v.string(),          // invoices, orders, repairs, etc.
    recordId: v.optional(v.string()),
    recordLabel: v.optional(v.string()),
    details: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    timestamp: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_module", ["module"])
    .index("by_action", ["action"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
