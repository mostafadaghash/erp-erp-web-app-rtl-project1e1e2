import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowDownLeft, ArrowUpLeft, Boxes, Building2, CircleDollarSign, Landmark, PackageSearch, ReceiptText, RefreshCcw, ShoppingBag, TrendingUp, Truck, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Permission } from "../../convex/lib/permissions";
import { validateReportingRange } from "../../shared/reportingRules";
import type { ReportingOverview } from "../../shared/reportingView";
import { useCurrency } from "../lib/utils";
import type { ReportKind } from "./ReportsPage";

interface DashboardProps { onOpenReport: (report: ReportKind) => void; permissions: Permission[]; }
type Period = "today" | "week" | "month" | "year" | "custom";
type DashboardCard = { key: string; title: string; value: number | null | undefined; note: string; report: ReportKind; icon: React.ElementType; tone: string; comparisonValue?: number | null; protected?: boolean; };

const periodLabels: Record<Period, string> = { today: "اليوم", week: "آخر 7 أيام", month: "هذا الشهر", year: "هذه السنة", custom: "فترة مخصصة" };
function isoDate(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function periodStart(period: Exclude<Period, "custom">, now = new Date()) { const start = new Date(now); if (period === "today") return isoDate(start); if (period === "week") { start.setDate(start.getDate() - 6); return isoDate(start); } if (period === "month") { start.setDate(1); return isoDate(start); } return `${start.getFullYear()}-01-01`; }
function previousRange(from: string, to: string) { const fromDate = new Date(`${from}T00:00:00.000Z`); const toDate = new Date(`${to}T00:00:00.000Z`); const days = Math.max(1, Math.round((toDate.valueOf() - fromDate.valueOf()) / 86_400_000) + 1); const previousTo = new Date(fromDate); previousTo.setUTCDate(previousTo.getUTCDate() - 1); const previousFrom = new Date(previousTo); previousFrom.setUTCDate(previousFrom.getUTCDate() - days + 1); return { from: previousFrom.toISOString().slice(0, 10), to: previousTo.toISOString().slice(0, 10) }; }
function validRange(from: string, to: string) { try { validateReportingRange(from, to); return true; } catch { return false; } }
function comparisonPercent(current: number | null | undefined, previous: number | null | undefined) { if (current == null || previous == null || previous === 0) return null; return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10; }

export function Dashboard({ onOpenReport, permissions }: DashboardProps) {
  const canViewReports = permissions.includes("view_reports"); const canViewProfits = permissions.includes("view_profits"); const canViewProducts = permissions.includes("view_products");
  const now = useMemo(() => new Date(), []); const today = isoDate(now);
  const [period, setPeriod] = useState<Period>("month"); const [from, setFrom] = useState(periodStart("month", now)); const [to, setTo] = useState(today); const [branchId, setBranchId] = useState<Id<"branches"> | "">(""); const [compare, setCompare] = useState(true); const [refreshedAt, setRefreshedAt] = useState(Date.now());
  const me = useQuery(api.employees.me); const branches = useQuery(api.reporting.availableBranches, canViewReports ? {} : "skip") ?? []; const canSelectBranch = me?.role === "admin" || me?.role === "accountant"; const rangeIsValid = validRange(from, to);
  const reportArgs = rangeIsValid ? { from, to, branchId: canSelectBranch && branchId ? branchId : undefined } : null;
  const report = useQuery(api.reporting.overview, canViewReports && reportArgs ? reportArgs : "skip") as ReportingOverview | undefined;
  const comparisonRange = rangeIsValid ? previousRange(from, to) : null;
  const previousReport = useQuery(api.reporting.overview, canViewReports && compare && comparisonRange ? { ...comparisonRange, branchId: canSelectBranch && branchId ? branchId : undefined } : "skip") as ReportingOverview | undefined;
  const lowStockProducts = useQuery(api.products.list, canViewProducts ? { lowStock: true } : "skip"); const { formatCurrency, formatAmount } = useCurrency();
  const changePeriod = (next: Period) => { setPeriod(next); if (next === "custom") return; setFrom(periodStart(next, new Date())); setTo(isoDate(new Date())); };
  const cards: DashboardCard[] = report ? [
    { key: "sales", title: "إجمالي المبيعات", value: report.sales.netSales, comparisonValue: previousReport?.sales.netSales, note: `${formatAmount(report.sales.invoiceCount)} فاتورة بعد المرتجعات`, report: "sales", icon: ReceiptText, tone: "emerald" },
    { key: "purchases", title: "إجمالي المشتريات", value: report.purchases.landedPurchases, comparisonValue: previousReport?.purchases.landedPurchases, note: `${formatAmount(report.purchases.receiptCount)} مستند شراء`, report: "purchases", icon: ShoppingBag, tone: "blue" },
    { key: "profit", title: "صافي الربح", value: report.profitability?.netProfit, comparisonValue: previousReport?.profitability?.netProfit, note: report.completeness.profitabilityAvailable ? `هامش ${formatAmount(report.profitability?.netMargin ?? 0)}٪` : "تحتاج بعض التكاليف التاريخية للمراجعة", report: "profit", icon: TrendingUp, tone: "violet", protected: !canViewProfits },
    { key: "expenses", title: "إجمالي المصروفات", value: report.expenses.totalExpenses, comparisonValue: previousReport?.expenses.totalExpenses, note: "مصروفات التشغيل ورسوم الشحن", report: "treasury", icon: CircleDollarSign, tone: "rose" },
    { key: "treasury", title: "أرصدة الخزائن", value: report.currentBalances.liquidAccounts, note: "الخزائن النقدية والبنوك والحسابات", report: "treasury", icon: Landmark, tone: "cyan" },
    { key: "customers", title: "مديونيات العملاء", value: report.currentBalances.customerReceivables, note: "إجمالي الأرصدة المطلوب تحصيلها", report: "customers", icon: Users, tone: "amber" },
    { key: "suppliers", title: "مستحقات الموردين", value: report.currentBalances.supplierPayables, note: "إجمالي الالتزامات الحالية للموردين", report: "suppliers", icon: Truck, tone: "orange" },
    { key: "inventory", title: "قيمة المخزون", value: report.currentBalances.inventoryValue, note: canViewProducts ? `${formatAmount(lowStockProducts?.length ?? 0)} صنف تحت حد الطلب` : "التنبيهات حسب صلاحية المخزون", report: "inventory", icon: Boxes, tone: "slate", protected: !canViewProfits },
  ] : [];
  return <div className="erp-dashboard-compact p-4 lg:p-5" data-refreshed-at={refreshedAt}>
    <section className="erp-dashboard-controls" aria-label="فلاتر لوحة التحكم"><div className="min-w-0"><p className="erp-kicker">ملخص الإدارة</p><h1 className="erp-page-title">لوحة التحكم</h1></div><div className="erp-dashboard-filter-grid">
      <label><span className="sr-only">الفترة</span><select className="form-input" value={period} onChange={(event) => changePeriod(event.target.value as Period)} aria-label="اختيار الفترة">{(Object.keys(periodLabels) as Period[]).map((value) => <option key={value} value={value}>{periodLabels[value]}</option>)}</select></label>
      {period === "custom" && <><input className="form-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="من تاريخ" /><input className="form-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="إلى تاريخ" /></>}
      <label className="relative"><Building2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select className="form-input pr-9" value={branchId} onChange={(event) => setBranchId(event.target.value as Id<"branches"> | "")} disabled={!canSelectBranch} aria-label="اختيار الفرع"><option value="">{canSelectBranch ? "كل الفروع" : branches[0]?.name ?? "فرع المستخدم"}</option>{canSelectBranch && branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></label>
      <label className="erp-dashboard-compare"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} /><span>مقارنة بالفترة السابقة</span></label>
      <button type="button" className="btn-secondary inline-flex items-center justify-center gap-2" onClick={() => setRefreshedAt(Date.now())} title="البيانات تتحدث لحظيًا"><RefreshCcw className="h-4 w-4" />تحديث البيانات</button>
    </div></section>
    {!rangeIsValid && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">اختر فترة صحيحة لا تتجاوز 366 يومًا لعرض مؤشرات لوحة التحكم.</div>}
    {!canViewReports && <div className="erp-empty-state mt-4">لا تملك صلاحية عرض مؤشرات الإدارة والتقارير.</div>}
    {canViewReports && report === undefined && rangeIsValid && <div className="erp-dashboard-card-grid mt-4" aria-label="جارٍ تحميل المؤشرات">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />)}</div>}
    {cards.length > 0 && <section className="erp-dashboard-card-grid mt-4" aria-label="المؤشرات الرئيسية">{cards.map((card) => { const Icon = card.icon; const change = compare ? comparisonPercent(card.value, card.comparisonValue) : null; const ChangeIcon = change !== null && change < 0 ? ArrowDownLeft : ArrowUpLeft; return <button key={card.key} type="button" data-testid={`dashboard-card-${card.key}`} className={`erp-dashboard-card tone-${card.tone}`} onClick={() => onOpenReport(card.report)}><div className="flex items-start justify-between gap-3"><div className="min-w-0 text-right"><p className="erp-metric-label">{card.title}</p><p className="erp-dashboard-card-value">{card.protected || card.value == null ? "غير متاح" : formatCurrency(card.value)}</p></div><span className="erp-dashboard-card-icon"><Icon className="h-5 w-5" /></span></div><div className="mt-auto flex items-end justify-between gap-2 pt-4"><p className="line-clamp-2 text-right text-xs leading-5 text-slate-500">{card.note}</p>{change !== null && <span className={`erp-dashboard-change ${change < 0 ? "down" : "up"}`}><ChangeIcon className="h-3.5 w-3.5" />{formatAmount(Math.abs(change))}٪</span>}</div><span className="erp-dashboard-card-link"><PackageSearch className="h-3.5 w-3.5" />فتح التقرير</span></button>; })}</section>}
  </div>;
}
