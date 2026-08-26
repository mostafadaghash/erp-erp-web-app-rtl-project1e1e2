import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Page } from "./ERPApp";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle,
  CircleDollarSign,
  Clock,
  FileText,
  Landmark,
  Package,
  ReceiptText,
  ShoppingBag,
  Target,
  Truck,
  UserPlus,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import { useCurrency } from "../lib/utils";
import type { Permission } from "../../convex/lib/permissions";
import type { ReportingOverview } from "../../shared/reportingView";

interface DashboardProps {
  onNavigate: (page: Page) => void;
  onRequestCreate: (page: "new-invoice" | "shipments" | "products" | "customers") => void;
  permissions: Permission[];
  modules: Record<string, boolean | undefined>;
}

type ModuleCard = {
  page: Page;
  title: string;
  description: string;
  icon: React.ElementType;
  tone: string;
  enabled: boolean;
};

export function Dashboard({ onNavigate, onRequestCreate, permissions, modules }: DashboardProps) {
  const can = (permission: Permission) => permissions.includes(permission);
  const enabled = (moduleName: string) => modules[moduleName] !== false;

  const canViewInvoices = can("view_invoices") && enabled("invoices");
  const canViewRepairs = can("view_repairs") && enabled("repairs");
  const canViewProducts = can("view_products");
  const canViewLeads = can("view_leads") && enabled("crm");
  const canViewReports = can("view_reports");
  const canViewProfits = can("view_profits");
  const canViewPurchases = can("view_shipments") && enabled("shipments");
  const canViewSuppliers = can("view_suppliers") && enabled("suppliers");
  const canViewCustomers = can("view_customers");
  const canViewTreasury = can("view_finance");

  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const monthFrom = `${today.slice(0, 7)}-01`;

  const report = useQuery(
    api.reporting.overview,
    canViewReports ? { from: monthFrom, to: today } : "skip",
  ) as ReportingOverview | undefined;
  const repairStats = useQuery(api.repairs.getStats, canViewRepairs ? {} : "skip");
  const lowStockProducts = useQuery(api.products.list, canViewProducts ? { lowStock: true } : "skip");
  const recentInvoices = useQuery(api.invoices.list, canViewInvoices ? {} : "skip");
  const crmStats = useQuery(api.leads.stats, canViewLeads ? {} : "skip");

  const { formatCurrency } = useCurrency();

  const moduleCards: ModuleCard[] = [
    {
      page: "invoices",
      title: "المبيعات",
      description: "الفواتير والتحصيل ومرتجعات العملاء",
      icon: ReceiptText,
      tone: "bg-emerald-50 text-emerald-700",
      enabled: canViewInvoices,
    },
    {
      page: "shipments",
      title: "المشتريات",
      description: "فواتير الموردين والمشتريات والمرتجعات",
      icon: ShoppingBag,
      tone: "bg-blue-50 text-blue-700",
      enabled: canViewPurchases,
    },
    {
      page: "products",
      title: "المخزون",
      description: "الأصناف والكميات والحركات والجرد",
      icon: Boxes,
      tone: "bg-violet-50 text-violet-700",
      enabled: canViewProducts,
    },
    {
      page: "general-ledger",
      title: "الحسابات",
      description: "الأستاذ العام والحسابات والحركات المالية",
      icon: FileText,
      tone: "bg-cyan-50 text-cyan-700",
      enabled: can("view_general_ledger"),
    },
    {
      page: "treasury",
      title: "الخزينة والبنوك",
      description: "الأرصدة والتحويلات والحركة النقدية",
      icon: Landmark,
      tone: "bg-amber-50 text-amber-700",
      enabled: canViewTreasury,
    },
    {
      page: "customers",
      title: "العملاء",
      description: "دليل العملاء والأرصدة والمتابعة",
      icon: Users,
      tone: "bg-teal-50 text-teal-700",
      enabled: canViewCustomers,
    },
    {
      page: "suppliers",
      title: "الموردون",
      description: "دليل الموردين والمستحقات والمدفوعات",
      icon: Truck,
      tone: "bg-orange-50 text-orange-700",
      enabled: canViewSuppliers,
    },
    {
      page: "repairs",
      title: "الصيانة",
      description: "أوامر الصيانة وحالة الأجهزة والمتابعة",
      icon: Wrench,
      tone: "bg-rose-50 text-rose-700",
      enabled: canViewRepairs,
    },
    {
      page: "reports",
      title: "التقارير",
      description: "تقارير المبيعات والمخزون والحسابات",
      icon: BarChart3,
      tone: "bg-indigo-50 text-indigo-700",
      enabled: canViewReports,
    },
  ].filter(card => card.enabled);

  const quickActions = [
    { key: "new-invoice", label: "فاتورة بيع", icon: ReceiptText, visible: can("create_invoices"), onClick: () => onRequestCreate("new-invoice") },
    { key: "shipments", label: "عملية شراء", icon: ShoppingBag, visible: can("create_shipments") && enabled("shipments"), onClick: () => onRequestCreate("shipments") },
    { key: "products", label: "إضافة صنف", icon: Package, visible: can("create_products"), onClick: () => onRequestCreate("products") },
    { key: "customers", label: "إضافة عميل", icon: UserPlus, visible: can("create_customers"), onClick: () => onRequestCreate("customers") },
    { key: "treasury", label: "الخزينة والبنوك", icon: WalletCards, visible: canViewTreasury, onClick: () => onNavigate("treasury") },
  ].filter(action => action.visible);

  const statCards = report
    ? [
        {
          title: "صافي مبيعات الشهر",
          value: formatCurrency(report.sales.netSales),
          note: `${report.sales.invoiceCount.toLocaleString("ar-EG")} فاتورة`,
          icon: ReceiptText,
          tone: "bg-emerald-50 text-emerald-700",
        },
        {
          title: "صافي التحصيل",
          value: formatCurrency(report.collections.netCollections),
          note: "بعد الاستردادات",
          icon: ArrowUpRight,
          tone: "bg-blue-50 text-blue-700",
        },
        {
          title: "مستحقات العملاء",
          value: formatCurrency(report.currentBalances.customerReceivables),
          note: "الرصيد الحالي",
          icon: Users,
          tone: "bg-amber-50 text-amber-700",
        },
        {
          title: "مصروفات الشهر",
          value: formatCurrency(report.expenses.totalExpenses),
          note: "المصروفات المسجلة",
          icon: CircleDollarSign,
          tone: "bg-rose-50 text-rose-700",
        },
        {
          title: "قيد التحصيل لدى شركات الشحن",
          value: formatCurrency(report.cod.currentOutstanding),
          note: `تمت تسويته ${formatCurrency(report.cod.settled)}`,
          icon: Truck,
          tone: "bg-sky-50 text-sky-700",
        },
        ...(canViewProfits && report.profitability ? [{
          title: "صافي ربح الشهر",
          value: report.profitability.netProfit === null ? "بيانات التكلفة غير مكتملة" : formatCurrency(report.profitability.netProfit),
          note: report.profitability.netMargin === null ? `${report.profitability.incompleteCogsInvoices.toLocaleString("ar-EG")} فاتورة تحتاج مراجعة` : `هامش ${report.profitability.netMargin.toLocaleString("ar-EG")}٪`,
          icon: BarChart3,
          tone: "bg-violet-50 text-violet-700",
        }] : []),
      ]
    : [];

  const repairStatusCards = [
    { label: "مستلمة", value: repairStats?.received ?? 0, icon: Clock },
    { label: "قيد الإصلاح", value: repairStats?.inProgress ?? 0, icon: Wrench },
    { label: "جاهزة للتسليم", value: repairStats?.ready ?? 0, icon: CheckCircle },
    { label: "تم التسليم", value: repairStats?.delivered ?? 0, icon: CheckCircle },
  ];

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <section className="erp-toolbar">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><BarChart3 className="h-5 w-5" /></span>
          <div><h1 className="erp-page-title"><BarChart3 className="h-5 w-5 text-[var(--erp-accent)]" />لوحة التحكم</h1><p className="text-xs text-slate-500">المؤشرات والعمليات الأكثر استخدامًا في مكان واحد</p></div>
        </div>
        <div className="text-sm font-bold text-slate-500">
          {new Date().toLocaleDateString("ar-EG", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      </section>

      {quickActions.length > 0 && (
        <section className="erp-section">
          <div className="erp-section-header"><h2 className="erp-section-title">إجراءات سريعة</h2><span className="text-xs text-slate-400">العمليات الأكثر استخدامًا</span></div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            {quickActions.map(action => {
              const Icon = action.icon;
              return <button key={action.key} onClick={action.onClick} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"><Icon className="h-4 w-4" />{action.label}</button>;
            })}
          </div>
        </section>
      )}

      {canViewReports && report === undefined && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: canViewProfits ? 6 : 5 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      )}

      {statCards.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-black text-slate-800">ملخص الأداء</h2><span className="text-xs text-slate-400">هذا الشهر</span></div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {statCards.map(card => {
              const Icon = card.icon;
              return <div key={card.title} className="erp-metric-card"><div className="flex items-start justify-between gap-3"><div><p className="erp-metric-label">{card.title}</p><p className="erp-metric-value">{card.value}</p><p className="mt-1 text-xs text-slate-400">{card.note}</p></div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tone}`}><Icon className="h-5 w-5" /></div></div></div>;
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-800">الوحدات الرئيسية</h2>
          <span className="text-xs text-slate-400">وصول سريع لكل أقسام النظام</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {moduleCards.map(card => {
            const Icon = card.icon;
            return (
              <button key={card.page} onClick={() => onNavigate(card.page)} className="erp-module-card group flex items-center gap-3 p-4 text-right">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.tone}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><h3 className="font-black text-slate-900">{card.title}</h3><p className="mt-1 truncate text-xs text-slate-500">{card.description}</p><div className="mt-2 text-xs font-bold text-[var(--erp-accent-strong)]">فتح القسم ←</div></div>
              </button>
            );
          })}
        </div>
      </section>

      {report && canViewProfits && !report.completeness.profitabilityAvailable && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">بعض الفواتير القديمة تحتاج استكمال تكلفة البضاعة قبل عرض مؤشرات الربحية بدقة.</div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {canViewInvoices && (
          <section className="erp-section xl:col-span-2">
            <div className="erp-section-header">
              <h2 className="erp-section-title flex items-center gap-2"><FileText className="h-4 w-4 text-emerald-600" />أحدث فواتير المبيعات</h2>
              <button onClick={() => onNavigate("invoices")} className="text-sm font-bold text-emerald-700">عرض الكل</button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
                <tbody>
                  {(recentInvoices ?? []).slice(0, 5).map(inv => <tr key={inv._id}><td className="font-mono text-xs text-blue-700">{inv.invoiceNumber}</td><td className="font-medium">{inv.customerName}</td><td className="font-bold">{formatCurrency(inv.total)}</td><td><span className={`badge ${inv.status === "paid" ? "badge-success" : inv.status === "partial" ? "badge-warning" : "badge-danger"}`}>{inv.status === "paid" ? "مدفوعة" : inv.status === "partial" ? "مدفوعة جزئيًا" : "غير مسددة"}</span></td></tr>)}
                  {(recentInvoices ?? []).length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">لا توجد فواتير مسجلة حتى الآن.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="space-y-4">
          {canViewProducts && (
            <section className="erp-section">
              <div className="erp-section-header"><h2 className="erp-section-title flex items-center gap-2"><Boxes className="h-4 w-4 text-amber-600" />متابعة المخزون</h2><button onClick={() => onNavigate("products")} className="text-xs font-bold text-emerald-700">إدارة المخزون</button></div>
              <div className="space-y-2 p-4">
                {(lowStockProducts ?? []).slice(0, 4).map(product => <div key={product._id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"><span className="truncate text-sm font-bold text-slate-700">{product.name}</span><span className="badge badge-warning">متبقي {product.stock}</span></div>)}
                {(lowStockProducts ?? []).length === 0 && <p className="py-4 text-center text-sm text-slate-400">لا توجد أصناف منخفضة المخزون حاليًا.</p>}
              </div>
            </section>
          )}

          {canViewRepairs && (
            <section className="erp-section">
              <div className="erp-section-header"><h2 className="erp-section-title flex items-center gap-2"><Wrench className="h-4 w-4 text-rose-600" />حالة أوامر الصيانة</h2></div>
              <div className="grid grid-cols-2 gap-3 p-4">
                {repairStatusCards.map(card => {
                  const Icon = card.icon;
                  return <button key={card.label} onClick={() => onNavigate("repairs")} className="rounded-xl border border-slate-200 bg-white p-3 text-center transition hover:bg-slate-50"><Icon className="mx-auto mb-1 h-4 w-4 text-slate-500" /><p className="text-xl font-black text-slate-800">{card.value}</p><p className="mt-1 text-xs text-slate-500">{card.label}</p></button>;
                })}
              </div>
            </section>
          )}

          {canViewLeads && (
            <section className="erp-section">
              <div className="erp-section-header"><h2 className="erp-section-title flex items-center gap-2"><Target className="h-4 w-4 text-indigo-600" />العملاء المحتملون</h2><button onClick={() => onNavigate("crm")} className="text-xs font-bold text-emerald-700">فتح المتابعة</button></div>
              <div className="grid grid-cols-3 gap-3 p-4 text-center"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-black">{crmStats?.total ?? 0}</p><p className="text-xs text-slate-500">الإجمالي</p></div><div className="rounded-xl bg-blue-50 p-3"><p className="text-xl font-black text-blue-700">{crmStats?.new ?? 0}</p><p className="text-xs text-slate-500">جدد</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xl font-black text-emerald-700">{crmStats?.won ?? 0}</p><p className="text-xs text-slate-500">تم التعاقد</p></div></div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
