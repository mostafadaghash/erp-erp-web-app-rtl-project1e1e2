import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eye, FileText, Plus, Printer, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { formatAppCurrency, formatAppDate, formatAppNumber } from "../lib/utils";

const today = new Date().toISOString().slice(0, 10);
type QuoteLine = { productId: string; quantity: number };
type QuoteStatus = Doc<"quotes">["status"];
type QuoteDateFilter = "today" | "7days" | "month" | "custom" | "all";

const statusLabels: Record<QuoteStatus, string> = {
  draft: "مسودة",
  sent: "مرسل",
  accepted: "مقبول",
  rejected: "مرفوض",
  expired: "منتهي",
  cancelled: "ملغى",
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function quoteMatchesDateFilter(
  value: string,
  filter: QuoteDateFilter,
  customFrom: string,
  customTo: string,
) {
  if (filter === "all") return true;

  const now = new Date();
  const currentDay = toDateInputValue(now);
  let from = "";
  let to = currentDay;

  if (filter === "today") {
    from = currentDay;
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

function statusBadgeClass(status: QuoteStatus) {
  if (status === "accepted") return "badge-success";
  if (status === "rejected" || status === "cancelled") return "badge-danger";
  if (status === "expired") return "badge-warning";
  return "badge-info";
}

function printQuote(quote: Doc<"quotes">) {
  const frame = window.open("", "_blank", "width=900,height=700");
  if (!frame) return toast.error("اسمح بفتح نافذة الطباعة");
  const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]!));
  frame.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(quote.quoteNumber)}</title><style>body{font-family:Arial;padding:40px;color:#172033}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{padding:10px;border:1px solid #d8dee8;text-align:right}.total{font-size:20px;font-weight:800;margin-top:24px}.meta{color:#64748b;margin-top:8px}</style></head><body><h1>عرض سعر ${esc(quote.quoteNumber)}</h1><div class="meta">العميل: ${esc(quote.customerName)} — التاريخ: ${esc(formatAppDate(quote.date))} — صالح حتى: ${esc(quote.validUntil ? formatAppDate(quote.validUntil) : "—")}</div><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead><tbody>${quote.items.map(item => `<tr><td>${esc(item.productName)}</td><td>${esc(formatAppNumber(item.quantity))}</td><td>${esc(formatAppCurrency(item.unitPrice))}</td><td>${esc(formatAppCurrency(item.discount))}</td><td>${esc(formatAppCurrency(item.total))}</td></tr>`).join("")}</tbody></table><div class="total">الإجمالي: ${esc(formatAppCurrency(quote.total))}</div><p>${esc(quote.notes ?? "")}</p><script>window.print()<\/script></body></html>`);
  frame.document.close();
}

export function QuotesPage({ createRequestToken }: { createRequestToken?: number }) {
  const canCreate = usePermission("create_quotes");
  const canEdit = usePermission("edit_quotes");
  const canPrint = usePermission("print_quotes");
  const canViewBranches = usePermission("view_branches");
  const me = useQuery(api.employees.me);
  const branches = useQuery(api.branches.list, canViewBranches ? {} : "skip") ?? [];
  const [branchId, setBranchId] = useState("");
  const effectiveBranch = (me?.branchId ?? (branchId || undefined)) as Id<"branches"> | undefined;
  const quotes = useQuery(api.quotes.list, effectiveBranch ? { branchId: effectiveBranch } : me && !me.branchId ? "skip" : {}) ?? [];
  const customers = useQuery(api.customers.list, effectiveBranch ? { branchId: effectiveBranch } : "skip") ?? [];
  const products = useQuery(api.products.list, effectiveBranch ? { branchId: effectiveBranch } : {}) ?? [];
  const createQuote = useMutation(api.quotes.create);
  const updateStatus = useMutation(api.quotes.updateStatus);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<Id<"quotes"> | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Doc<"quotes"> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "">("");
  const [dateFilter, setDateFilter] = useState<QuoteDateFilter>("month");
  const [customFrom, setCustomFrom] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));

  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [date, setDate] = useState(today);
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([{ productId: "", quantity: 1 }]);

  useEffect(() => {
    if (me?.branchId) setBranchId(String(me.branchId));
  }, [me?.branchId]);

  useEffect(() => {
    if (createRequestToken && canCreate) setOpen(true);
  }, [createRequestToken, canCreate]);

  const total = useMemo(
    () => lines.reduce((sum, line) => {
      const product = products.find(row => row._id === line.productId);
      return sum + (product?.sellPrice ?? 0) * line.quantity;
    }, 0) - Number(discount || 0) + Number(tax || 0),
    [lines, products, discount, tax],
  );

  const customRangeInvalid = dateFilter === "custom" && Boolean(customFrom && customTo && customFrom > customTo);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredQuotes = quotes
    .filter(quote => !normalizedSearch || [quote.quoteNumber, quote.customerName, quote.customerPhone ?? ""]
      .some(value => value.toLowerCase().includes(normalizedSearch)))
    .filter(quote => !statusFilter || quote.status === statusFilter)
    .filter(quote => quoteMatchesDateFilter(quote.date, dateFilter, customFrom, customTo));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveBranch) return toast.error("اختر الفرع");
    const selected = lines.filter(line => line.productId);
    if (!selected.length) return toast.error("أضف صنفًا واحدًا على الأقل");
    setBusy(true);
    try {
      await createQuote({
        customerId: customerId ? customerId as Id<"customers"> : undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: selected.map(line => {
          const product = products.find(row => row._id === line.productId)!;
          return { productId: product._id, quantity: line.quantity, unitPrice: product.sellPrice, discount: 0 };
        }),
        discount: Number(discount || 0),
        tax: Number(tax || 0),
        date,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        branchId: effectiveBranch,
        creationRequestId: crypto.randomUUID(),
      });
      toast.success("تم إنشاء عرض السعر");
      setOpen(false);
      setLines([{ productId: "", quantity: 1 }]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setDiscount("0");
      setTax("0");
      setValidUntil("");
      setNotes("");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إنشاء عرض السعر"));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (quote: Doc<"quotes">, status: QuoteStatus) => {
    if (statusBusyId) return;
    setStatusBusyId(quote._id);
    try {
      await updateStatus({ quoteId: quote._id, status });
      setSelectedQuote(current => current?._id === quote._id ? { ...current, status } : current);
      toast.success(`تم تحديث حالة عرض السعر إلى ${statusLabels[status]}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث حالة عرض السعر"));
    } finally {
      setStatusBusyId(null);
    }
  };

  return (
    <div className="erp-page space-y-3" data-testid="quotes-page">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-800">إنشاء ومتابعة عروض الأسعار وموافقة العملاء</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatAppNumber(filteredQuotes.length)} عرض مطابق للفلاتر من أصل {formatAppNumber(quotes.length)}
          </p>
        </div>
        {canCreate && (
          <button type="button" data-testid="quote-new" className="btn-primary shrink-0" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            عرض سعر جديد
          </button>
        )}
      </section>

      <section className="erp-toolbar flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center" data-testid="quotes-toolbar">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="quote-search"
            className="form-input w-full pl-10"
            placeholder="بحث برقم العرض أو اسم العميل أو الهاتف..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>

        <select
          data-testid="quote-date-filter"
          className="form-input lg:w-44"
          value={dateFilter}
          onChange={event => setDateFilter(event.target.value as QuoteDateFilter)}
          aria-label="فترة عروض الأسعار"
        >
          <option value="today">اليوم</option>
          <option value="7days">آخر 7 أيام</option>
          <option value="month">هذا الشهر</option>
          <option value="custom">فترة مخصصة</option>
          <option value="all">كل الفترات</option>
        </select>

        <select
          data-testid="quote-status-filter"
          className="form-input lg:w-40"
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value as QuoteStatus | "")}
          aria-label="حالة عرض السعر"
        >
          <option value="">كل الحالات</option>
          <option value="draft">مسودة</option>
          <option value="sent">مرسل</option>
          <option value="accepted">مقبول</option>
          <option value="rejected">مرفوض</option>
          <option value="expired">منتهي</option>
          <option value="cancelled">ملغى</option>
        </select>

        {!me?.branchId && branches.length > 0 && (
          <select
            data-testid="quote-branch-filter"
            className="form-input lg:w-48"
            value={branchId}
            onChange={event => setBranchId(event.target.value)}
            aria-label="فرع عروض الأسعار"
          >
            <option value="">اختر الفرع</option>
            {branches.filter(row => row.isActive).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}
          </select>
        )}

        {dateFilter === "custom" && (
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap">
            <label className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-slate-500">
              من
              <input
                data-testid="quote-date-from"
                className="form-input h-10 w-[150px] py-1.5 text-xs"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={event => setCustomFrom(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-slate-500">
              إلى
              <input
                data-testid="quote-date-to"
                className="form-input h-10 w-[150px] py-1.5 text-xs"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={event => setCustomTo(event.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      {customRangeInvalid && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
          تاريخ البداية يجب ألا يكون بعد تاريخ النهاية.
        </div>
      )}

      <section className="erp-section overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>رقم العرض</th>
                <th>التاريخ</th>
                <th>العميل</th>
                <th>الصلاحية</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map(quote => (
                <tr
                  key={quote._id}
                  data-testid="quote-row"
                  data-quote-number={quote.quoteNumber}
                  className="invoice-row-compact cursor-pointer"
                  tabIndex={0}
                  aria-label={`فتح عرض السعر ${quote.quoteNumber}`}
                  onClick={() => setSelectedQuote(quote)}
                  onKeyDown={event => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedQuote(quote);
                    }
                  }}
                >
                  <td className="font-mono text-xs font-black text-[var(--erp-accent-strong)]">{quote.quoteNumber}</td>
                  <td className="text-xs text-slate-500">{formatAppDate(quote.date)}</td>
                  <td className="font-bold text-slate-800">{quote.customerName}</td>
                  <td className="text-xs text-slate-500">{quote.validUntil ? formatAppDate(quote.validUntil) : "—"}</td>
                  <td className="font-black text-slate-900">{formatAppCurrency(quote.total)}</td>
                  <td><span className={`badge ${statusBadgeClass(quote.status)}`}>{statusLabels[quote.status]}</span></td>
                  <td>
                    <div className="flex items-center gap-1" onClick={event => event.stopPropagation()}>
                      <button type="button" className="erp-action erp-action-primary" onClick={() => setSelectedQuote(quote)} title="فتح عرض السعر">
                        <Eye className="h-4 w-4" /> فتح
                      </button>
                      {canEdit && quote.status === "draft" && (
                        <button
                          type="button"
                          className="erp-action"
                          disabled={statusBusyId === quote._id}
                          onClick={() => void changeStatus(quote, "sent")}
                        >
                          <Send className="h-4 w-4" /> إرسال
                        </button>
                      )}
                      {canPrint && (
                        <button type="button" className="erp-action" onClick={() => printQuote(quote)}>
                          <Printer className="h-4 w-4" /> طباعة
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredQuotes.length === 0 && (
                <tr>
                  <td colSpan={7} className="h-44 text-center text-slate-400">
                    <FileText className="mx-auto mb-2 h-9 w-9 opacity-35" />
                    <p className="font-bold text-slate-500">
                      {!effectiveBranch ? "اختر الفرع لعرض عروض الأسعار" : "لا توجد عروض أسعار مطابقة للفلاتر"}
                    </p>
                    <p className="mt-1 text-xs">يمكنك تغيير البحث أو الفترة أو الحالة لعرض نتائج أخرى.</p>
                    {canCreate && effectiveBranch && (
                      <button type="button" className="erp-action mt-3" onClick={() => setOpen(true)}>
                        <Plus className="h-4 w-4" /> إنشاء أول عرض سعر
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedQuote && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" data-testid="quote-details-modal">
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[var(--erp-navy)] px-5 py-4 text-white">
              <div>
                <p className="text-xs font-bold text-emerald-200">عرض سعر محفوظ</p>
                <h2 className="mt-1 text-xl font-black">{selectedQuote.quoteNumber}</h2>
                <p className="mt-1 text-xs text-slate-300">{selectedQuote.customerName}</p>
              </div>
              <div className="flex items-center gap-2">
                {canPrint && (
                  <button type="button" onClick={() => printQuote(selectedQuote)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-black hover:bg-white/15">
                    <Printer className="ml-1 inline h-4 w-4" /> طباعة
                  </button>
                )}
                <button type="button" onClick={() => setSelectedQuote(null)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 hover:bg-white/15" aria-label="إغلاق التفاصيل">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="overflow-y-auto p-5">
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">التاريخ</p><p className="mt-1 font-black text-slate-800">{formatAppDate(selectedQuote.date)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">صالح حتى</p><p className="mt-1 font-black text-slate-800">{selectedQuote.validUntil ? formatAppDate(selectedQuote.validUntil) : "—"}</p></div>
                <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs text-indigo-700">إجمالي العرض</p><p className="mt-1 text-lg font-black text-indigo-800">{formatAppCurrency(selectedQuote.total)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الحالة</p><p className="mt-1"><span className={`badge ${statusBadgeClass(selectedQuote.status)}`}>{statusLabels[selectedQuote.status]}</span></p></div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="data-table min-w-[650px]">
                  <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead>
                  <tbody>
                    {selectedQuote.items.map((item, index) => (
                      <tr key={`${String(item.productId)}-${index}`}>
                        <td>{formatAppNumber(index + 1)}</td>
                        <td className="font-bold">{item.productName}</td>
                        <td>{formatAppNumber(item.quantity)}</td>
                        <td>{formatAppCurrency(item.unitPrice)}</td>
                        <td>{formatAppCurrency(item.discount)}</td>
                        <td className="font-black">{formatAppCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-black text-slate-800">بيانات العميل والملاحظات</h3>
                  <p className="mt-2 text-sm text-slate-600"><strong>العميل:</strong> {selectedQuote.customerName}</p>
                  {selectedQuote.customerPhone && <p className="mt-1 text-sm text-slate-600"><strong>الهاتف:</strong> {selectedQuote.customerPhone}</p>}
                  <p className="mt-3 text-sm leading-7 text-slate-600">{selectedQuote.notes || "لا توجد ملاحظات."}</p>
                </div>
                <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between"><dt>الإجمالي قبل الخصم</dt><dd className="font-bold">{formatAppCurrency(selectedQuote.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt>الخصم</dt><dd className="font-bold text-amber-700">{formatAppCurrency(selectedQuote.discount)}</dd></div>
                  <div className="flex justify-between"><dt>الضريبة</dt><dd className="font-bold">{formatAppCurrency(selectedQuote.tax)}</dd></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2"><dt>الإجمالي</dt><dd className="font-black text-[var(--erp-accent-strong)]">{formatAppCurrency(selectedQuote.total)}</dd></div>
                </dl>
              </div>

              {canEdit && !["accepted", "rejected", "cancelled", "expired"].includes(selectedQuote.status) && (
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                  {selectedQuote.status === "draft" && (
                    <button type="button" className="erp-action" disabled={statusBusyId === selectedQuote._id} onClick={() => void changeStatus(selectedQuote, "sent")}>تسجيل كمُرسل</button>
                  )}
                  {selectedQuote.status === "sent" && (
                    <>
                      <button type="button" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100" disabled={statusBusyId === selectedQuote._id} onClick={() => void changeStatus(selectedQuote, "accepted")}>مقبول من العميل</button>
                      <button type="button" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100" disabled={statusBusyId === selectedQuote._id} onClick={() => void changeStatus(selectedQuote, "rejected")}>مرفوض من العميل</button>
                    </>
                  )}
                  <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50" disabled={statusBusyId === selectedQuote._id} onClick={() => void changeStatus(selectedQuote, "cancelled")}>إلغاء العرض</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3">
          <form onSubmit={submit} className="my-4 flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-xs font-bold text-[var(--erp-accent-strong)]">المبيعات</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">عرض سعر جديد</h2>
                <p className="mt-1 text-xs text-slate-500">أدخل العميل والأصناف وحدد مدة صلاحية العرض.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="overflow-y-auto p-5">
              <div className="rounded-xl border border-slate-200 p-4">
                <label className="form-label">العميل</label>
                <select className="form-input" value={customerId} onChange={event => {
                  const id = event.target.value;
                  setCustomerId(id);
                  const customer = customers.find(row => row._id === id);
                  if (customer) {
                    setCustomerName(customer.name);
                    setCustomerPhone(customer.phone);
                  }
                }}>
                  <option value="">عميل غير مسجل</option>
                  {customers.filter(row => row.isActive !== false).map(row => <option key={row._id} value={row._id}>{row.name} — {row.phone}</option>)}
                </select>
                {!customerId && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input required className="form-input" placeholder="اسم العميل" value={customerName} onChange={event => setCustomerName(event.target.value)} />
                    <input className="form-input" placeholder="الهاتف" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} />
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><p className="font-black text-slate-800">أصناف العرض</p><p className="mt-1 text-xs text-slate-500">أضف الأصناف والكميات المطلوبة.</p></div>
                  <button type="button" className="erp-action" onClick={() => setLines(rows => [...rows, { productId: "", quantity: 1 }])}><Plus className="h-4 w-4" /> إضافة صنف</button>
                </div>
                <div className="space-y-2">
                  {lines.map((line, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_100px_auto] gap-2">
                      <select required className="form-input" value={line.productId} onChange={event => setLines(rows => rows.map((row, itemIndex) => itemIndex === index ? { ...row, productId: event.target.value } : row))}>
                        <option value="">اختر الصنف</option>
                        {products.filter(row => row.isActive).map(row => <option key={row._id} value={row._id}>{row.name} — {formatAppCurrency(row.sellPrice)}</option>)}
                      </select>
                      <input min="1" type="number" className="form-input" aria-label="الكمية" value={line.quantity} onChange={event => setLines(rows => rows.map((row, itemIndex) => itemIndex === index ? { ...row, quantity: Number(event.target.value) } : row))} />
                      <button type="button" className="btn-secondary px-3" onClick={() => setLines(rows => rows.length === 1 ? rows : rows.filter((_, itemIndex) => itemIndex !== index))} aria-label="حذف الصنف"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><label className="form-label">التاريخ</label><input type="date" className="form-input" value={date} onChange={event => setDate(event.target.value)} /></div>
                <div><label className="form-label">صالح حتى</label><input type="date" className="form-input" min={date} value={validUntil} onChange={event => setValidUntil(event.target.value)} /></div>
                <div><label className="form-label">خصم إضافي</label><input type="number" min="0" step="0.01" className="form-input" value={discount} onChange={event => setDiscount(event.target.value)} /></div>
                <div><label className="form-label">الضريبة</label><input type="number" min="0" step="0.01" className="form-input" value={tax} onChange={event => setTax(event.target.value)} /></div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
                <div><label className="form-label">ملاحظات العرض</label><textarea className="form-input min-h-24" placeholder="شروط الدفع أو أي ملاحظات للعميل..." value={notes} onChange={event => setNotes(event.target.value)} /></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">إجمالي عرض السعر</p><p className="mt-2 text-2xl font-black text-[var(--erp-accent-strong)]">{formatAppCurrency(Math.max(0, total))}</p><p className="mt-2 text-xs text-slate-500">يشمل الخصم والضريبة المحددين أعلاه.</p></div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setOpen(false)}>إلغاء</button>
              <button disabled={busy || total < 0} className="btn-primary">{busy ? "جارٍ الحفظ…" : "حفظ عرض السعر"}</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
