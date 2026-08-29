import { Fragment, useEffect, useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { useCurrency } from "../lib/utils";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Package,
  Printer,
  ReceiptText,
  Search,
  ShoppingCart,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ReportingOverview,
  ReportingSalesInvoice,
} from "../../shared/reportingView";

type Period = "today" | "week" | "month" | "year" | "custom";
export type ReportKind =
  | "overview"
  | "sales"
  | "purchases"
  | "profit"
  | "treasury"
  | "inventory"
  | "customers"
  | "suppliers";
type SalesView = "invoices" | "items" | "customers" | "days";
type BranchOption = { _id: Id<"branches">; name: string };
type SalesInvoice = ReportingSalesInvoice;

function customerKey(invoice: SalesInvoice) {
  return invoice.customerId ?? `walk-in:${invoice.branchId}:${invoice.customerName}`;
}

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

const reportOptions: Array<{
  id: ReportKind;
  title: string;
  icon: LucideIcon;
  profitOnly?: boolean;
}> = [
  { id: "sales", title: "تحليل المبيعات", icon: ShoppingCart },
  { id: "overview", title: "الحركة اليومية", icon: BarChart3 },
  { id: "purchases", title: "المشتريات", icon: ReceiptText },
  { id: "profit", title: "الأرباح والخسائر", icon: CircleDollarSign, profitOnly: true },
  { id: "treasury", title: "الخزينة والتحصيل", icon: WalletCards },
  { id: "inventory", title: "المخزون", icon: Package },
  { id: "customers", title: "العملاء", icon: Users },
  { id: "suppliers", title: "الموردون", icon: Truck },
];

const periodLabels: Record<Period, string> = {
  today: "اليوم",
  week: "آخر 7 أيام",
  month: "هذا الشهر",
  year: "هذه السنة",
  custom: "فترة مخصصة",
};

const paymentLabels: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  bank: "تحويل بنكي",
  transfer: "تحويل",
  instapay: "إنستاباي",
  vodafone_cash: "فودافون كاش",
  unpaid: "آجل",
};

const statusLabels: Record<string, string> = {
  paid: "مدفوعة",
  partial: "مدفوعة جزئيًا",
  unpaid: "غير مسددة",
  cancelled: "ملغاة",
  partial_return: "مرتجعة جزئيًا",
  paid_returned_partial: "مدفوعة ومرتجعة جزئيًا",
  returned: "مرتجعة بالكامل",
};

function statusClass(status: string) {
  if (status === "paid") return "badge-success";
  if (status === "cancelled") return "badge-danger";
  if (status === "returned") return "badge-info";
  return "badge-warning";
}

function SummaryReport({ kind, report }: { kind: ReportKind; report: ReportingOverview }) {
  const { formatCurrency, formatAmount } = useCurrency();
  const rows: Record<ReportKind, Array<[string, string]>> = {
    overview: [
      ["عدد فواتير البيع", formatAmount(report.sales.invoiceCount)],
      ["إجمالي المبيعات", formatCurrency(report.sales.grossSales)],
      ["مرتجعات المبيعات", formatCurrency(report.sales.salesReturns)],
      ["صافي المبيعات", formatCurrency(report.sales.netSales)],
      ["إجمالي التحصيل", formatCurrency(report.collections.collections)],
      ["المبالغ المستردة", formatCurrency(report.collections.refunds)],
      ["إجمالي المصروفات", formatCurrency(report.expenses.totalExpenses)],
      ["رصيد الخزائن والبنوك", formatCurrency(report.currentBalances.liquidAccounts)],
    ],
    sales: [],
    purchases: [
      ["عدد مستندات الشراء", formatAmount(report.purchases.receiptCount)],
      ["المشتريات الواصلة", formatCurrency(report.purchases.landedPurchases)],
      ["مرتجعات المشتريات", formatCurrency(report.purchases.supplierCredits)],
      ["مدفوعات الموردين", formatCurrency(report.purchases.supplierPayments)],
      ["المستحق للموردين", formatCurrency(report.currentBalances.supplierPayables)],
    ],
    profit: [
      ["صافي المبيعات", formatCurrency(report.sales.netSales)],
      ["تكلفة البضاعة", report.profitability?.cogs == null ? "غير مكتملة" : formatCurrency(report.profitability.cogs)],
      ["مجمل الربح", report.profitability?.grossProfit == null ? "غير مكتمل" : formatCurrency(report.profitability.grossProfit)],
      ["إجمالي المصروفات", formatCurrency(report.expenses.totalExpenses)],
      ["صافي الربح", report.profitability?.netProfit == null ? "غير مكتمل" : formatCurrency(report.profitability.netProfit)],
    ],
    treasury: [
      ["إجمالي التحصيلات", formatCurrency(report.collections.collections)],
      ["المبالغ المستردة", formatCurrency(report.collections.refunds)],
      ["صافي التحصيل", formatCurrency(report.collections.netCollections)],
      ["الخزائن والبنوك", formatCurrency(report.currentBalances.liquidAccounts)],
      ["قيد التحصيل لدى شركات الشحن", formatCurrency(report.cod.currentOutstanding)],
    ],
    inventory: [
      ["قيمة المخزون", report.currentBalances.inventoryValue !== undefined ? formatCurrency(report.currentBalances.inventoryValue) : "غير متاحة حسب الصلاحية"],
      ["المشتريات الواصلة", formatCurrency(report.purchases.landedPurchases)],
      ["قيمة المرتجعات للمورد", formatCurrency(report.purchases.returnedInventoryValue)],
      ["أصناف ناقصة التكلفة التاريخية", formatAmount(report.completeness.legacyInventoryValueProducts)],
    ],
    customers: [
      ["مستحقات العملاء", formatCurrency(report.currentBalances.customerReceivables)],
      ["مقدمات العملاء", formatCurrency(report.currentBalances.customerAdvances)],
      ["فواتير الفترة", formatAmount(report.sales.invoiceCount)],
      ["صافي التحصيل", formatCurrency(report.collections.netCollections)],
    ],
    suppliers: [
      ["مديونية الموردين", formatCurrency(report.currentBalances.supplierPayables)],
      ["مديونية الفترة", formatCurrency(report.purchases.supplierLiabilityCreated)],
      ["مدفوعات الموردين", formatCurrency(report.purchases.supplierPayments)],
      ["عدد مستندات الشراء", formatAmount(report.purchases.receiptCount)],
    ],
  };
  const title = reportOptions.find((option) => option.id === kind)?.title;
  return (
    <section className="erp-section" data-testid={`active-report-${kind}`}>
      <div className="erp-section-header">
        <div><p className="text-xs font-bold text-[var(--erp-accent-strong)]">نتيجة الفترة المحددة</p><h2 className="erp-section-title mt-1">{title}</h2></div>
        <button className="erp-action" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة التقرير</button>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="data-table min-w-[720px]">
          <thead><tr><th>البيان</th><th>القيمة</th></tr></thead>
          <tbody>{rows[kind].map(([label, value]) => <tr key={label}><td className="font-bold">{label}</td><td>{value}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function SalesDetailsTable({ invoices, salesView, canViewProfits }: { invoices: SalesInvoice[]; salesView: SalesView; canViewProfits: boolean }) {
  const { formatCurrency, formatAmount } = useCurrency();
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const salesInvoices = invoices.filter((invoice) => invoice.status !== "cancelled");
  const totals = salesInvoices.reduce(
    (result, invoice) => ({
      quantity: result.quantity + invoice.totalQuantity,
      total: result.total + invoice.total,
      credited: result.credited + invoice.creditedTotal,
      net: result.net + invoice.netTotal,
      paid: result.paid + invoice.paid,
      remaining: result.remaining + invoice.remaining,
    }),
    { quantity: 0, total: 0, credited: 0, net: 0, paid: 0, remaining: 0 },
  );
  const itemRows = salesInvoices.flatMap((invoice) => invoice.items.map((item) => ({ ...item, invoice })));
  const customerRows = [...salesInvoices.reduce((groups, invoice) => {
    const key = customerKey(invoice);
    const current = groups.get(key) ?? { customerKey: key, customerName: invoice.customerName, invoiceCount: 0, quantity: 0, net: 0, paid: 0, remaining: 0 };
    current.invoiceCount += 1;
    current.quantity += invoice.totalQuantity;
    current.net += invoice.netTotal;
    current.paid += invoice.paid;
    current.remaining += invoice.remaining;
    groups.set(key, current);
    return groups;
  }, new Map<string, { customerKey: string; customerName: string; invoiceCount: number; quantity: number; net: number; paid: number; remaining: number }>()).values()].sort((left, right) => right.net - left.net);
  const dayRows = [...salesInvoices.reduce((groups, invoice) => {
    const current = groups.get(invoice.date) ?? { date: invoice.date, invoiceCount: 0, quantity: 0, net: 0, paid: 0, remaining: 0 };
    current.invoiceCount += 1;
    current.quantity += invoice.totalQuantity;
    current.net += invoice.netTotal;
    current.paid += invoice.paid;
    current.remaining += invoice.remaining;
    groups.set(invoice.date, current);
    return groups;
  }, new Map<string, { date: string; invoiceCount: number; quantity: number; net: number; paid: number; remaining: number }>()).values()].sort((left, right) => right.date.localeCompare(left.date));

  if (invoices.length === 0) return <div className="erp-empty-state m-3 py-16">لا توجد فواتير مطابقة للفترة والفلاتر المحددة.</div>;

  if (salesView === "items") {
    return (
      <div className="overflow-x-auto"><table className="data-table min-w-[1120px]">
        <thead><tr><th>التاريخ</th><th>رقم الفاتورة</th><th>العميل</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الإجمالي</th>{canViewProfits && <><th>التكلفة</th><th>الربح</th></>}</tr></thead>
        <tbody>{itemRows.map((row, index) => <tr key={`${row.invoice._id}-${row.productId}-${index}`}><td>{row.invoice.date}</td><td className="font-mono font-bold">{row.invoice.invoiceNumber}</td><td>{row.invoice.customerName}</td><td className="font-bold">{row.productName}</td><td>{formatAmount(row.quantity)}</td><td>{formatCurrency(row.unitPrice)}</td><td>{formatAmount(row.discount)}٪</td><td className="font-bold">{formatCurrency(row.total)}</td>{canViewProfits && <><td>{row.costTotal === undefined ? "—" : formatCurrency(row.costTotal)}</td><td>{row.grossProfit === undefined ? "—" : formatCurrency(row.grossProfit)}</td></>}</tr>)}</tbody>
      </table></div>
    );
  }

  if (salesView === "customers" || salesView === "days") {
    const rows = salesView === "customers" ? customerRows : dayRows;
    return (
      <div className="overflow-x-auto"><table className="data-table min-w-[860px]">
        <thead><tr><th>{salesView === "customers" ? "العميل" : "اليوم"}</th><th>عدد الفواتير</th><th>الكمية</th><th>صافي المبيعات</th><th>المحصل</th><th>المتبقي</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={"customerKey" in row ? row.customerKey : row.date}><td className="font-bold">{"customerName" in row ? row.customerName : row.date}</td><td>{formatAmount(row.invoiceCount)}</td><td>{formatAmount(row.quantity)}</td><td className="font-bold">{formatCurrency(row.net)}</td><td>{formatCurrency(row.paid)}</td><td>{formatCurrency(row.remaining)}</td></tr>)}</tbody>
      </table></div>
    );
  }

  return (
    <div className="overflow-x-auto"><table className="data-table min-w-[1280px]" data-testid="sales-detail-invoices">
      <thead><tr><th className="w-10" /><th>التاريخ</th><th>رقم الفاتورة</th><th>الفرع</th><th>العميل</th><th>الأصناف</th><th>الكمية</th><th>الإجمالي</th><th>المرتجع</th><th>الصافي</th><th>المحصل</th><th>المتبقي</th><th>الدفع</th><th>الحالة</th></tr></thead>
      <tbody>{invoices.map((invoice) => {
        const expanded = expandedInvoiceId === invoice._id;
        return <Fragment key={invoice._id}>
          <tr className="report-invoice-row cursor-pointer" onClick={() => setExpandedInvoiceId(expanded ? null : invoice._id)} aria-expanded={expanded}>
            <td><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} /></td><td>{invoice.date}</td><td className="font-mono font-black text-[var(--erp-accent-strong)]">{invoice.invoiceNumber}</td><td>{invoice.branchName}</td><td><strong>{invoice.customerName}</strong>{invoice.customerPhone && <small className="block text-slate-400">{invoice.customerPhone}</small>}</td><td>{formatAmount(invoice.itemCount)}</td><td>{formatAmount(invoice.totalQuantity)}</td><td>{formatCurrency(invoice.total)}</td><td>{formatCurrency(invoice.creditedTotal)}</td><td className="font-black">{formatCurrency(invoice.netTotal)}</td><td className="text-emerald-700">{formatCurrency(invoice.paid)}</td><td className="text-amber-700">{formatCurrency(invoice.remaining)}</td><td>{paymentLabels[invoice.paymentMethod] ?? invoice.paymentMethod}</td><td><span className={`badge ${statusClass(invoice.status)}`}>{statusLabels[invoice.status] ?? invoice.status}</span></td>
          </tr>
          {expanded && <tr className="report-invoice-items-row"><td colSpan={14}><div className="m-2 border border-slate-200 bg-white p-2"><div className="mb-2 flex items-center justify-between"><strong>أصناف الفاتورة {invoice.invoiceNumber}</strong><span className="text-xs text-slate-500">اضغط على الفاتورة مرة أخرى للإغلاق</span></div><table className="data-table"><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الإجمالي</th>{canViewProfits && <><th>التكلفة</th><th>الربح</th></>}</tr></thead><tbody>{invoice.items.map((item, index) => <tr key={`${item.productId}-${index}`}><td>{formatAmount(index + 1)}</td><td className="font-bold">{item.productName}</td><td>{formatAmount(item.quantity)}</td><td>{formatCurrency(item.unitPrice)}</td><td>{formatAmount(item.discount)}٪</td><td>{formatCurrency(item.total)}</td>{canViewProfits && <><td>{item.costTotal === undefined ? "—" : formatCurrency(item.costTotal)}</td><td>{item.grossProfit === undefined ? "—" : formatCurrency(item.grossProfit)}</td></>}</tr>)}</tbody></table></div></td></tr>}
        </Fragment>;
      })}</tbody>
      <tfoot><tr><th colSpan={5}>الإجمالي المحتسب — دون الفواتير الملغاة</th><th>{formatAmount(salesInvoices.reduce((sum, invoice) => sum + invoice.itemCount, 0))}</th><th>{formatAmount(totals.quantity)}</th><th>{formatCurrency(totals.total)}</th><th>{formatCurrency(totals.credited)}</th><th>{formatCurrency(totals.net)}</th><th>{formatCurrency(totals.paid)}</th><th>{formatCurrency(totals.remaining)}</th><th colSpan={2}>{formatAmount(salesInvoices.length)} فاتورة</th></tr></tfoot>
    </table></div>
  );
}

export function ReportsPage({ initialReport }: { initialReport?: ReportKind }) {
  const canViewReports = usePermission("view_reports");
  const canViewInvoices = usePermission("view_invoices");
  const canViewProfits = usePermission("view_profits");
  const now = new Date();
  const today = isoDate(now);
  const [activeReport, setActiveReport] = useState<ReportKind>(initialReport ?? "sales");
  useEffect(() => { if (initialReport) setActiveReport(initialReport); }, [initialReport]);
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(startOfPeriod("month", now));
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState<Id<"branches"> | "">("");
  const [salesView, setSalesView] = useState<SalesView>("invoices");
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const me = useQuery(api.employees.me);
  const branchesQuery = useQuery(api.reporting.availableBranches, canViewReports ? {} : "skip");
  const branches = (branchesQuery ?? []) as BranchOption[];
  const canSelectBranch = me?.role === "admin" || me?.role === "accountant";
  const validationMessage = rangeError(from, to);
  const reportArgs = !validationMessage ? { from, to, branchId: canSelectBranch && branchId ? branchId : undefined } : null;
  const report = useQuery(api.reporting.overview, canViewReports && activeReport !== "sales" && reportArgs ? reportArgs : "skip") as ReportingOverview | undefined;
  const requiresSalesBranch = activeReport === "sales" && canSelectBranch && !branchId;
  const salesReportArgs = reportArgs && !requiresSalesBranch
    ? { from, to, branchId: canSelectBranch ? branchId as Id<"branches"> : undefined }
    : null;
  const salesDetails = usePaginatedQuery(
    api.reporting.salesDetails,
    canViewReports && canViewInvoices && activeReport === "sales" && salesReportArgs ? salesReportArgs : "skip",
    { initialNumItems: 50 },
  );

  const salesInvoices = salesDetails.results as ReportingSalesInvoice[];
  const customerOptions = useMemo(() => [...new Map(salesInvoices.map((invoice) => [customerKey(invoice), invoice.customerName])).entries()].sort((left, right) => left[1].localeCompare(right[1])), [salesInvoices]);
  const productOptions = useMemo(() => [...new Set(salesInvoices.flatMap((invoice) => invoice.items.map((item) => item.productName)))].sort(), [salesInvoices]);
  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    return salesInvoices.filter((invoice) =>
      (!term || invoice.invoiceNumber.toLowerCase().includes(term) || invoice.customerName.toLowerCase().includes(term) || invoice.items.some((item) => item.productName.toLowerCase().includes(term))) &&
      (!customerFilter || customerKey(invoice) === customerFilter) &&
      (!productFilter || invoice.items.some((item) => item.productName === productFilter)) &&
      (!paymentFilter || invoice.paymentMethod === paymentFilter) &&
      (!statusFilter || invoice.status === statusFilter),
    );
  }, [customerFilter, paymentFilter, productFilter, salesInvoices, search, statusFilter]);

  const changePeriod = (next: Period) => {
    setPeriod(next);
    if (next === "custom") return;
    setFrom(startOfPeriod(next, new Date()));
    setTo(isoDate(new Date()));
  };

  if (!canViewReports) return <div className="p-6"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">لا تملك صلاحية عرض التقارير.</div></div>;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <header className="erp-page-header">
        <div><span className="erp-kicker">تقارير تفصيلية من المستندات الفعلية</span><h1 className="erp-page-title"><BarChart3 className="h-6 w-6 text-[var(--erp-accent)]" />مركز التقارير</h1><p className="erp-page-subtitle">حدد الفترة والفلاتر، ثم افتح أي فاتورة لمراجعة أصنافها.</p></div>
        <button className="erp-action" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة التقرير</button>
      </header>

      <section className="erp-section" aria-label="أنواع التقارير"><div className="report-type-tabs">{reportOptions.filter((option) => !option.profitOnly || canViewProfits).map((option) => { const Icon = option.icon; return <button key={option.id} data-testid={`report-option-${option.id}`} onClick={() => setActiveReport(option.id)} className={activeReport === option.id ? "active" : ""}><Icon className="h-4 w-4" />{option.title}</button>; })}</div></section>

      <section className="erp-section report-filter-panel">
        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
          <label><span className="form-label flex items-center gap-1"><CalendarDays className="h-4 w-4" />الفترة</span><select className="form-input" value={period} onChange={(event) => changePeriod(event.target.value as Period)}>{(Object.keys(periodLabels) as Period[]).map((value) => <option key={value} value={value}>{periodLabels[value]}</option>)}</select></label>
          <label><span className="form-label">من تاريخ</span><input className="form-input" type="date" value={from} onChange={(event) => { setPeriod("custom"); setFrom(event.target.value); }} /></label>
          <label><span className="form-label">إلى تاريخ</span><input className="form-input" type="date" value={to} onChange={(event) => { setPeriod("custom"); setTo(event.target.value); }} /></label>
          <label><span className="form-label flex items-center gap-1"><Building2 className="h-4 w-4" />الفرع</span>{canSelectBranch ? <select className="form-input" value={branchId} onChange={(event) => setBranchId(event.target.value as Id<"branches"> | "")}><option value="">{activeReport === "sales" ? "اختر فرع التقرير" : "كل الفروع — مجمع"}</option>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select> : <span className="form-input block">{branches[0]?.name ?? "فرع المستخدم"}</span>}</label>
        </div>

        {activeReport === "sales" && <div className="grid gap-3 border-t border-slate-200 p-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative xl:col-span-2"><span className="form-label">بحث داخل التقرير</span><Search className="absolute right-3 top-10 h-4 w-4 text-slate-400" /><input className="form-input pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم الفاتورة أو العميل أو الصنف" /></label>
          <label><span className="form-label">العميل</span><select className="form-input" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}><option value="">كل العملاء</option>{customerOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label><span className="form-label">الصنف</span><select className="form-input" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="">كل الأصناف</option>{productOptions.map((product) => <option key={product} value={product}>{product}</option>)}</select></label>
          <label><span className="form-label">طريقة الدفع</span><select className="form-input" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="">كل طرق الدفع</option>{[...new Set(salesInvoices.map((invoice) => invoice.paymentMethod))].map((value) => <option key={value} value={value}>{paymentLabels[value] ?? value}</option>)}</select></label>
          <label><span className="form-label">الحالة</span><select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">كل الحالات</option>{[...new Set(salesInvoices.map((invoice) => invoice.status))].map((value) => <option key={value} value={value}>{statusLabels[value] ?? value}</option>)}</select></label>
          <button data-testid="report-apply-filters" className="btn-primary self-end xl:col-span-4" disabled={Boolean(validationMessage) || requiresSalesBranch || !canViewInvoices} onClick={() => document.getElementById("report-output")?.scrollIntoView({ behavior: "smooth", block: "start" })}>عرض التقرير بالفلاتر المحددة</button>
        </div>}
      </section>

      {validationMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{validationMessage}</div>}

      {!validationMessage && activeReport === "sales" && <section id="report-output" className="erp-section" data-testid="active-report-sales">
        <div className="erp-section-header"><div><p className="text-xs font-bold text-[var(--erp-accent-strong)]">من {from} إلى {to}</p><h2 className="erp-section-title mt-1">تقرير تحليل المبيعات</h2></div><span className="erp-status">أساس التاريخ: تاريخ العملية</span></div>
        <div className="sales-report-view-tabs">{([["invoices", "الفواتير"], ["items", "الأصناف"], ["customers", "العملاء"], ["days", "الأيام"]] as Array<[SalesView, string]>).map(([value, label]) => <button key={value} className={salesView === value ? "active" : ""} onClick={() => setSalesView(value)}>{label}</button>)}</div>
        {!canViewInvoices ? <div className="erp-empty-state m-3 py-16">تحتاج صلاحية عرض فواتير المبيعات لفتح التقرير التفصيلي.</div> : requiresSalesBranch ? <div className="erp-empty-state m-3 py-16">اختر فرعًا واحدًا لعرض فواتير المبيعات التفصيلية.</div> : salesDetails.status === "LoadingFirstPage" ? <div className="h-72 animate-pulse bg-slate-100" /> : <><SalesDetailsTable invoices={filteredInvoices} salesView={salesView} canViewProfits={canViewProfits} />{(salesDetails.status === "CanLoadMore" || salesDetails.status === "LoadingMore") && <div className="border-t border-slate-200 p-3 text-center"><button className="btn-secondary" disabled={salesDetails.status === "LoadingMore"} onClick={() => salesDetails.loadMore(50)}>{salesDetails.status === "LoadingMore" ? "جارٍ تحميل المزيد…" : "تحميل المزيد من الفواتير"}</button><p className="mt-2 text-xs text-slate-400">البحث والتجميع يطبقان على النتائج المحمّلة حاليًا.</p></div>}</>}
      </section>}

      {!validationMessage && activeReport !== "sales" && report === undefined && <div className="h-72 animate-pulse rounded-xl bg-slate-100" />}
      {report && activeReport !== "sales" && <div id="report-output" className="space-y-4"><SummaryReport kind={activeReport} report={report} />{canViewProfits && !report.completeness.profitabilityAvailable && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-bold">الربحية غير مكتملة لهذه الفترة</p><p className="mt-1 text-sm">لن يعرض النظام ربحًا تقديريًا عند نقص تكلفة البضاعة التاريخية.</p></div></div>}</div>}
    </div>
  );
}
