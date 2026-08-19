import { useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Boxes,
  CheckCircle,
  CircleDollarSign,
  Clock,
  Package,
  PhoneCall,
  ReceiptText,
  ShoppingBag,
  Star,
  Target,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Permission } from "../../convex/lib/permissions";
import type { ReportingOverview } from "../../shared/reportingView";
import { useCurrency } from "../lib/utils";
import type { Page } from "./ERPApp";

interface DashboardProps {
  onNavigate: (page: Page) => void;
  permissions: Permission[];
  modules: Record<string, boolean | undefined>;
}

interface ModuleCard {
  page: Page;
  title: string;
  description: string;
  icon: React.ElementType;
  permission?: Permission;
  moduleKey?: string;
  tone: string;
}

const MODULE_CARDS: ModuleCard[] = [
  {
    page: "invoices",
    title: "المبيعات",
    description: "الفواتير والتحصيلات ومرتجعات العملاء",
    icon: ReceiptText,
    permission: "view_invoices",
    moduleKey: "invoices",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    page: "shipments",
    title: "المشتريات",
    description: "عمليات الشراء والموردون ومرتجعات المشتريات",
    icon: ShoppingBag,
    permission: "view_shipments",
    moduleKey: "shipments",
    tone: "bg-blue-50 text-blue-700",
  },
  {
    page: "products",
    title: "المخزون",
    description: "الأصناف والكميات والحركات والجرد",
    icon: Boxes,
    permission: "view_products",
    tone: "bg-violet-50 text-violet-700",
  },
  {
    page: "accounts-home",
    title: "الحسابات",
    description: "الخزائن والعملاء والموردون والمحاسبة العامة",
    icon: BookOpen,
    permission: "view_finance",
    tone: "bg-cyan-50 text-cyan-700",
  },
  {
    page: "deliveries",
    title: "الشحن والتوصيل",
    description: "الشحنات والتسليم والتحصيل لدى شركات الشحن",
    icon: Truck,
    permission: "view_deliveries",
    moduleKey: "deliveries",
    tone: "bg-amber-50 text-amber-700",
  },
  {
    page: "repairs",
    title: "الصيانة",
    description: "أوامر الصيانة وحالة الأجهزة حتى التسليم",
    icon: Wrench,
    permission: "view_repairs",
    moduleKey: "repairs",
    tone: "bg-rose-50 text-rose-700",
  },
  {
    page: "customers",
    title: "العملاء",
    description: "بيانات العملاء والأرصدة والتعاملات",
    icon: Users,
    permission: "view_customers",
    tone: "bg-green-50 text-green-700",
  },
  {
    page: "suppliers",
    title: "الموردون",
    description: "بيانات الموردين والمدفوعات والمستحقات",
    icon: Package,
    permission: "view_suppliers",
    moduleKey: "suppliers",
    tone: "bg-orange-50 text-orange-700",
  },
  {
    page: "reports",
    title: "التقارير",
    description: "تقارير تشغيلية ومالية لاتخاذ القرار",
    icon: BarChart3,
    permission: "view_reports",
    moduleKey: "reports",
    tone: "bg-indigo-50 text-indigo-700",
  },
];

export function Dashboard({ onNavigate, permissions, modules }: DashboardProps) {
  const can = (permission: Permission) => permissions.includes(permission);
  const enabled = (moduleName?: string) => !moduleName || modules[moduleName] !== false;

  const canViewInvoices = can("view_invoices") && enabled("invoices");
  const canViewRepairs = can("view_repairs") && enabled("repairs");
  const canViewProducts = can("view_products");
  const canViewLeads = can("view_leads") && enabled("crm");
  const canViewReports = can("view_reports") && enabled("reports");
  const canViewProfits = can("view_profits");

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
  const lowStockProducts = useQuery(
    api.products.list,
    canViewProducts ? { lowStock: true } : "skip",
  );
  const recentInvoices = useQuery(api.invoices.list, canViewInvoices ? {} : "skip");
  const recentRepairs = useQuery(api.repairs.list, canViewRepairs ? {} : "skip");
  const crmStats = useQuery(api.leads.stats, canViewLeads ? {} : "skip");

  const { formatCurrency } = useCurrency();

  const visibleModules = MODULE_CARDS.filter(
    (card) => (!card.permission || can(card.permission)) && enabled(card.moduleKey),
  );

  const quickActions = [
    can("create_invoices") && {
      page: "new-invoice" as Page,
      label: "فاتورة بيع",
      icon: ReceiptText,
    },
    can("create_orders") && {
      page: "orders" as Page,
      label: "أمر بيع",
      icon: Target,
    },
    can("create_shipments") && enabled("shipments") && {
      page: "shipments" as Page,
      label: "عملية شراء",
      icon: ShoppingBag,
    },
    can("create_deliveries") && enabled("deliveries") && {
      page: "deliveries" as Page,
      label: "شحنة جديدة",
      icon: Truck,
    },
    can("view_finance") && {
      page: "treasury" as Page,
      label: "الخزائن والبنوك",
      icon: WalletCards,
    },
  ].filter(Boolean) as Array<{
    page: Page;
    label: string;
    icon: React.ElementType;
  }>;

  const statCards = report
    ? [
        {
          title: "صافي مبيعات الشهر",
          value: formatCurrency(report.sales.netSales),
          sub: `${report.sales.invoiceCount.toLocaleString("ar-EG")} فاتورة بعد المرتجعات`,
          badge: "هذا الشهر",
          icon: TrendingUp,
          tone: "bg-emerald-50 text-emerald-700",
        },
        {
          title: "صافي تحصيل الشهر",
          value: formatCurrency(report.collections.netCollections),
          sub: `رد واسترداد ${formatCurrency(report.collections.refunds)}`,
          badge: "هذا الشهر",
          icon: ArrowUpRight,
          tone: "bg-blue-50 text-blue-700",
        },
        {
          title: "مستحقات العملاء",
          value: formatCurrency(report.currentBalances.customerReceivables),
          sub: `مقدمات ${formatCurrency(report.currentBalances.customerAdvances)}`,
          badge: "رصيد حالي",
          icon: Users,
          tone: "bg-amber-50 text-amber-700",
        },
        {
          title: "مصروفات ورسوم الشهر",
          value: formatCurrency(report.expenses.totalExpenses),
          sub: `رسوم شحن ${formatCurrency(report.expenses.carrierFees)}`,
          badge: "هذا الشهر",
          icon: CircleDollarSign,
          tone: "bg-rose-50 text-rose-700",
        },
        {
          title: "COD لدى شركات الشحن",
          value: formatCurrency(report.cod.currentOutstanding),
          sub: `تمت تسوية ${formatCurrency(report.cod.settled)}`,
          badge: "رصيد حالي",
          icon: Truck,
          tone: "bg-violet-50 text-violet-700",
        },
        ...(canViewProfits && report.profitability
          ? [
              {
                title: "صافي ربح الشهر",
                value:
                  report.profitability.netProfit === null
                    ? "الربحية قيد المراجعة"
                    : formatCurrency(report.profitability.netProfit),
                sub:
                  report.profitability.netMargin === null
                    ? `${report.profitability.incompleteCogsInvoices} فاتورة تحتاج مراجعة تكلفة`
                    : `هامش ${report.profitability.netMargin.toLocaleString("ar-EG")}٪`,
                badge: "هذا الشهر",
                icon: TrendingUp,
                tone: "bg-indigo-50 text-indigo-700",
              },
            ]
          : []),
      ]
    : [];

  const repairStatusCards = [
    { label: "مستلمة", value: repairStats?.received ?? 0 },
    { label: "قيد الإصلاح", value: repairStats?.inProgress ?? 0 },
    { label: "جاهزة للتسليم", value: repairStats?.ready ?? 0 },
    { label: "تم التسليم", value: repairStats?.delivered ?? 0 },
  ];

  return (
    <div className="erp-page space-y-6" dir="rtl">
      <header className="erp-page-header">
        <div>
          <h1 className="erp-page-title">لوحة التحكم</h1>
          <p className="erp-page-subtitle">
            {now.toLocaleDateString("ar-EG", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {" — "}
            وصول سريع للأقسام مع مؤشرات مالية وتشغيلية موثوقة.
          </p>
        </div>
      </header>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-black text-slate-900">الأقسام الرئيسية</h2>
          <p className="mt-1 text-xs text-slate-500">اختر القسم المطلوب وابدأ العمل مباشرة.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleModules.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.page}
                type="button"
                onClick={() => onNavigate(card.page)}
                className="professional-card group min-h-40 p-5 text-right transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl ${card.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black text-slate-900">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
                <span className="mt-4 inline-flex text-xs font-black text-[var(--brand-primary)]">فتح القسم</span>
              </button>
            );
          })}
        </div>
      </section>

      {quickActions.length > 0 && (
        <section className="professional-panel p-4 lg:p-5">
          <div className="mb-3">
            <h2 className="text-base font-black text-slate-900">إجراءات سريعة</h2>
            <p className="mt-1 text-xs text-slate-500">اختصارات للعمليات اليومية الأكثر استخدامًا.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(({ page, label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className="erp-action-button"
                onClick={() => onNavigate(page)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">الملخص المالي</h2>
            <p className="mt-1 text-xs text-slate-500">أرقام مستقاة من التقارير المحاسبية المعتمدة.</p>
          </div>
          {canViewReports && (
            <button
              type="button"
              onClick={() => onNavigate("reports")}
              className="text-xs font-black text-[var(--brand-primary)]"
            >
              عرض التقارير
            </button>
          )}
        </div>

        {canViewReports && report === undefined && (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        )}

        {statCards.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="professional-card erp-kpi">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <p className="erp-kpi-label">{card.title}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        {card.badge}
                      </span>
                    </div>
                    <p className="erp-kpi-value">{card.value}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{card.sub}</p>
                  </div>
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {report && canViewProfits && !report.completeness.profitabilityAvailable && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            بيانات الربحية تحتاج استكمال تكلفة بعض الفواتير قبل عرض نتيجة نهائية دقيقة.
          </div>
        )}
      </section>

      {canViewLeads && (
        <section className="professional-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-black text-slate-900">
                <Target className="h-4 w-4 text-violet-600" />
                متابعة العملاء المحتملين
              </h2>
              <p className="mt-1 text-xs text-slate-500">ملخص سريع لحركة المبيعات قبل الفاتورة.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("crm")}
              className="text-xs font-black text-[var(--brand-primary)]"
            >
              فتح إدارة علاقات العملاء
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {[
              { label: "إجمالي", value: crmStats?.total ?? 0, icon: UserPlus },
              { label: "جديد", value: crmStats?.new ?? 0, icon: UserPlus },
              { label: "تم التواصل", value: crmStats?.contacted ?? 0, icon: PhoneCall },
              { label: "مهتم", value: crmStats?.interested ?? 0, icon: Star },
              { label: "تفاوض", value: crmStats?.negotiating ?? 0, icon: Target },
              { label: "مكتسب", value: crmStats?.won ?? 0, icon: CheckCircle },
              { label: "غير مكتمل", value: crmStats?.lost ?? 0, icon: AlertTriangle },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-xl bg-slate-50 p-3 text-center">
                  <Icon className="mx-auto mb-1 h-4 w-4 text-slate-500" />
                  <p className="text-xl font-black text-slate-800">{item.value}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.label}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(canViewInvoices || canViewRepairs || canViewProducts) && (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {canViewInvoices && (
            <div className="professional-panel overflow-hidden xl:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div>
                  <h2 className="font-black text-slate-900">آخر الفواتير</h2>
                  <p className="mt-1 text-xs text-slate-500">أحدث مستندات البيع المسجلة.</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("invoices")}
                  className="text-xs font-black text-[var(--brand-primary)]"
                >
                  عرض الكل
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>رقم الفاتورة</th>
                      <th>العميل</th>
                      <th>المبلغ</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentInvoices ?? []).slice(0, 5).map((invoice) => (
                      <tr key={invoice._id}>
                        <td className="font-mono text-xs">{invoice.invoiceNumber}</td>
                        <td className="font-medium">{invoice.customerName}</td>
                        <td className="font-bold">{formatCurrency(invoice.total)}</td>
                        <td>
                          <span
                            className={`badge ${
                              invoice.status === "paid"
                                ? "badge-success"
                                : invoice.status === "partial"
                                  ? "badge-warning"
                                  : "badge-danger"
                            }`}
                          >
                            {invoice.status === "paid"
                              ? "مدفوعة"
                              : invoice.status === "partial"
                                ? "مدفوعة جزئيًا"
                                : "مستحقة"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(recentInvoices ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          لا توجد فواتير بعد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(canViewRepairs || canViewProducts) && (
            <div className="space-y-4">
              {canViewRepairs && (
                <div className="professional-panel p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-black text-slate-900">حالة الصيانة</h2>
                      <p className="mt-1 text-xs text-slate-500">الحالة الحالية لأوامر الصيانة.</p>
                    </div>
                    <Wrench className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {repairStatusCards.map((card) => (
                      <div key={card.label} className="rounded-xl bg-slate-50 p-3 text-center">
                        <p className="text-2xl font-black text-slate-800">{card.value}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{card.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    {(recentRepairs ?? []).slice(0, 3).map((repair) => (
                      <button
                        key={repair._id}
                        type="button"
                        onClick={() => onNavigate("repairs")}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-right hover:bg-slate-50"
                      >
                        <span>
                          <span className="block text-xs font-bold text-slate-800">{repair.customerName}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            {repair.deviceBrand} {repair.deviceModel}
                          </span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {repair.status === "received"
                            ? "مستلم"
                            : repair.status === "in_progress"
                              ? "قيد الإصلاح"
                              : repair.status === "ready"
                                ? "جاهز"
                                : "تم التسليم"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {canViewProducts && (lowStockProducts ?? []).length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    <h2 className="font-black text-amber-900">تنبيه المخزون</h2>
                  </div>
                  <div className="space-y-2">
                    {(lowStockProducts ?? []).slice(0, 4).map((product) => (
                      <div key={product._id} className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-bold text-amber-900">{product.name}</span>
                        <span className="text-xs text-amber-800">{product.stock} متبقي</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate("products")}
                    className="mt-4 text-xs font-black text-amber-800"
                  >
                    فتح المخزون
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {!canViewReports && !canViewInvoices && !canViewRepairs && !canViewProducts && (
        <div className="professional-panel p-6 text-center text-sm text-slate-500">
          استخدم الأقسام المتاحة لك من القائمة الرئيسية لبدء العمل.
        </div>
      )}
    </div>
  );
}
