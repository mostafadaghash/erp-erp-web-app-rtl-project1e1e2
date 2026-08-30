import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { useCurrency } from "../lib/utils";
import { toast } from "sonner";
import { Eye, Pencil, Plus, Printer, RotateCcw, Search, X } from "lucide-react";
import { SalesReturnEditDialog } from "./SalesReturnEditDialog";

type EligibleInvoice = NonNullable<ReturnType<typeof useQuery<typeof api.salesReturns.eligibleInvoices>>>[number];
type SalesReturnNote = NonNullable<ReturnType<typeof useQuery<typeof api.salesReturns.list>>>[number];
type ReturnDateFilter = "today" | "7days" | "month" | "custom" | "all";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function returnMatchesDateFilter(
  value: string,
  filter: ReturnDateFilter,
  customFrom: string,
  customTo: string,
) {
  if (filter === "all") return true;

  const now = new Date();
  const today = toDateInputValue(now);
  let from = "";
  let to = today;

  if (filter === "today") {
    from = today;
  } else if (filter === "7days") {
    from = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  } else if (filter === "month") {
    from = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  } else {
    from = customFrom;
    to = customTo;
    if (from && to && from > to) return false;
  }

  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function SalesReturnsPanel() {
  const canView = usePermission("view_sales_returns");
  const canCreate = usePermission("create_sales_returns");
  const canPrint = usePermission("print_credit_notes");
  const canRefund = usePermission("refund_collections");
  const canReverse = usePermission("reverse_financial_transactions");
  const notes = useQuery(api.salesReturns.list, canView ? {} : "skip");
  const eligible = useQuery(api.salesReturns.eligibleInvoices, canCreate ? {} : "skip") ?? [];
  const accounts = useQuery(api.finance.collectionAccountPicker, canCreate && canRefund ? {} : "skip") ?? [];
  const createReturn = useMutation(api.salesReturns.create);
  const reverseReturn = useMutation(api.salesReturns.reverse);
  const { formatCurrency, formatAmount } = useCurrency();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [dateFilter, setDateFilter] = useState<ReturnDateFilter>("month");
  const [customFrom, setCustomFrom] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [selectedNote, setSelectedNote] = useState<SalesReturnNote | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [eligibleSearch, setEligibleSearch] = useState("");

  const [invoice, setInvoice] = useState<EligibleInvoice | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<Id<"financialAccounts"> | "">("");
  const [busy, setBusy] = useState(false);
  const [printId, setPrintId] = useState<Id<"salesReturns"> | null>(null);
  const [reverseId, setReverseId] = useState<Id<"salesReturns"> | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseDate, setReverseDate] = useState(new Date().toISOString().slice(0, 10));
  const [editNote, setEditNote] = useState<SalesReturnNote | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const reversalRequestId = useRef(crypto.randomUUID());
  const printable = useQuery(api.salesReturns.getForPrint, canPrint && printId ? { id: printId } : "skip");

  const preview = useMemo(
    () => !invoice ? 0 : invoice.items.reduce(
      (sum, item) => sum + item.lineNetTotal * (quantities[String(item.productId)] ?? 0) / item.originalQuantity,
      0,
    ),
    [invoice, quantities],
  );
  const debtReduction = Math.min(invoice?.remaining ?? 0, preview);
  const cashRefund = Math.max(0, preview - debtReduction);

  const customRangeInvalid = dateFilter === "custom" && Boolean(customFrom && customTo && customFrom > customTo);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredNotes = (notes ?? [])
    .filter((note) => !normalizedSearch || [note.creditNoteNumber, note.invoiceNumber, note.customerName, note.reason]
      .some((value) => value.toLowerCase().includes(normalizedSearch)))
    .filter((note) => !filterStatus || note.status === filterStatus)
    .filter((note) => returnMatchesDateFilter(note.date, dateFilter, customFrom, customTo));

  const normalizedEligibleSearch = eligibleSearch.trim().toLowerCase();
  const filteredEligible = eligible.filter((value) => !normalizedEligibleSearch ||
    value.invoiceNumber.toLowerCase().includes(normalizedEligibleSearch) ||
    value.customerName.toLowerCase().includes(normalizedEligibleSearch));

  const start = (value: EligibleInvoice) => {
    setChooserOpen(false);
    setInvoice(value);
    setQuantities({});
    setReason("");
    setDate(new Date().toISOString().slice(0, 10));
    setAccountId("");
    requestId.current = crypto.randomUUID();
  };

  const openNewReturn = () => {
    setEligibleSearch("");
    setChooserOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invoice || busy) return;
    setBusy(true);
    try {
      await createReturn({
        invoiceId: invoice.invoiceId,
        items: invoice.items
          .map((item) => ({ productId: item.productId, quantity: quantities[String(item.productId)] ?? 0 }))
          .filter((item) => item.quantity > 0),
        reason,
        date,
        requestId: requestId.current,
        accountId: accountId || undefined,
      });
      toast.success("تم إنشاء مرتجع البيع وإعادة المخزون");
      setInvoice(null);
      requestId.current = crypto.randomUUID();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إنشاء المرتجع"));
    } finally {
      setBusy(false);
    }
  };

  const submitReverse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reverseId || busy || !reverseReason.trim()) return;
    setBusy(true);
    try {
      await reverseReturn({
        id: reverseId,
        reason: reverseReason.trim(),
        date: reverseDate,
        requestId: reversalRequestId.current,
      });
      toast.success("تم عكس الإشعار الدائن");
      setReverseId(null);
      setSelectedNote(null);
      reversalRequestId.current = crypto.randomUUID();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر عكس الإشعار"));
    } finally {
      setBusy(false);
    }
  };

  const beginReverse = (note: SalesReturnNote) => {
    setReverseId(note._id);
    setReverseReason("");
    setReverseDate(new Date().toISOString().slice(0, 10));
    reversalRequestId.current = crypto.randomUUID();
  };

  if (!canView && !canCreate) return null;

  return (
    <section className="space-y-4" dir="rtl" data-testid="sales-returns-workspace">
      <div className="erp-page-header">
        <div>
          <span className="erp-kicker">سجل الإشعارات الدائنة والمرتجعات</span>
          <h2 className="erp-page-title">
            <RotateCcw className="h-6 w-6 text-[var(--erp-accent)]" />
            إدارة مرتجعات البيع
          </h2>
          <p className="erp-page-subtitle">{formatAmount(filteredNotes.length)} مرتجع مطابق للفلاتر</p>
        </div>
        {canCreate && (
          <button type="button" data-testid="sales-return-new" onClick={openNewReturn} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            مرتجع بيع جديد
          </button>
        )}
      </div>

      <div className="erp-toolbar flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="sales-return-search"
            className="form-input w-full pl-10"
            placeholder="بحث برقم المرتجع أو الفاتورة أو اسم العميل..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          data-testid="sales-return-date-filter"
          className="form-input lg:w-44"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value as ReturnDateFilter)}
          aria-label="فترة مرتجعات المبيعات"
        >
          <option value="today">اليوم</option>
          <option value="7days">آخر 7 أيام</option>
          <option value="month">هذا الشهر</option>
          <option value="custom">فترة مخصصة</option>
          <option value="all">كل الفترات</option>
        </select>

        <select
          data-testid="sales-return-status-filter"
          className="form-input lg:w-40"
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value)}
        >
          <option value="">كل الحالات</option>
          <option value="posted">مكتمل</option>
          <option value="reversed">معكوس</option>
        </select>

        {dateFilter === "custom" && (
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap">
            <label className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-slate-500">
              من
              <input
                data-testid="sales-return-date-from"
                className="form-input h-10 w-[150px] py-1.5 text-xs"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-slate-500">
              إلى
              <input
                data-testid="sales-return-date-to"
                className="form-input h-10 w-[150px] py-1.5 text-xs"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {customRangeInvalid && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
          تاريخ البداية يجب ألا يكون بعد تاريخ النهاية.
        </div>
      )}

      <div className="erp-section">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1050px]">
            <thead>
              <tr>
                <th>رقم المرتجع</th>
                <th>الفاتورة الأصلية</th>
                <th>العميل</th>
                <th>التاريخ</th>
                <th>إجمالي المرتجع</th>
                <th>خفض المديونية</th>
                <th>رد نقدي</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {notes === undefined && canView ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">جارٍ تحميل المرتجعات...</td></tr>
              ) : filteredNotes.map((note) => (
                <tr
                  key={note._id}
                  data-testid="sales-return-row"
                  data-credit-note-number={note.creditNoteNumber}
                  className="invoice-row-compact cursor-pointer"
                  tabIndex={0}
                  aria-label={`فتح المرتجع ${note.creditNoteNumber}`}
                  onClick={() => setSelectedNote(note)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedNote(note);
                    }
                  }}
                >
                  <td className="font-mono text-xs font-black text-[var(--erp-accent-strong)]">{note.creditNoteNumber}</td>
                  <td className="font-mono text-xs font-bold text-slate-700">{note.invoiceNumber}</td>
                  <td className="font-medium text-slate-800">{note.customerName}</td>
                  <td className="text-xs text-slate-500">{note.date}</td>
                  <td className="font-black">{formatCurrency(note.totalCredit)}</td>
                  <td className="font-bold text-amber-700">{formatCurrency(note.debtReduction)}</td>
                  <td className="font-bold text-emerald-700">{formatCurrency(note.cashRefund)}</td>
                  <td>
                    <span className={`badge ${note.status === "reversed" ? "badge-danger" : "badge-success"}`}>
                      {note.status === "reversed" ? "معكوس" : "مكتمل"}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="erp-action erp-action-primary" onClick={() => setSelectedNote(note)} title="فتح المرتجع">
                        <Eye className="h-4 w-4" /> فتح
                      </button>
                      {canPrint && (
                        <button type="button" aria-label="طباعة إشعار دائن" onClick={() => setPrintId(note._id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600" title="طباعة">
                          <Printer className="h-4 w-4" />
                        </button>
                      )}
                      {canCreate && note.status === "posted" && (
                        <button
                          type="button"
                          data-testid="sales-return-edit-open"
                          onClick={() => setEditNote(note)}
                          className="rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                          title="تعديل الكمية أو قيمة المرتجع"
                        >
                          <Pencil className="ml-1 inline h-4 w-4" />تعديل
                        </button>
                      )}
                      {canCreate && canReverse && note.status === "posted" && (
                        <button type="button" onClick={() => beginReverse(note)} className="rounded-lg bg-red-50 px-2 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">
                          عكس
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {notes !== undefined && filteredNotes.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RotateCcw className="mx-auto mb-2 h-10 w-10 opacity-30" />
                    {customRangeInvalid ? "راجع الفترة الزمنية المحددة" : "لا توجد مرتجعات مطابقة للفلاتر"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {chooserOpen && canCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" data-testid="sales-return-invoice-picker">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold text-[var(--erp-accent-strong)]">إنشاء مرتجع بيع جديد</p>
                <h3 className="mt-1 text-xl font-black text-slate-900">اختر الفاتورة الأصلية</h3>
                <p className="mt-1 text-xs text-slate-500">تظهر فقط الفواتير المؤهلة التي تحتوي على أصناف قابلة للإرجاع.</p>
              </div>
              <button type="button" onClick={() => setChooserOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="إغلاق"><X className="h-5 w-5" /></button>
            </header>
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="form-input w-full pl-10" placeholder="بحث برقم الفاتورة أو اسم العميل..." value={eligibleSearch} onChange={(event) => setEligibleSearch(event.target.value)} autoFocus />
              </div>
              <div className="max-h-[58vh] overflow-auto rounded-xl border border-slate-200">
                <table className="data-table min-w-[680px]">
                  <thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الأصناف المتاحة</th><th></th></tr></thead>
                  <tbody>
                    {filteredEligible.map((value) => (
                      <tr key={value.invoiceId}>
                        <td className="font-mono text-xs font-black">{value.invoiceNumber}</td>
                        <td className="font-bold">{value.customerName}</td>
                        <td>{formatCurrency(value.netTotal)}</td>
                        <td className="text-emerald-700">{formatCurrency(value.paid)}</td>
                        <td className="text-amber-700">{formatCurrency(value.remaining)}</td>
                        <td>{formatAmount(value.items.length)}</td>
                        <td>
                          <button key={value.invoiceId} data-testid="sales-return-start" data-invoice-number={value.invoiceNumber} type="button" onClick={() => start(value)} className="btn-primary whitespace-nowrap px-3 py-2 text-xs">
                            اختيار الفاتورة
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredEligible.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">لا توجد فواتير مؤهلة مطابقة للبحث.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" data-testid="sales-return-details-modal">
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[var(--erp-navy)] px-5 py-4 text-white">
              <div>
                <p className="text-xs font-bold text-emerald-200">مرتجع بيع محفوظ</p>
                <h3 className="mt-1 text-xl font-black">{selectedNote.creditNoteNumber}</h3>
                <p className="mt-1 text-xs text-slate-300">الفاتورة الأصلية {selectedNote.invoiceNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                {canCreate && selectedNote.status === "posted" && <button type="button" onClick={() => setEditNote(selectedNote)} className="rounded-lg border border-white/15 bg-emerald-500/20 px-3 py-2 text-xs font-black text-emerald-50 hover:bg-emerald-500/30"><Pencil className="ml-1 inline h-4 w-4" />تعديل</button>}
                {canPrint && <button type="button" onClick={() => setPrintId(selectedNote._id)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-black hover:bg-white/15"><Printer className="ml-1 inline h-4 w-4" />طباعة</button>}
                <button type="button" onClick={() => setSelectedNote(null)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 hover:bg-white/15" aria-label="إغلاق التفاصيل"><X className="h-5 w-5" /></button>
              </div>
            </header>
            <div className="overflow-y-auto p-5">
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">العميل</p><p className="mt-1 font-black text-slate-800">{selectedNote.customerName}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">تاريخ المرتجع</p><p className="mt-1 font-black text-slate-800">{selectedNote.date}</p></div>
                <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs text-indigo-700">إجمالي المرتجع</p><p className="mt-1 text-lg font-black text-indigo-800">{formatCurrency(selectedNote.totalCredit)}</p></div>
                <div className={`rounded-xl p-3 ${selectedNote.status === "reversed" ? "bg-red-50" : "bg-emerald-50"}`}><p className={`text-xs ${selectedNote.status === "reversed" ? "text-red-700" : "text-emerald-700"}`}>الحالة</p><p className={`mt-1 text-lg font-black ${selectedNote.status === "reversed" ? "text-red-800" : "text-emerald-800"}`}>{selectedNote.status === "reversed" ? "معكوس" : "مكتمل"}</p></div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="data-table min-w-[680px]">
                  <thead><tr><th>#</th><th>الصنف</th><th>الكمية المرتجعة</th><th>سعر الوحدة</th><th>قيمة الائتمان</th></tr></thead>
                  <tbody>
                    {selectedNote.items.map((item, index) => (
                      <tr key={`${String(item.productId)}-${index}`}>
                        <td>{formatAmount(index + 1)}</td>
                        <td className="font-bold">{item.productName}</td>
                        <td>{formatAmount(item.quantityReturned)}</td>
                        <td>{formatCurrency(item.unitPrice)}</td>
                        <td className="font-black">{formatCurrency(item.creditAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="font-black text-slate-800">سبب المرتجع والملاحظات</h4>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{selectedNote.reason}</p>
                  {selectedNote.status === "reversed" && selectedNote.reversalReason && (
                    <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"><strong>سبب العكس:</strong> {selectedNote.reversalReason}</div>
                  )}
                </div>
                <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between"><dt>إجمالي الائتمان</dt><dd className="font-black">{formatCurrency(selectedNote.totalCredit)}</dd></div>
                  <div className="flex justify-between"><dt>خفض المديونية</dt><dd className="font-bold text-amber-700">{formatCurrency(selectedNote.debtReduction)}</dd></div>
                  <div className="flex justify-between"><dt>رد نقدي</dt><dd className="font-bold text-emerald-700">{formatCurrency(selectedNote.cashRefund)}</dd></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2"><dt>عدد الأصناف</dt><dd className="font-bold">{formatAmount(selectedNote.items.length)}</dd></div>
                </dl>
              </div>

              {canCreate && canReverse && selectedNote.status === "posted" && (
                <div className="mt-4 flex justify-end"><button type="button" onClick={() => beginReverse(selectedNote)} className="rounded-lg bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100">عكس المرتجع</button></div>
              )}
            </div>
          </div>
        </div>
      )}

      {invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true">
          <form data-testid="sales-return-form" onSubmit={submit} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div><p className="text-xs font-bold text-[var(--erp-accent-strong)]">مرتجع بيع جديد</p><h3 className="mt-1 text-xl font-black text-slate-900">الفاتورة {invoice.invoiceNumber}</h3><p className="mt-1 text-xs text-slate-500">{invoice.customerName}</p></div>
              <button type="button" disabled={busy} onClick={() => setInvoice(null)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="إغلاق"><X className="h-5 w-5" /></button>
            </header>
            <div className="p-5">
              <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="data-table min-w-[760px]">
                  <thead><tr><th>الصنف</th><th>الكمية الأصلية</th><th>مرتجع سابق</th><th>المتاح</th><th>كمية الإرجاع</th></tr></thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={String(item.productId)}>
                        <td className="font-bold">{item.productName}</td>
                        <td>{formatAmount(item.originalQuantity)}</td>
                        <td>{formatAmount(item.returnedQuantity)}</td>
                        <td className="font-bold text-emerald-700">{formatAmount(item.availableQuantity)}</td>
                        <td><input aria-label={`كمية إرجاع ${item.productName}`} className="form-input h-10 w-28" type="number" min="0" max={item.availableQuantity} step="1" value={quantities[String(item.productId)] ?? 0} onChange={(event) => setQuantities((value) => ({ ...value, [String(item.productId)]: Math.min(item.availableQuantity, Math.max(0, Number(event.target.value))) }))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div><label className="form-label">سبب المرتجع *</label><textarea data-testid="sales-return-reason" className="form-input min-h-24" required value={reason} onChange={(event) => setReason(event.target.value)} /></div>
                <div className="space-y-3"><div><label className="form-label">تاريخ العملية</label><input className="form-input" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div>{cashRefund > 0 && <div><label className="form-label">حساب الاسترداد</label><select required className="form-input" value={accountId} onChange={(event) => setAccountId(event.target.value as Id<"financialAccounts">)}><option value="">اختر حساب الاسترداد</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select></div>}</div>
              </div>

              <div className="my-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs text-indigo-700">إجمالي الائتمان</p><p className="mt-1 text-lg font-black text-indigo-800">{formatCurrency(preview)}</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">خفض المديونية</p><p className="mt-1 text-lg font-black text-amber-800">{formatCurrency(debtReduction)}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">رد نقدي</p><p className="mt-1 text-lg font-black text-emerald-800">{formatCurrency(cashRefund)}</p></div>
              </div>

              <div className="flex gap-3"><button data-testid="sales-return-submit" disabled={busy || !reason.trim() || preview <= 0} className="btn-primary flex-1">{busy ? "جارٍ التنفيذ..." : "حفظ مرتجع البيع"}</button><button type="button" disabled={busy} className="btn-secondary" onClick={() => setInvoice(null)}>إلغاء</button></div>
            </div>
          </form>
        </div>
      )}

      {reverseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={submitReverse} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black">عكس مرتجع البيع</h3>
            <p className="my-3 rounded bg-red-50 p-3 text-sm text-red-700">سيتم عكس المخزون والفاتورة والعميل والحساب المالي.</p>
            <textarea required className="form-input" placeholder="سبب العكس" value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} />
            <input required type="date" className="form-input mt-3" value={reverseDate} onChange={(event) => setReverseDate(event.target.value)} />
            <div className="mt-4 flex gap-2"><button disabled={busy || !reverseReason.trim()} className="btn-primary flex-1">{busy ? "جارٍ العكس..." : "تأكيد العكس"}</button><button type="button" disabled={busy} className="btn-secondary" onClick={() => setReverseId(null)}>إلغاء</button></div>
          </form>
        </div>
      )}

      {editNote && (
        <SalesReturnEditDialog
          note={editNote}
          onClose={() => setEditNote(null)}
          onSaved={() => {
            setEditNote(null);
            setSelectedNote(null);
          }}
        />
      )}

      {printId && printable && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-5 sm:p-8">
          <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 p-6 sm:p-8">
            <h1 className="text-center text-2xl font-black">إشعار دائن {printable.status === "reversed" && <span className="text-red-700">— معكوس</span>}</h1>
            <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2"><p><strong>رقم المرتجع:</strong> {printable.creditNoteNumber}</p><p><strong>الفاتورة:</strong> {printable.invoiceNumber}</p><p><strong>العميل:</strong> {printable.customerName}</p><p><strong>التاريخ:</strong> {printable.date}</p></div>
            <div className="mt-5 overflow-x-auto"><table className="data-table min-w-[520px]"><thead><tr><th>الصنف</th><th>الكمية</th><th>قيمة الائتمان</th></tr></thead><tbody>{printable.items.map((item) => <tr key={String(item.productId)}><td>{item.productName}</td><td>{formatAmount(item.quantityReturned)}</td><td>{formatCurrency(item.creditAmount)}</td></tr>)}</tbody></table></div>
            <p className="mt-5 text-lg font-black">الإجمالي: {formatCurrency(printable.totalCredit)}</p>
            <p className="mt-2 text-sm text-slate-600"><strong>السبب:</strong> {printable.reason}</p>
            <div className="mt-6 flex gap-2 print:hidden"><button className="btn-primary" onClick={() => window.print()}>طباعة</button><button className="btn-secondary" onClick={() => setPrintId(null)}>إغلاق</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
