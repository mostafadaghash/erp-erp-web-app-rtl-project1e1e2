import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { useCurrency } from "../lib/utils";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Package,
  Printer,
  ReceiptText,
  SlidersHorizontal,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReportingOverview } from "../../shared/reportingView";

type Period = "today" | "week" | "month" | "year" | "custom";
type ReportKind = "overview" | "sales" | "purchases" | "profit" | "treasury" | "inventory" | "customers" | "suppliers";
type BranchOption = { _id: Id<"branches">; name: string };
type Tone = "indigo" | "emerald" | "amber" | "red" | "sky" | "violet";

const toneClasses: Record<Tone, { icon: string; background: string }> = {
  indigo: { icon: "text-indigo-600", background: "bg-indigo-50" },
  emerald: { icon: "text-emerald-600", background: "bg-emerald-50" },
  amber: { icon: "text-amber-600", background: "bg-amber-50" },
  red: { icon: "text-red-600", background: "bg-red-50" },
  sky: { icon: "text-sky-600", background: "bg-sky-50" },
  violet: { icon: "text-violet-600", background: "bg-violet-50" },
};

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfPeriod(period: Exclude<Period, "custom">, now: Date) {
  const start = new Date(now);
  if (period === "today") return isoDate(start);
  if (period === "week") {
    start.setDate(start.getDate() - 6);
    return isoDate(start);
  }
  if (period === "month") {
    start.setDate(1);
    return isoDate(start);
  }
  return `${start.getFullYear()}-01-01`;
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function rangeError(from: string, to: string) {
  if (!validIsoDate(from) || !validIsoDate(to)) {
    return "أدخل تاريخ بداية ونهاية صحيحين.";
  }
  if (from > to) return "تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.";
  const days =
    Math.floor(
      (new Date(`${to}T00:00:00.000Z`).valueOf() -
        new Date(`${from}T00:00:00.000Z`).valueOf()) /
        86_400_000,
    ) + 1;
  return days > 366 ? "الفترة الواحدة لا يمكن أن تتجاوز 366 يومًا." : null;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("ar-EG", {
    month: "short",
    year: "2-digit",
  });
}

function percentage(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("ar-EG")}٪`;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  const classes = toneClasses[tone];
  return (
    <div className="erp-metric-card">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${classes.background}`}>
        <Icon className={`h-5 w-5 ${classes.icon}`} />
      </div>
      <p className="text-xl font-black text-slate-800">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{label}</p>
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="erp-section p-5">
      <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
        <Icon className="h-5 w-5 text-[var(--erp-accent)]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

const reportOptions: Array<{ id: ReportKind; title: string; description: string; icon: LucideIcon; profitOnly?: boolean }> = [
  { id: "overview", title: "الملخص التنفيذي", description: "صورة كاملة عن النشاط", icon: BarChart3 },
  { id: "sales", title: "تقرير المبيعات", description: "الفواتير والمرتجعات والتحصيل", icon: ShoppingCart },
  { id: "purchases", title: "تقرير المشتريات", description: "الموردون والتكلفة والمدفوعات", icon: ReceiptText },
  { id: "profit", title: "الأرباح والخسائر", description: "المبيعات والتكلفة والمصروفات", icon: CircleDollarSign, profitOnly: true },
  { id: "treasury", title: "الخزينة والتحصيل", description: "الحركة النقدية وحسابات السيولة", icon: WalletCards },
  { id: "inventory", title: "قيمة المخزون", description: "القيمة الحالية والأصناف الأعلى", icon: Package },
  { id: "customers", title: "أرصدة العملاء", description: "المديونيات والمقدمات", icon: Users },
  { id: "suppliers", title: "أرصدة الموردين", description: "المستحقات والسداد", icon: Truck },
];

function FocusedReport({
  kind,
  report,
  formatCurrency,
}: {
  kind: ReportKind;
  report: ReportingOverview;
  formatCurrency: (value: number) => string;
}) {
  const rows: Record<ReportKind, Array<[string, string]>> = {
    overview: [
      ["صافي المبيعات", formatCurrency(report.sales.netSales)],
      ["صافي التحصيل", formatCurrency(report.collections.netCollections)],
      ["إجمالي المصروفات", formatCurrency(report.expenses.totalExpenses)],
      ["رصيد الخزائن والبنوك", formatCurrency(report.currentBalances.liquidAccounts)],
    ],
    sales: [
      ["إجمالي المبيعات", formatCurrency(report.sales.grossSales)],
      ["مرتجعات المبيعات", formatCurrency(report.sales.salesReturns)],
      ["صافي المبيعات", formatCurrency(report.sales.netSales)],
      ["عدد الفواتير", report.sales.invoiceCount.toLocaleString("ar-EG")],
    ],
    purchases: [
      ["المشتريات الواصلة", formatCurrency(report.purchases.landedPurchases)],
      ["إشعارات خصم المورد", formatCurrency(report.purchases.supplierCredits)],
      ["مدفوعات الموردين", formatCurrency(report.purchases.supplierPayments)],
      ["المستحق حاليًا", formatCurrency(report.currentBalances.supplierPayables)],
    ],
    profit: [
      ["صافي المبيعات", formatCurrency(report.sales.netSales)],
      ["تكلفة البضاعة", report.profitability?.cogs === null || report.profitability?.cogs === undefined ? "غير مكتملة" : formatCurrency(report.profitability.cogs)],
      ["مجمل الربح", report.profitability?.grossProfit === null || report.profitability?.grossProfit === undefined ? "غير مكتمل" : formatCurrency(report.profitability.grossProfit)],
      ["صافي الربح", report.profitability?.netProfit === null || report.profitability?.netProfit === undefined ? "غير مكتمل" : formatCurrency(report.profitability.netProfit)],
    ],
    treasury: [
      ["التحصيلات", formatCurrency(report.collections.collections)],
      ["المبالغ المستردة", formatCurrency(report.collections.refunds)],
      ["صافي التحصيل", formatCurrency(report.collections.netCollections)],
      ["الخزائن والبنوك", formatCurrency(report.currentBalances.liquidAccounts)],
    ],
    inventory: [
      ["قيمة المخزون الحالية", report.currentBalances.inventoryValue === undefined ? "غير متاحة" : formatCurrency(report.currentBalances.inventoryValue)],
      ["المشتريات الواصلة", formatCurrency(report.purchases.landedPurchases)],
      ["قيمة المرتجعات للمورد", formatCurrency(report.purchases.returnedInventoryValue)],
      ["أصناف تاريخية ناقصة التكلفة", report.completeness.legacyInventoryValueProducts.toLocaleString("ar-EG")],
    ],
    customers: [
      ["مستحقات العملاء", formatCurrency(report.currentBalances.customerReceivables)],
      ["مقدمات العملاء", formatCurrency(report.currentBalances.customerAdvances)],
      ["صافي التحصيل", formatCurrency(report.collections.netCollections)],
      ["فواتير الفترة", report.sales.invoiceCount.toLocaleString("ar-EG")],
    ],
    suppliers: [
      ["مديونية الموردين", formatCurrency(report.currentBalances.supplierPayables)],
      ["مديونية منشأة خلال الفترة", formatCurrency(report.purchases.supplierLiabilityCreated)],
      ["مدفوعات الموردين", formatCurrency(report.purchases.supplierPayments)],
      ["عدد مستندات الشراء", report.purchases.receiptCount.toLocaleString("ar-EG")],
    ],
  };

  return (
    <section className="erp-section" data-testid={`active-report-${kind}`}>
      <div className="erp-section-header">
        <div><p className="text-xs font-bold text-[var(--erp-accent-strong)]">نتيجة التقرير المختار</p><h2 className="erp-section-title mt-1">{reportOptions.find((option) => option.id === kind)?.title}</h2></div>
        <button className="erp-action" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة التقرير</button>
      </div>
      <dl className="grid gap-0 p-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows[kind].map(([label, value]) => <div key={label} className="m-1 rounded-xl border border-slate-100 bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-2 text-lg font-black text-[var(--erp-navy)]">{value}</dd></div>)}
      </dl>
    </section>
  );
}

export function ReportsPage() {
  const canViewReports = usePermission("view_reports");
  const canViewProfits = usePermission("view_profits");
  const { formatCurrency } = useCurrency();
  const now = new Date();
  const today = isoDate(now);
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState(startOfPeriod("month", now));
  const [customTo, setCustomTo] = useState(today);
  const [branchId, setBranchId] = useState<Id<"branches"> | "">("");
  const [activeReport, setActiveReport] = useState<ReportKind>("overview");

  const me = useQuery(api.employees.me);
  const branchesQuery = useQuery(
    api.reporting.availableBranches,
    canViewReports ? {} : "skip",
  );
  const branches = (branchesQuery ?? []) as BranchOption[];
  const canSelectBranch = me?.role === "admin" || me?.role === "accountant";
  const from = period === "custom" ? customFrom : startOfPeriod(period, now);
  const to = period === "custom" ? customTo : today;
  const validationMessage = rangeError(from, to);
  const report = useQuery(
    api.reporting.overview,
    canViewReports && !validationMessage
      ? {
          from,
          to,
          branchId: canSelectBranch && branchId ? branchId : undefined,
        }
      : "skip",
  ) as ReportingOverview | undefined;

  if (!canViewReports) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          لا تملك صلاحية عرض التقارير.
        </div>
      </div>
    );
  }

  const periodLabels: Record<Period, string> = {
    today: "اليوم",
    week: "آخر 7 أيام",
    month: "هذا الشهر",
    year: "هذه السنة",
    custom: "فترة مخصصة",
  };
  const trendMax = Math.max(
    ...(report?.trend.map((row) =>
      Math.max(
        Math.abs(row.netSales),
        Math.abs(row.operatingExpenses + row.carrierFees),
        Math.abs(row.grossProfit ?? 0),
      ),
    ) ?? [1]),
    1,
  );

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <header className="erp-page-header">
        <div>
          <span className="erp-kicker">تحليلات موثقة من الحركات الفعلية</span>
          <h1 className="erp-page-title">
            <BarChart3 className="h-6 w-6 text-[var(--erp-accent)]" />
            مركز التقارير
          </h1>
          <p className="erp-page-subtitle">
            مبنية على تاريخ العملية وصافي الحركات المثبتة في الدفاتر.
          </p>
        </div>
        <div className="professional-panel grid gap-3 p-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">
            <span className="mb-1 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              نطاق الفرع
            </span>
            {canSelectBranch ? (
              <select
                className="form-input min-w-52"
                value={branchId}
                onChange={(event) =>
                  setBranchId(
                    event.target.value
                      ? (event.target.value as Id<"branches">)
                      : "",
                  )
                }
              >
                <option value="">كل الفروع — مجمع</option>
                {branches.map((branch) => (
                  <option key={branch._id} value={branch._id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="block rounded-lg border bg-slate-50 px-3 py-2 text-sm font-normal">
                {branches[0]?.name ?? "فرع المستخدم"}
              </span>
            )}
          </label>
          <div className="text-xs font-bold text-slate-600">
            <span className="mb-1 flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              الفترة
            </span>
            <select
              className="form-input min-w-44"
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
            >
              {(Object.keys(periodLabels) as Period[]).map((option) => (
                <option key={option} value={option}>
                  {periodLabels[option]}
                </option>
              ))}
            </select>
          </div>
          {period === "custom" && (
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">
                من
                <input
                  className="form-input mt-1"
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                إلى
                <input
                  className="form-input mt-1"
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
            </div>
          )}
          <button
            data-testid="report-apply-filters"
            className="btn-primary flex items-center justify-center gap-2 sm:col-span-2"
            disabled={Boolean(validationMessage)}
            onClick={() => document.getElementById("report-output")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <SlidersHorizontal className="h-4 w-4" />
            عرض التقرير بالفلاتر المحددة
          </button>
        </div>
      </header>

      <section className="erp-section" aria-label="التقارير المتاحة">
        <div className="erp-section-header">
          <div><h2 className="erp-section-title">التقارير المتاحة</h2><p className="mt-1 text-xs text-slate-500">اختر التقرير ثم حدّد الفرع والفترة واضغط عرض التقرير</p></div>
          <span className="erp-status">{reportOptions.filter((option) => !option.profitOnly || canViewProfits).length.toLocaleString("ar-EG")} تقارير</span>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {reportOptions.filter((option) => !option.profitOnly || canViewProfits).map((option) => {
            const Icon = option.icon;
            const selected = activeReport === option.id;
            return (
              <button
                key={option.id}
                data-testid={`report-option-${option.id}`}
                onClick={() => {
                  setActiveReport(option.id);
                  requestAnimationFrame(() => document.getElementById("report-output")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                }}
                className={`flex items-center gap-3 rounded-xl border p-3 text-right transition ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-slate-50"}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0"><strong className="block text-sm">{option.title}</strong><small className="mt-1 block truncate text-xs opacity-70">{option.description}</small></span>
              </button>
            );
          })}
        </div>
      </section>

      {validationMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {validationMessage}
        </div>
      )}

      {!validationMessage && report === undefined && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      )}

      {report && (
        <div id="report-output" className="contents">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              {report.scope.from} ← {report.scope.to}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              {report.scope.consolidated
                ? `تقرير مجمع — ${report.scope.branchCount} فروع`
                : "تقرير فرع واحد"}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
              أساس التاريخ: تاريخ العملية
            </span>
          </div>

          <FocusedReport kind={activeReport} report={report} formatCurrency={formatCurrency} />

          {canViewProfits && !report.completeness.profitabilityAvailable && (
            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">الربحية غير مكتملة لهذه الفترة</p>
                <p className="mt-1 text-sm">
                  توجد {report.completeness.incompleteCogsInvoices.toLocaleString("ar-EG")} فاتورة
                  دون COGS تاريخي مكتمل. لن يعرض النظام ربحًا تقديريًا من التكلفة الحالية.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <MetricCard
              label="صافي المبيعات"
              value={formatCurrency(report.sales.netSales)}
              detail={`${report.sales.invoiceCount.toLocaleString("ar-EG")} فاتورة بعد المرتجعات`}
              icon={TrendingUp}
              tone="emerald"
            />
            <MetricCard
              label="صافي التحصيلات"
              value={formatCurrency(report.collections.netCollections)}
              detail={`تحصيل ${formatCurrency(report.collections.collections)} · رد ${formatCurrency(report.collections.refunds)}`}
              icon={ArrowDownToLine}
              tone="indigo"
            />
            <MetricCard
              label="إجمالي المصروفات"
              value={formatCurrency(report.expenses.totalExpenses)}
              detail={`تشغيل ${formatCurrency(report.expenses.operatingExpenses)} · شحن ${formatCurrency(report.expenses.carrierFees)}`}
              icon={TrendingDown}
              tone="red"
            />
            <MetricCard
              label="مستحقات العملاء الحالية"
              value={formatCurrency(report.currentBalances.customerReceivables)}
              detail={`مقدمات العملاء ${formatCurrency(report.currentBalances.customerAdvances)}`}
              icon={Users}
              tone="amber"
            />
            {report.profitability && (
              <>
                <MetricCard
                  label="مجمل الربح"
                  value={
                    report.profitability.grossProfit === null
                      ? "غير مكتمل"
                      : formatCurrency(report.profitability.grossProfit)
                  }
                  detail={`الهامش ${percentage(report.profitability.grossMargin)}`}
                  icon={CircleDollarSign}
                  tone="violet"
                />
                <MetricCard
                  label="صافي الربح"
                  value={
                    report.profitability.netProfit === null
                      ? "غير مكتمل"
                      : formatCurrency(report.profitability.netProfit)
                  }
                  detail={`الهامش ${percentage(report.profitability.netMargin)}`}
                  icon={BarChart3}
                  tone="indigo"
                />
              </>
            )}
            <MetricCard
              label="مديونية الموردين الحالية"
              value={formatCurrency(report.currentBalances.supplierPayables)}
              detail={`مدفوعات الفترة ${formatCurrency(report.purchases.supplierPayments)}`}
              icon={ReceiptText}
              tone="sky"
            />
            <MetricCard
              label="COD لدى شركات الشحن"
              value={formatCurrency(report.cod.currentOutstanding)}
              detail={`حُصل ${formatCurrency(report.cod.collected)} · سُوي ${formatCurrency(report.cod.settled)}`}
              icon={Truck}
              tone="amber"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="اتجاه الأداء الشهري" icon={BarChart3}>
              {report.trend.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">لا توجد حركة في الفترة.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex h-48 items-end gap-3 overflow-x-auto border-b border-slate-100 pb-2">
                    {report.trend.map((row) => (
                      <div key={row.month} className="flex min-w-16 flex-1 flex-col items-center gap-1">
                        <div className="flex h-36 w-full items-end justify-center gap-1">
                          <div
                            className="w-3 rounded-t bg-indigo-500"
                            title={`صافي المبيعات: ${formatCurrency(row.netSales)}`}
                            style={{
                              height: `${Math.max(2, (Math.abs(row.netSales) / trendMax) * 100)}%`,
                            }}
                          />
                          <div
                            className="w-3 rounded-t bg-red-400"
                            title={`المصروفات: ${formatCurrency(row.operatingExpenses + row.carrierFees)}`}
                            style={{
                              height: `${Math.max(
                                2,
                                (Math.abs(row.operatingExpenses + row.carrierFees) /
                                  trendMax) *
                                  100,
                              )}%`,
                            }}
                          />
                          {canViewProfits && row.grossProfit !== null && (
                            <div
                              className="w-3 rounded-t bg-emerald-500"
                              title={`مجمل الربح: ${formatCurrency(row.grossProfit)}`}
                              style={{
                                height: `${Math.max(
                                  2,
                                  (Math.abs(row.grossProfit) / trendMax) * 100,
                                )}%`,
                              }}
                            />
                          )}
                        </div>
                        <span className="text-xs text-slate-500">{monthLabel(row.month)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <i className="h-3 w-3 rounded-sm bg-indigo-500" /> صافي المبيعات
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="h-3 w-3 rounded-sm bg-red-400" /> المصروفات والرسوم
                    </span>
                    {canViewProfits && (
                      <span className="flex items-center gap-1">
                        <i className="h-3 w-3 rounded-sm bg-emerald-500" /> مجمل الربح
                      </span>
                    )}
                  </div>
                </div>
              )}
            </Section>

            <Section title="المنتجات الأعلى مبيعًا" icon={Package}>
              {report.topProducts.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">لا توجد بنود مبيعات في الفترة.</p>
              ) : (
                <div className="space-y-3">
                  {report.topProducts.map((product, index) => (
                    <div key={`${product.productName}-${index}`} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{product.productName}</p>
                        <p className="text-xs text-slate-400">
                          {product.quantity.toLocaleString("ar-EG")} قطعة
                          {product.grossProfit !== undefined &&
                            product.grossProfit !== null &&
                            ` · ربح ${formatCurrency(product.grossProfit)}`}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-slate-700">
                        {formatCurrency(product.netSales)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Section title="المبيعات والتحصيل" icon={ShoppingCart}>
              <dl className="space-y-3 text-sm">
                <ReportRow label="إجمالي المبيعات" value={formatCurrency(report.sales.grossSales)} />
                <ReportRow label="مرتجعات المبيعات" value={formatCurrency(report.sales.salesReturns)} />
                <ReportRow label="تحصيلات معكوسة" value={formatCurrency(report.collections.reversedCollections)} />
                <ReportRow label="استردادات معكوسة" value={formatCurrency(report.collections.reversedRefunds)} />
              </dl>
            </Section>
            <Section title="المشتريات والموردون" icon={ArrowUpFromLine}>
              <dl className="space-y-3 text-sm">
                <ReportRow label="تكلفة المشتريات الواصلة" value={formatCurrency(report.purchases.landedPurchases)} />
                <ReportRow label="مديونية مورد منشأة" value={formatCurrency(report.purchases.supplierLiabilityCreated)} />
                <ReportRow label="إشعارات خصم المورد" value={formatCurrency(report.purchases.supplierCredits)} />
                <ReportRow label="صافي المديونية المنشأة" value={formatCurrency(report.purchases.netSupplierLiabilityCreated)} />
              </dl>
            </Section>
            <Section title="الأرصدة الحالية" icon={WalletCards}>
              <dl className="space-y-3 text-sm">
                <ReportRow label="الخزائن والبنوك" value={formatCurrency(report.currentBalances.liquidAccounts)} />
                <ReportRow label="حسابات التسوية الأخرى" value={formatCurrency(report.currentBalances.otherClearingAccounts)} />
                {report.currentBalances.inventoryValue !== undefined && (
                  <ReportRow label="قيمة المخزون" value={formatCurrency(report.currentBalances.inventoryValue)} />
                )}
                <ReportRow label="حركة COD الصافية للفترة" value={formatCurrency(report.cod.netPeriodMovement)} />
              </dl>
            </Section>
          </div>

          {report.completeness.legacyInventoryValueProducts > 0 && canViewProfits && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              توجد {report.completeness.legacyInventoryValueProducts.toLocaleString("ar-EG")} منتجات قديمة
              دون قيمة مخزون تاريخية مكتملة؛ قيمة المخزون الحالية لا تتضمن تقديرًا تلقائيًا لها.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-bold text-slate-800">{value}</dd>
    </div>
  );
}
