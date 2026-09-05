import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowDownLeft, ArrowUpLeft, Boxes, Building2, CircleDollarSign, Landmark, LayoutDashboard, PackageSearch, ReceiptText, RefreshCcw, ShoppingBag, TrendingUp, Truck, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Permission } from "../../convex/lib/permissions";
import { validateReportingRange } from "../../shared/reportingRules";
import { useCurrency } from "../lib/utils";
import type { ReportKind } from "./ReportsPage";

interface DashboardProps { onOpenReport: (report: ReportKind) => void; permissions: Permission[]; }
type Period = "today" | "week" | "month" | "year" | "custom";
type DashboardCard = { key: string; title: string; value: number | null | undefined; note: string; report: ReportKind; icon: React.ElementType; tone: string; comparisonValue?: number | null; protected?: boolean; };
type ExecutiveOverview = {
  sales: { invoiceCount: number; netSales: number } | null;
  purchases: { receiptCount: number; landedPurchases: number } | null;
  profitability: { netProfit: number | null; netMargin: number | null; complete: boolean } | null;
  expenses: { totalExpenses: number } | null;
  balances: {
    liquidAccounts: number | null;
    customerReceivables: number | null;
    supplierPayables: number | null;
    inventoryValue: number | null;
  };
};

const periodLabels: Record<Period, string> = { today: "اليوم", week: "آخر 7 أيام", month: "هذا الشهر", year: "هذه السنة", custom: "فترة مخصصة" };
function isoDate(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function periodStart(period: Exclude<Period, "custom">, now = new Date()) { const start = new Date(now); if (period === "today") return isoDate(start); if (period === "week") { start.setDate(start.getDate() - 6); return isoDate(start); } if (period === "month") { start.setDate(1); return isoDate(start); } return `${start.getFullYear()}-01-01`; }
function previousRange(from: string, to: string) { const fromDate = new Date(`${from}T00:00:00.000Z`); const toDate = new Date(`${to}T00:00:00.000Z`); const days = Math.max(1, Math.round((toDate.valueOf() - fromDate.valueOf()) / 86_400_000) + 1); const previousTo = new Date(fromDate); previousTo.setUTCDate(previousTo.getUTCDate() - 1); const previousFrom = new Date(previousTo); previousFrom.setUTCDate(previousFrom.getUTCDate() - days + 1); return { from: previousFrom.toISOString().slice(0, 10), to: previousTo.toISOString().slice(0, 10) }; }
function validRange(from: string, to: string) { try { validateReportingRange(from, to); return true; } catch { return false; } }
function comparisonPercent(current: number | null | undefined, previous: number | null | undefined) { if (current == null || previous == null || previous === 0) return null; return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10; }

export function Dashboard({ onOpenReport, permissions }: DashboardProps) {
  const canViewExecutiveDashboard = permissions.includes("view_executive_dashboard");
  const canViewReports = permissions.includes("view_reports");
  const canViewSales = permissions.includes("view_invoices");
  const canViewPurchases = permissions.includes("view_shipments");
  const canViewExpenses = permissions.includes("view_expenses");
  const canViewFinance = permissions.includes("view_finance");
  const canViewCustomerLedger = permissions.includes("view_customer_ledger");
  const canViewSupplierLedger = permissions.includes("view_supplier_ledger");
  const canViewProfits = permissions.includes("view_profits");
  const canViewProducts = permissions.includes("view_products");
  const now = useMemo(() => new Date(), []); const today = isoDate(now);
  const [period, setPeriod] = useState<Period>("month"); const [from, setFrom] = useState(periodStart("month", now)); const [to, setTo] = useState(today); const [branchId, setBranchId] = useState<Id<"branches"> | "">(""); const [compare, setCompare] = useState(true); const [refreshedAt, setRefreshedAt] = useState(Date.now());
  const me = useQuery(api.employees.me); const branches = useQuery(api.executiveDashboard.availableBranches, canViewExecutiveDashboard ? {} : "skip") ?? []; const canSelectBranch = me?.role === "admin" || me?.role === "accountant"; const rangeIsValid = validRange(from, to);
  const reportArgs = rangeIsValid ? { from, to, branchId: canSelectBranch && branchId ? branchId : undefined } : null;
  const report = useQuery(api.executiveDashboard.overview, canViewExecutiveDashboard && reportArgs ? reportArgs : "skip") as ExecutiveOverview | undefined;
  const comparisonRange = rangeIsValid ? previousRange(from, to) : null;
  const previousReport = useQuery(api.executiveDashboard.overview, canViewExecutiveDashboard && compare && comparisonRange ? { ...comparisonRange, branchId: canSelectBranch && branchId ? branchId : undefined } : "skip") as ExecutiveOverview | undefined;
  const lowStockProducts = useQuery(api.products.list, canViewExecutiveDashboard && canViewProducts ? { lowStock: true } : "skip"); const { formatCurrency, formatAmount } = useCurrency();
  const changePeriod = (next: Period) => { setPeriod(next); if (next === "custom") return; setFrom(periodStart(next, new Date())); setTo(isoDate(new Date())); };
  const cards: DashboardCard[] = report ? [
    { key: "sales", title: "إجمالي المبيعات", value: report.sales?.netSales, comparisonValue: previousReport?.sales?.netSales, note: canViewSales ? `${formatAmount(report.sales?.invoiceCount ?? 0)} فاتورة بعد المرتجعات` : "تحتاج صلاحية عرض فواتير المبيعات", report: "sales", icon: ReceiptText, tone: "emerald", protected: !canViewSales },
    { key: "purchases", title: "إجمالي المشتريات", value: report.purchases?.landedPurchases, comparisonValue: previousReport?.purchases?.landedPurchases, note: canViewPurchases ? `${formatAmount(report.purchases?.receiptCount ?? 0)} مستند شراء` : "تحتاج صلاحية عرض المشتريات", report: "purchases", icon: ShoppingBag, tone: "blue", protected: !canViewPurchases },
    { key: "profit", title: "صافي الربح", value: report.profitability?.netProfit, comparisonValue: previousReport?.profitability?.netProfit, note: report.profitability?.complete ? `هامش ${formatAmount(report.profitability.netMargin ?? 0)}٪` : "تحتاج صلاحية الأرباح أو مراجعة التكاليف التاريخية", report: "profit", icon: TrendingUp, tone: "violet", protected: !canViewProfits },
    { key: "expenses", title: "إجمالي المصروفات", value: report.expenses?.totalExpenses, comparisonValue: previousReport?.expenses?.totalExpenses, note: canViewExpenses ? "مصروفات التشغيل ورسوم الشحن" : "تحتاج صلاحية عرض المصروفات", report: "treasury", icon: CircleDollarSign, tone: "rose", protected: !canViewExpenses },
    { key: "treasury", title: "أرصدة الخزائن", value: report.balances.liquidAccounts, note: canViewFinance ? "الخزائن النقدية والبنوك والحسابات" : "تحتاج صلاحية عرض الحسابات", report: "treasury", icon: Landmark, tone: "cyan", protected: !canViewFinance },
    { key: "customers", title: "مديونيات العملاء", value: report.balances.customerReceivables, note: canViewCustomerLedger ? "إجمالي الأرصدة المطلوب تحصيلها" : "تحتاج صلاحية حسابات العملاء", report: "customers", icon: Users, tone: "amber", protected: !canViewCustomerLedger },
    { key: "suppliers", title: "مستحقات الموردين", value: report.balances.supplierPayables, note: canViewSupplierLedger ? "إجمالي الالتزامات الحالية للموردين" : "تحتاج صلاحية حسابات الموردين", report: "suppliers", icon: Truck, tone: "orange", protected: !canViewSupplierLedger },
    { key: "inventory", title: "قيمة المخزون", value: report.balances.inventoryValue, note: canViewProducts ? `${formatAmount(lowStockProducts?.length ?? 0)} صنف تحت حد الطلب` : "تحتاج صلاحية عرض المخزون", report: "inventory", icon: Boxes, tone: "slate", protected: !canViewProfits || !canViewProducts },
  ] : [];
  return <div className="erp-dashboard-compact" data-refreshed-at={refreshedAt} data-testid="executive-dashboard">
    <section className="erp-dashboard-controls" aria-label="فلاتر اللوحة التنفيذية"><div className="erp-dashboard-title-block"><span className="erp-dashboard-title-icon" aria-hidden="true"><LayoutDashboard /></span><div className="min-w-0"><p className="erp-dashboard-breadcrumb">لوحة التحكم</p><h1 className="erp-page-title">اللوحة التنفيذية</h1><p className="erp-dashboard-subtitle">ملخص الأداء المالي والإداري</p></div></div><div className="erp-dashboard-filter-grid">
      <label className="erp-dashboard-filter erp-dashboard-filter--period"><span className="sr-only">الفترة</span><select className="form-input" value={period} onChange={(event) => changePeriod(event.target.value as Period)} aria-label="اختيار الفترة">{(Object.keys(periodLabels) as Period[]).map((value) => <option key={value} value={value}>{periodLabels[value]}</option>)}</select></label>
      {period === "custom" && <><input className="form-input erp-dashboard-filter erp-dashboard-date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="من تاريخ" /><input className="form-input erp-dashboard-filter erp-dashboard-date" type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="إلى تاريخ" /></>}
      <label className="erp-dashboard-filter erp-dashboard-filter--branch relative"><Building2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select className="form-input pr-9" value={branchId} onChange={(event) => setBranchId(event.target.value as Id<"branches"> | "")} disabled={!canSelectBranch} aria-label="اختيار الفرع"><option value="">{canSelectBranch ? "كل الفروع" : branches[0]?.name ?? "فرع المستخدم"}</option>{canSelectBranch && branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></label>
      <label className="erp-dashboard-compare"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} /><span>مقارنة بالفترة السابقة</span></label>
      <button type="button" className="erp-dashboard-refresh btn-secondary inline-flex items-center justify-center gap-2" onClick={() => setRefreshedAt(Date.now())} title="البيانات تتحدث لحظيًا"><RefreshCcw className="h-4 w-4" />تحديث البيانات</button>
    </div></section>
    {!rangeIsValid && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">اختر فترة صحيحة لا تتجاوز 366 يومًا لعرض مؤشرات اللوحة التنفيذية.</div>}
    {!canViewExecutiveDashboard && <div className="erp-empty-state mt-4">لا تملك صلاحية عرض لوحة التحكم التنفيذية.</div>}
    {canViewExecutiveDashboard && report === undefined && rangeIsValid && <div className="erp-dashboard-card-grid" aria-label="جارٍ تحميل المؤشرات">{Array.from({ length: 8 }, (_, index) => <div key={index} className="erp-dashboard-card-skeleton animate-pulse" />}</div>}
    {cards.length > 0 && <section className="erp-dashboard-card-grid" aria-label="المؤشرات التنفيذية الرئيسية">{cards.map((card) => { const Icon = card.icon; const change = card.protected ? null : compare ? comparisonPercent(card.value, card.comparisonValue) : null; const ChangeIcon = change !== null && change < 0 ? ArrowDownLeft : ArrowUpLeft; const displayValue = card.protected || card.value == null ? "غير متاح" : formatCurrency(card.value); const reportHint = canViewReports && !card.protected ? "فتح التقرير التفصيلي" : "التقرير التفصيلي غير متاح حسب الصلاحية"; return <button key={card.key} type="button" data-testid={`dashboard-card-${card.key}`} className={`erp-dashboard-card tone-${card.tone}`} onClick={() => { if (canViewReports && !card.protected) onOpenReport(card.report); }} disabled={!canViewReports || card.protected} aria-label={`${card.title}: ${displayValue}. ${reportHint}`}><div className="erp-dashboard-card-head"><div className="min-w-0 text-right"><p className="erp-metric-label">{card.title}</p><p className="erp-dashboard-card-value">{displayValue}</p></div><span className="erp-dashboard-card-icon"><Icon /></span></div><p className="erp-dashboard-card-note">{card.note}</p><div className={`erp-dashboard-card-status ${change === null ? "neutral" : change < 0 ? "down" : "up"}`}>{change !== null ? <><span className="erp-dashboard-status-label"><ChangeIcon />{change < 0 ? "أقل من الفترة السابقة" : "أعلى من الفترة السابقة"}</span><strong>{formatAmount(Math.abs(change))}٪</strong></> : <><span className="erp-dashboard-status-label"><PackageSearch />{reportHint}</span>{canViewReports && !card.protected && <ArrowUpLeft className="erp-dashboard-status-arrow" aria-hidden="true" />}</>}</div></button>; })}</section>}
  </div>;
}
