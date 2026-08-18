import { useQuery } from "convex/react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  CircleDollarSign,
  Package,
  ReceiptText,
  ShoppingBag,
  Target,
  Truck,
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

const moduleCards: ModuleCard[] = [
  {
    page: "invoices",
    title: "المبيعات",
    description: "الفواتير والتحصيلات ومرتجعات العملاء.",
    icon: ReceiptText,
    permission: "view_invoices",
    moduleKey: "invoices",
    tone: "emerald",
  },
  {
    page: "shipments",
    title: "المشتريات",
    description: "عمليات الشراء والموردون ومرتجعات المشتريات.",
    icon: ShoppingBag,
    permission: "view_shipments",
    moduleKey: "shipments",
    tone: "blue",
  },
  {
    page: "products",
    title: "المخزون",
    description: "الأصناف والكميات والحركات والمتابعة المخزنية.",
    icon: Boxes,
    permission: "view_products",
    tone: "violet",
  },
  {
    page: "accounts-home",
    title: "الحسابات",
    description: "الخزائن والعملاء والموردون والمصروفات والمحاسبة العامة.",
    icon: BookOpen,
    permission: "view_finance",
    tone: "cyan",
  },
  {
    page: "deliveries",
    title: "الشحن والتوصيل",
    description: "الشحنات والتسليم والتحصيل لدى شركات الشحن.",
    icon: Truck,
    permission: "view_deliveries",
    moduleKey: "deliveries",
    tone: "amber",
  },
  {
    page: "repairs",
    title: "الصيانة",
    description: "أوامر الصيانة وحالة الأجهزة والمتابعة حتى التسليم.",
    icon: Wrench,
    permission: "view_repairs",
    moduleKey: "repairs",
    tone: "rose",
  },
  {
    page: "customers",
    title: "العملاء",
    description: "بيانات العملاء والأرصدة والتعاملات المرتبطة بهم.",
    icon: Users,
    permission: "view_customers",
    tone: "green",
  },
  {
    page: "suppliers",
    title: "الموردون",
    description: "بيانات الموردين والمشتريات والمدفوعات والمستحقات.",
    icon: Package,
    permission: "view_suppliers",
    moduleKey: "suppliers",
    tone: "orange",
  },
  {
    page: "reports",
    title: "التقارير",
    description: "تقارير تشغيلية ومالية تساعدك على اتخاذ القرار.",
    icon: BarChart3,
    permission: "view_reports",
    moduleKey: "reports",
    tone: "indigo",
  },
];

const toneClass: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
  violet: "bg-violet-50 text-violet-700",
  cyan: "bg-cyan-50 text-cyan-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  green: "bg-green-50 text-green-700",
  orange: "bg-orange-50 text-orange-700",
  indigo: "bg-indigo-50 text-indigo-700",
};

export function Dashboard({ onNavigate, permissions, modules }: DashboardProps) {
  const can = (permission: Permission) => permissions.includes(permission);
  const enabled = (moduleName?: string) => !moduleName || modules[moduleName] !== false;
  const canViewReports = can("view_reports") && enabled("reports");
  const { formatCurrency } = useCurrency();

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

  const visibleModules = moduleCards.filter(
    (card) => (!card.permission || can(card.permission)) && enabled(card.moduleKey),
  );

  const quickActions = [
    can("create_invoices") && { page: "new-invoice" as Page, label: "فاتورة بيع", icon: ReceiptText },
    can("create_orders") && { page: "orders" as Page, label: "أمر بيع", icon: Target },
    can("create_shipments") && enabled("shipments") && { page: "shipments" as Page, label: "عملية شراء", icon: ShoppingBag },
    can("create_deliveries") && enabled("deliveries") && { page: "deliveries" as Page, label: "شحنة جديدة", icon: Truck },
    can("view_finance") && { page: "treasury" as Page, label: "الخزائن والبنوك", icon: WalletCards },
    can("view_reports") && enabled("reports") && { page: "reports" as Page, label: "التقارير", icon: BarChart3 },
  ].filter(Boolean) as Array<{ page: Page; label: string; icon: React.ElementType }>;

  const kpis = report
    ? [
        {
          label: "صافي مبيعات الشهر",
          value: formatCurrency(report.sales.netSales),
          icon: ReceiptText,
          tone: "bg-emerald-50 text-emerald-700",
        },
        {
          label: "صافي التحصيل",
          value: formatCurrency(report.collections.netCollections),
          icon: CircleDollarSign,
          tone: "bg-blue-50 text-blue-700",
        },
        {
          label: "مستحقات العملاء",
          value: formatCurrency(report.currentBalances.customerReceivables),
          icon: Users,
          tone: "bg-amber-50 text-amber-700",
        },
        {
          label: "مبالغ لدى شركات الشحن",
          value: formatCurrency(report.cod.currentOutstanding),
          icon: Truck,
          tone: "bg-violet-50 text-violet-700",
        },
      ]
    : [];

  return (
    <div className="erp-page space-y-5" dir="rtl">
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
            نظرة سريعة على أهم أقسام ونشاط النظام.
          </p>
        </div>
      </header>

      {canViewReports && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">ملخص النشاط</h2>
              <p className="mt-1 text-xs text-slate-500">أهم المؤشرات الحالية بصورة مختصرة.</p>
            </div>
          </div>
          {report === undefined ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {kpis.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="professional-card erp-kpi">
                    <div>
                      <p className="erp-kpi-label">{item.label}</p>
                      <p className="erp-kpi-value">{item.value}</p>
                    </div>
                    <div className={`grid h-11 w-11 place-items-center rounded-xl ${item.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-black text-slate-900">الأقسام الرئيسية</h2>
          <p className="mt-1 text-xs text-slate-500">ادخل مباشرة إلى القسم الذي تريد العمل عليه.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleModules.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.page}
                type="button"
                onClick={() => onNavigate(card.page)}
                className="professional-card group min-h-44 p-5 text-right transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className={`mb-5 grid h-14 w-14 place-items-center rounded-2xl ${toneClass[card.tone]}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-slate-900 transition group-hover:text-[var(--brand-primary)]">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
                <span className="mt-4 inline-flex text-xs font-black text-[var(--brand-primary)]">فتح القسم</span>
              </button>
            );
          })}
        </div>
      </section>

      {quickActions.length > 0 && (
        <section className="professional-panel p-4 lg:p-5">
          <div className="mb-4">
            <h2 className="text-base font-black text-slate-900">إجراءات سريعة</h2>
            <p className="mt-1 text-xs text-slate-500">اختصارات للعمليات اليومية الأكثر استخدامًا.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(({ page, label, icon: Icon }) => (
              <button key={label} type="button" className="erp-action-button" onClick={() => onNavigate(page)}>
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
