import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  hasPermission,
  logAction,
  requireModuleEnabled,
  requirePermission,
  type AuthUser,
} from "./lib/auth";
import type { Permission } from "./lib/permissions";

const MAX_EXPORT_ROWS = 5_000;

const datasetValidator = v.union(
  v.literal("products"),
  v.literal("customers"),
  v.literal("invoices"),
  v.literal("orders"),
  v.literal("repairs"),
  v.literal("shipments"),
  v.literal("suppliers"),
  v.literal("expenses"),
  v.literal("deliveries"),
);

type ExportDataset =
  | "products"
  | "customers"
  | "invoices"
  | "orders"
  | "repairs"
  | "shipments"
  | "suppliers"
  | "expenses"
  | "deliveries";

type ExportCell = string | number | boolean | null;
type ExportColumn = { key: string; label: string };

const DATASET_PERMISSIONS: Record<ExportDataset, Permission> = {
  products: "view_products",
  customers: "view_customers",
  invoices: "view_invoices",
  orders: "view_orders",
  repairs: "view_repairs",
  shipments: "view_shipments",
  suppliers: "view_suppliers",
  expenses: "view_expenses",
  deliveries: "view_deliveries",
};

const DATASET_MODULES: Partial<Record<ExportDataset, string>> = {
  invoices: "invoices",
  orders: "orders",
  repairs: "repairs",
  shipments: "shipments",
  suppliers: "suppliers",
  expenses: "expenses",
  deliveries: "deliveries",
};

const DATASET_LABELS: Record<ExportDataset, string> = {
  products: "المنتجات والمخزون",
  customers: "العملاء",
  invoices: "الفواتير",
  orders: "الأوردرات",
  repairs: "الصيانة",
  shipments: "الشحنات الواردة",
  suppliers: "الموردون",
  expenses: "المصروفات",
  deliveries: "التوصيلات",
};

function assignedBranch(user: AuthUser): Id<"branches"> {
  if (!user.branchId) {
    throw new ConvexError("يجب ربط الحساب بفرع قبل تصدير بيانات التشغيل");
  }
  return user.branchId;
}

function payload(
  user: AuthUser,
  dataset: ExportDataset,
  columns: ExportColumn[],
  rows: ExportCell[][],
  globalDataset = false,
) {
  const truncated = rows.length > MAX_EXPORT_ROWS;
  return {
    dataset,
    label: DATASET_LABELS[dataset],
    columns,
    rows: rows.slice(0, MAX_EXPORT_ROWS),
    truncated,
    rowLimit: MAX_EXPORT_ROWS,
    exportedAt: Date.now(),
    scope: globalDataset
      ? "global"
      : user.role === "admin"
        ? "all_branches"
        : "assigned_branch",
  };
}

async function productExport(ctx: MutationCtx, user: AuthUser) {
  const documents =
    user.role === "admin"
      ? await ctx.db.query("products").order("asc").take(MAX_EXPORT_ROWS + 1)
      : await ctx.db
          .query("products")
          .withIndex("by_branch", (query) =>
            query.eq("branchId", assignedBranch(user)),
          )
          .order("asc")
          .take(MAX_EXPORT_ROWS + 1);
  const includeCost = hasPermission(user, "view_profits");
  const columns: ExportColumn[] = [
    { key: "name", label: "المنتج" },
    { key: "sku", label: "SKU" },
    { key: "barcode", label: "الباركود" },
    { key: "sellPrice", label: "سعر البيع" },
    ...(includeCost ? [{ key: "costPrice", label: "سعر التكلفة" }] : []),
    { key: "stock", label: "الرصيد" },
    { key: "minStock", label: "حد إعادة الطلب" },
    { key: "unit", label: "الوحدة" },
    { key: "isActive", label: "نشط" },
  ];
  const rows: ExportCell[][] = documents.map((document) => [
    document.name,
    document.sku,
    document.barcode ?? null,
    document.sellPrice,
    ...(includeCost ? [document.costPrice] : []),
    document.stock,
    document.minStock,
    document.unit,
    document.isActive,
  ]);
  return payload(user, "products", columns, rows);
}

async function customerExport(ctx: MutationCtx, user: AuthUser) {
  const documents =
    user.role === "admin"
      ? await ctx.db.query("customers").order("asc").take(MAX_EXPORT_ROWS + 1)
      : await ctx.db
          .query("customers")
          .withIndex("by_branch", (query) =>
            query.eq("branchId", assignedBranch(user)),
          )
          .order("asc")
          .take(MAX_EXPORT_ROWS + 1);
  return payload(
    user,
    "customers",
    [
      { key: "name", label: "العميل" },
      { key: "phone", label: "الهاتف" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "address", label: "العنوان" },
      { key: "balance", label: "الرصيد القديم" },
      { key: "totalPurchases", label: "إجمالي المشتريات" },
      { key: "isActive", label: "نشط" },
    ],
    documents.map((document) => [
      document.name,
      document.phone,
      document.email ?? null,
      document.address ?? null,
      document.balance,
      document.totalPurchases,
      document.isActive ?? true,
    ]),
  );
}

async function invoiceExport(ctx: MutationCtx, user: AuthUser) {
  const documents =
    user.role === "admin"
      ? await ctx.db.query("invoices").order("asc").take(MAX_EXPORT_ROWS + 1)
      : await ctx.db
          .query("invoices")
          .withIndex("by_branch_date", (query) =>
            query.eq("branchId", assignedBranch(user)),
          )
          .order("asc")
          .take(MAX_EXPORT_ROWS + 1);
  return payload(
    user,
    "invoices",
    [
      { key: "invoiceNumber", label: "رقم الفاتورة" },
      { key: "date", label: "التاريخ" },
      { key: "customerName", label: "العميل" },
      { key: "customerPhone", label: "هاتف العميل" },
      { key: "items", label: "البنود" },
      { key: "subtotal", label: "قبل الخصم والضريبة" },
      { key: "discount", label: "الخصم" },
      { key: "tax", label: "الضريبة" },
      { key: "total", label: "الإجمالي" },
      { key: "paid", label: "المدفوع" },
      { key: "remaining", label: "المتبقي" },
      { key: "paymentMethod", label: "طريقة الدفع" },
      { key: "status", label: "الحالة" },
    ],
    documents.map((document) => [
      document.invoiceNumber,
      document.date ?? null,
      document.customerName,
      document.customerPhone ?? null,
      document.items
        .map((item) => `${item.productName} × ${item.quantity}`)
        .join(" | "),
      document.subtotal,
      document.discount,
      document.tax,
      document.total,
      document.paid,
      document.remaining,
      document.paymentMethod,
      document.status,
    ]),
  );
}

async function orderExport(ctx: MutationCtx, user: AuthUser) {
  const documents =
    user.role === "admin"
      ? await ctx.db.query("orders").order("asc").take(MAX_EXPORT_ROWS + 1)
      : await ctx.db
          .query("orders")
          .withIndex("by_branch_status", (query) =>
            query.eq("branchId", assignedBranch(user)),
          )
          .order("asc")
          .take(MAX_EXPORT_ROWS + 1);
  return payload(
    user,
    "orders",
    [
      { key: "orderNumber", label: "رقم الأوردر" },
      { key: "customerName", label: "العميل" },
      { key: "customerPhone", label: "هاتف العميل" },
      { key: "items", label: "البنود" },
      { key: "total", label: "الإجمالي" },
      { key: "deposit", label: "العربون" },
      { key: "remaining", label: "المتبقي" },
      { key: "status", label: "الحالة" },
      { key: "expectedDate", label: "التاريخ المتوقع" },
    ],
    documents.map((document) => [
      document.orderNumber,
      document.customerName,
      document.customerPhone ?? null,
      document.items
        .map((item) => `${item.productName} × ${item.quantity}`)
        .join(" | "),
      document.total,
      document.deposit,
      document.remaining,
      document.status,
      document.expectedDate ?? null,
    ]),
  );
}

async function repairExport(ctx: MutationCtx, user: AuthUser) {
  const documents =
    user.role === "admin"
      ? await ctx.db.query("repairs").order("asc").take(MAX_EXPORT_ROWS + 1)
      : await ctx.db
          .query("repairs")
          .withIndex("by_branch_received", (query) =>
            query.eq("branchId", assignedBranch(user)),
          )
          .order("asc")
          .take(MAX_EXPORT_ROWS + 1);
  return payload(
    user,
    "repairs",
    [
      { key: "repairNumber", label: "رقم الصيانة" },
      { key: "receivedDate", label: "تاريخ الاستلام" },
      { key: "customerName", label: "العميل" },
      { key: "customerPhone", label: "هاتف العميل" },
      { key: "device", label: "الجهاز" },
      { key: "problem", label: "العطل" },
      { key: "technicianName", label: "الفني" },
      { key: "totalCost", label: "الإجمالي" },
      { key: "deposit", label: "المقدم" },
      { key: "remaining", label: "المتبقي" },
      { key: "status", label: "الحالة" },
    ],
    documents.map((document) => [
      document.repairNumber,
      document.receivedDate,
      document.customerName,
      document.customerPhone,
      [document.deviceType, document.deviceBrand, document.deviceModel]
        .filter(Boolean)
        .join(" - "),
      document.problem,
      document.technicianName ?? null,
      document.totalCost,
      document.deposit,
      document.remaining,
      document.status,
    ]),
  );
}

async function shipmentExport(ctx: MutationCtx, user: AuthUser) {
  const documents =
    user.role === "admin"
      ? await ctx.db.query("shipments").order("asc").take(MAX_EXPORT_ROWS + 1)
      : await ctx.db
          .query("shipments")
          .withIndex("by_branch", (query) =>
            query.eq("branchId", assignedBranch(user)),
          )
          .order("asc")
          .take(MAX_EXPORT_ROWS + 1);
  return payload(
    user,
    "shipments",
    [
      { key: "shipmentNumber", label: "رقم الشحنة" },
      { key: "supplierName", label: "المورد" },
      { key: "items", label: "البنود" },
      { key: "totalCost", label: "تكلفة البضاعة" },
      { key: "shippingCost", label: "تكلفة الشحن" },
      { key: "grandTotal", label: "الإجمالي" },
      { key: "status", label: "الحالة" },
      { key: "expectedDate", label: "الوصول المتوقع" },
      { key: "arrivedDate", label: "تاريخ الوصول" },
    ],
    documents.map((document) => [
      document.shipmentNumber,
      document.supplierName,
      document.items
        .map((item) => `${item.productName} × ${item.quantity}`)
        .join(" | "),
      document.totalCost,
      document.shippingCost,
      document.grandTotal,
      document.status,
      document.expectedDate ?? null,
      document.arrivedDate ?? null,
    ]),
  );
}

async function supplierExport(ctx: MutationCtx, user: AuthUser) {
  const documents = await ctx.db
    .query("suppliers")
    .order("asc")
    .take(MAX_EXPORT_ROWS + 1);
  return payload(
    user,
    "suppliers",
    [
      { key: "name", label: "المورد" },
      { key: "phone", label: "الهاتف" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "address", label: "العنوان" },
      { key: "isActive", label: "نشط" },
    ],
    documents.map((document) => [
      document.name,
      document.phone,
      document.email ?? null,
      document.address ?? null,
      document.isActive ?? true,
    ]),
    true,
  );
}

async function expenseExport(ctx: MutationCtx, user: AuthUser) {
  const documents =
    user.role === "admin"
      ? await ctx.db.query("expenses").order("asc").take(MAX_EXPORT_ROWS + 1)
      : await ctx.db
          .query("expenses")
          .withIndex("by_branch_date", (query) =>
            query.eq("branchId", assignedBranch(user)),
          )
          .order("asc")
          .take(MAX_EXPORT_ROWS + 1);
  return payload(
    user,
    "expenses",
    [
      { key: "title", label: "المصروف" },
      { key: "category", label: "التصنيف" },
      { key: "amount", label: "المبلغ" },
      { key: "date", label: "التاريخ" },
      { key: "paymentMethod", label: "طريقة الدفع" },
      { key: "status", label: "الحالة" },
      { key: "notes", label: "ملاحظات" },
    ],
    documents.map((document) => [
      document.title,
      document.category,
      document.amount,
      document.date,
      document.paymentMethod,
      document.status ?? "active",
      document.notes ?? null,
    ]),
  );
}

async function deliveryExport(ctx: MutationCtx, user: AuthUser) {
  const documents =
    user.role === "admin"
      ? await ctx.db.query("deliveries").order("asc").take(MAX_EXPORT_ROWS + 1)
      : await ctx.db
          .query("deliveries")
          .withIndex("by_branch_status", (query) =>
            query.eq("branchId", assignedBranch(user)),
          )
          .order("asc")
          .take(MAX_EXPORT_ROWS + 1);
  return payload(
    user,
    "deliveries",
    [
      { key: "deliveryNumber", label: "رقم التوصيل" },
      { key: "orderNumber", label: "رقم الأوردر" },
      { key: "invoiceNumber", label: "رقم الفاتورة" },
      { key: "customerName", label: "العميل" },
      { key: "customerPhone", label: "هاتف العميل" },
      { key: "city", label: "المدينة" },
      { key: "address", label: "العنوان" },
      { key: "shippingCompany", label: "شركة الشحن" },
      { key: "trackingNumber", label: "رقم التتبع" },
      { key: "totalAmount", label: "قيمة الطلب" },
      { key: "shippingCost", label: "تكلفة الشحن" },
      { key: "codAmount", label: "تحصيل COD" },
      { key: "status", label: "الحالة" },
    ],
    documents.map((document) => [
      document.deliveryNumber,
      document.orderNumber ?? null,
      document.invoiceNumber ?? null,
      document.customerName,
      document.customerPhone,
      document.city,
      document.address,
      document.shippingCompany,
      document.trackingNumber ?? null,
      document.totalAmount,
      document.shippingCost,
      document.codAmount ?? 0,
      document.status,
    ]),
  );
}

async function buildExport(
  ctx: MutationCtx,
  user: AuthUser,
  dataset: ExportDataset,
) {
  switch (dataset) {
    case "products":
      return productExport(ctx, user);
    case "customers":
      return customerExport(ctx, user);
    case "invoices":
      return invoiceExport(ctx, user);
    case "orders":
      return orderExport(ctx, user);
    case "repairs":
      return repairExport(ctx, user);
    case "shipments":
      return shipmentExport(ctx, user);
    case "suppliers":
      return supplierExport(ctx, user);
    case "expenses":
      return expenseExport(ctx, user);
    case "deliveries":
      return deliveryExport(ctx, user);
    default:
      throw new ConvexError("مجموعة بيانات التصدير غير مدعومة");
  }
}

export const exportDataset = mutation({
  args: { dataset: datasetValidator },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "export_data");
    const dataset = args.dataset as ExportDataset;
    const requiredPermission = DATASET_PERMISSIONS[dataset];
    if (!hasPermission(user, requiredPermission)) {
      throw new ConvexError("لا تملك صلاحية عرض البيانات المطلوبة للتصدير");
    }
    const moduleName = DATASET_MODULES[dataset];
    if (moduleName) await requireModuleEnabled(ctx, moduleName);

    const result = await buildExport(ctx, user, dataset);
    await logAction(ctx, user, {
      action: "export",
      module: "data_export",
      details: `تصدير ${DATASET_LABELS[dataset]}: ${result.rows.length} سجل`,
      branchId:
        dataset === "suppliers" || user.role === "admin"
          ? null
          : user.branchId,
      after: {
        dataset,
        rows: result.rows.length,
        truncated: result.truncated,
        scope: result.scope,
      },
    });
    return result;
  },
});
