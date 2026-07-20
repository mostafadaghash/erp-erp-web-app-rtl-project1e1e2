import { mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { changeProductStock } from "./lib/inventory";
import { INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules";

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    // Check if already seeded
    const existing = await ctx.db.query("settings").first();
    if (existing) return "تم البذر مسبقاً";

    // Settings
    await ctx.db.insert("settings", {
      storeName: "تك ستور",
      storeType: "electronics",
      primaryColor: "#6366f1",
      secondaryColor: "#8b5cf6",
      currency: "EGP",
      taxRate: 14,
      phone: "01012345678",
      address: "القاهرة، مدينة نصر",
      whatsappNumber: "201012345678",
    });

    // Categories
    const cat1 = await ctx.db.insert("categories", { name: "لابتوب", icon: "laptop" });
    const cat2 = await ctx.db.insert("categories", { name: "موبايل", icon: "smartphone" });
    const cat3 = await ctx.db.insert("categories", { name: "بلايستيشن", icon: "gamepad" });
    const cat4 = await ctx.db.insert("categories", { name: "إكسسوارات", icon: "headphones" });

    // Suppliers
    const sup1 = await ctx.db.insert("suppliers", {
      name: "شركة التقنية المتقدمة",
      phone: "01112345678",
      email: "info@techco.eg",
      address: "القاهرة",
      balance: 5000,
    });
    const sup2 = await ctx.db.insert("suppliers", {
      name: "مستودع الإلكترونيات",
      phone: "01212345678",
      balance: 0,
    });

    // Products
    const prod1 = await ctx.db.insert("products", {
      name: "لابتوب Dell XPS 15",
      sku: "DELL-XPS-15",
      categoryId: cat1,
      supplierId: sup1,
      costPrice: 3500,
      sellPrice: 4200,
      stock: 0,
      minStock: 2,
      unit: "قطعة",
      isActive: true,
      warrantyMonths: 12,
    });
    const prod2 = await ctx.db.insert("products", {
      name: "iPhone 15 Pro Max",
      sku: "IPHONE-15-PM",
      categoryId: cat2,
      supplierId: sup1,
      costPrice: 4500,
      sellPrice: 5200,
      stock: 0,
      minStock: 3,
      unit: "قطعة",
      isActive: true,
      warrantyMonths: 12,
    });
    const prod3 = await ctx.db.insert("products", {
      name: "PlayStation 5",
      sku: "PS5-STD",
      categoryId: cat3,
      supplierId: sup2,
      costPrice: 1800,
      sellPrice: 2200,
      stock: 0,
      minStock: 2,
      unit: "قطعة",
      isActive: true,
      warrantyMonths: 12,
    });
    const prod4 = await ctx.db.insert("products", {
      name: "سماعة AirPods Pro",
      sku: "AIRPODS-PRO",
      categoryId: cat4,
      supplierId: sup1,
      costPrice: 600,
      sellPrice: 850,
      stock: 0,
      minStock: 5,
      unit: "قطعة",
      isActive: true,
      warrantyMonths: 6,
    });
    const prod5 = await ctx.db.insert("products", {
      name: "Samsung Galaxy S24 Ultra",
      sku: "SAM-S24-ULTRA",
      categoryId: cat2,
      supplierId: sup1,
      costPrice: 4000,
      sellPrice: 4800,
      stock: 0,
      minStock: 3,
      unit: "قطعة",
      isActive: true,
      warrantyMonths: 12,
    });

    for (const [productId, quantity] of [[prod1, 8], [prod2, 5], [prod3, 3], [prod4, 15], [prod5, 1]] as const) {
      await changeProductStock(ctx, user, { productId, quantityDelta: quantity, type: INVENTORY_MOVEMENT_TYPES.openingBalance, reason: "رصيد افتتاحي للبيانات التجريبية" });
    }

    // Customers
    const cust1 = await ctx.db.insert("customers", {
      name: "أحمد محمد السيد",
      phone: "01012345678",
      email: "ahmed@email.com",
      address: "القاهرة",
      balance: 500,
      totalPurchases: 8500,
    });
    const cust2 = await ctx.db.insert("customers", {
      name: "سارة عبدالله حسن",
      phone: "01123456789",
      balance: 0,
      totalPurchases: 5200,
    });
    const cust3 = await ctx.db.insert("customers", {
      name: "محمد خالد إبراهيم",
      phone: "01234567890",
      balance: 1200,
      totalPurchases: 12000,
    });

    // Invoices
    await ctx.db.insert("invoices", {
      invoiceNumber: "INV-00001",
      customerId: cust1,
      customerName: "أحمد محمد العمري",
      customerPhone: "01012345678",
      items: [{
        productId: prod1,
        productName: "لابتوب Dell XPS 15",
        quantity: 1,
        unitPrice: 4200,
        discount: 0,
        total: 4200,
      }],
      subtotal: 4200,
      discount: 0,
      tax: 630,
      total: 4830,
      paid: 4330,
      remaining: 500,
      paymentMethod: "cash",
      status: "partial",
      type: "sale",
    });
    await ctx.db.insert("invoices", {
      invoiceNumber: "INV-00002",
      customerId: cust2,
      customerName: "سارة عبدالله الزهراني",
      customerPhone: "01123456789",
      items: [{
        productId: prod2,
        productName: "iPhone 15 Pro Max",
        quantity: 1,
        unitPrice: 5200,
        discount: 200,
        total: 5000,
      }],
      subtotal: 5200,
      discount: 200,
      tax: 750,
      total: 5750,
      paid: 5750,
      remaining: 0,
      paymentMethod: "card",
      status: "paid",
      type: "sale",
    });

    // Repairs
    await ctx.db.insert("repairs", {
      repairNumber: "REP-00001",
      customerId: cust1,
      customerName: "أحمد محمد العمري",
      customerPhone: "01012345678",
      deviceType: "لابتوب",
      deviceBrand: "Dell",
      deviceModel: "XPS 13",
      problem: "الشاشة لا تعمل",
      parts: [],
      laborCost: 300,
      totalCost: 300,
      deposit: 100,
      remaining: 200,
      status: "in_progress",
      receivedDate: "2024-01-15",
      expectedDate: "2024-01-20",
      trackingToken: "ABC12345",
      technicianName: "فهد التقني",
    });
    await ctx.db.insert("repairs", {
      repairNumber: "REP-00002",
      customerName: "خالد السعيد",
      customerPhone: "01512345678",
      deviceType: "موبايل",
      deviceBrand: "Samsung",
      deviceModel: "Galaxy S23",
      problem: "شاشة مكسورة",
      parts: [{ name: "شاشة أصلية", cost: 400, quantity: 1 }],
      laborCost: 100,
      totalCost: 500,
      deposit: 200,
      remaining: 300,
      status: "ready",
      receivedDate: "2024-01-14",
      expectedDate: "2024-01-18",
      trackingToken: "XYZ98765",
      technicianName: "سعد الفني",
    });

    // Expenses
    await ctx.db.insert("expenses", {
      title: "إيجار المحل",
      category: "إيجار",
      amount: 5000,
      date: "2024-01-01",
      paymentMethod: "transfer",
    });
    await ctx.db.insert("expenses", {
      title: "فاتورة الكهرباء",
      category: "مرافق",
      amount: 800,
      date: "2024-01-10",
      paymentMethod: "cash",
    });
    await ctx.db.insert("expenses", {
      title: "رواتب الموظفين",
      category: "رواتب",
      amount: 12000,
      date: "2024-01-30",
      paymentMethod: "transfer",
    });

    return "تم إضافة البيانات التجريبية بنجاح";
  },
});
