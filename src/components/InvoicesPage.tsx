import { FinancialHistory } from "./FinancialHistory";
import { SalesReturnsPanel } from "./SalesReturnsPanel";
import { InvoiceEditDialog } from "./InvoiceEditDialog";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import type { Page } from "./ERPApp";
import { Eye, FileText, Pencil, Plus, Search, Printer, RotateCcw, X } from "lucide-react";
import { PrintModal } from "./PrintTemplate";
import { useCurrency } from "../lib/utils";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/errors";

interface InvoicesPageProps {
  onNavigate: (page: Page) => void;
  view?: "sales" | "returns";
  creditOnly?: boolean;
}

export function InvoicesPage({ onNavigate, view = "sales", creditOnly = false }: InvoicesPageProps) {
  const canCreate = usePermission("create_invoices");
  const canEdit = usePermission("edit_invoices");
  const canPrint = usePermission("print_invoices");
  const canCancel = usePermission("delete_invoices");
  const canCollect = usePermission("record_collections");
  const canRefund = usePermission("refund_collections");
  const invoices = useQuery(api.invoices.list, {}) ?? [];
  const cancelInvoice = useMutation(api.invoices.cancel);
  const recordPayment = useMutation(api.invoices.recordPayment);
  const refundPayment = useMutation(api.invoices.refundPayment);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [printInvoice, setPrintInvoice] = useState<Doc<"invoices"> | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Doc<"invoices"> | null>(null);
  const [editInvoice, setEditInvoice] = useState<Doc<"invoices"> | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Doc<"invoices"> | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelRequestId = useRef(crypto.randomUUID());
  const [collectTarget, setCollectTarget] = useState<Doc<"invoices"> | null>(null);
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionAccountId, setCollectionAccountId] = useState("");
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().slice(0, 10));
  const [collectionNotes, setCollectionNotes] = useState("");
  const [isCollecting, setIsCollecting] = useState(false);
  const collectionRequestId = useRef(crypto.randomUUID());
  const [refundTarget, setRefundTarget] = useState<Doc<"invoices"> | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundAccountId, setRefundAccountId] = useState("");
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundReason, setRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);
  const refundRequestId = useRef(crypto.randomUUID());
  const collectionAccounts = useQuery(api.finance.collectionAccountPicker, canCollect && collectTarget ? {} : "skip") ?? [];
  const refundAccounts = useQuery(api.finance.refundAccountPicker, canRefund && refundTarget ? {} : "skip") ?? [];

  const handleCancel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cancelTarget || isCancelling || !cancelReason.trim()) return;
    setIsCancelling(true);
    try {
      await cancelInvoice({ id: cancelTarget._id, reason: cancelReason.trim(), date: new Date().toISOString().slice(0, 10), requestId: cancelRequestId.current });
      toast.success("تم إلغاء الفاتورة وعكس آثارها بنجاح");
      setCancelTarget(null);
      setCancelReason("");
      cancelRequestId.current = crypto.randomUUID();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إلغاء الفاتورة"));
    } finally {
      setIsCancelling(false);
    }
  };

  const collect = (invoice: Doc<"invoices">) => {
    setCollectTarget(invoice);
    setCollectionAmount("");
    setCollectionAccountId("");
    setCollectionDate(new Date().toISOString().slice(0, 10));
    setCollectionNotes("");
    collectionRequestId.current = crypto.randomUUID();
  };

  const submitCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(collectionAmount);
    if (!collectTarget || isCollecting) return;
    if (!Number.isFinite(amount) || amount <= 0 || amount > collectTarget.remaining) {
      return toast.error("أدخل مبلغ تحصيل صحيحًا");
    }
    if (!collectionAccountId) return toast.error("اختر حساب التحصيل");
    setIsCollecting(true);
    try {
      await recordPayment({
        invoiceId: collectTarget._id,
        amount,
        accountId: collectionAccountId as Id<"financialAccounts">,
        paymentDate: collectionDate,
        requestId: collectionRequestId.current,
        notes: collectionNotes.trim() || undefined,
      });
      toast.success("تم التحصيل");
      setCollectTarget(null);
      collectionRequestId.current = crypto.randomUUID();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر التحصيل"));
    } finally {
      setIsCollecting(false);
    }
  };

  const refund = (invoice: Doc<"invoices">) => {
    setRefundTarget(invoice);
    setRefundAmount("");
    setRefundAccountId("");
    setRefundDate(new Date().toISOString().slice(0, 10));
    setRefundReason("");
    refundRequestId.current = crypto.randomUUID();
  };

  const submitRefund = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(refundAmount);
    if (!refundTarget || isRefunding) return;
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundTarget.paid) {
      return toast.error("أدخل مبلغ استرداد صحيحًا");
    }
    if (!refundAccountId) return toast.error("اختر حساب الاسترداد");
    if (!refundReason.trim()) return toast.error("اكتب سبب الاسترداد");
    setIsRefunding(true);
    try {
      await refundPayment({
        invoiceId: refundTarget._id,
        amount,
        accountId: refundAccountId as Id<"financialAccounts">,
        date: refundDate,
        reason: refundReason.trim(),
        requestId: refundRequestId.current,
      });
      toast.success("تم الاسترداد");
      setRefundTarget(null);
      refundRequestId.current = crypto.randomUUID();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر الاسترداد"));
    } finally {
      setIsRefunding(false);
    }
  };

  const filtered = invoices.filter(inv =>
    inv.invoiceNumber.includes(search) ||
    inv.customerName.toLowerCase().includes(search.toLowerCase())
  ).filter(inv => !filterStatus || inv.status === filterStatus)
    .filter(inv => !creditOnly || (inv.remaining > 0 && inv.status !== "cancelled"));

  const { formatCurrency, formatAmount } = useCurrency();

  if (view === "returns") {
    return (
      <div className="space-y-5 p-4 lg:p-6" data-testid="sales-returns-page">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-800">
            <RotateCcw className="h-6 w-6 text-[var(--brand-primary)]" />
            مرتجعات المبيعات
          </h1>
          <p className="mt-1 text-sm text-slate-500">إدارة إشعارات الخصم ومرتجعات فواتير البيع</p>
        </div>
        <SalesReturnsPanel />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="invoices-page">
      <div className="erp-page-header">
        <div>
          <span className="erp-kicker">مركز الفواتير والتحصيل</span>
          <h1 className="erp-page-title">
            <FileText className="w-6 h-6 text-[var(--erp-accent)]" />
            {creditOnly ? "الفواتير الآجلة" : "فواتير المبيعات"}
          </h1>
          <p className="erp-page-subtitle">{formatAmount(filtered.length)} {creditOnly ? "فاتورة عليها مبالغ مستحقة" : "فاتورة مسجلة"}</p>
        </div>
        {canCreate && <button onClick={() => onNavigate("new-invoice")} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          فاتورة بيع جديدة
        </button>}
      </div>

      <div className="erp-toolbar flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-10"
            placeholder="بحث برقم الفاتورة أو اسم العميل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="form-input sm:w-40" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="paid">مدفوعة</option>
          <option value="partial">جزئي</option>
          <option value="unpaid">معلقة</option>
          <option value="cancelled">ملغاة</option>
          <option value="partial_return">مرتجعة جزئيًا</option>
          <option value="paid_returned_partial">مدفوعة ومرتجعة جزئيًا</option>
          <option value="returned">مرتجعة بالكامل</option>
        </select>
      </div>

      <div className="erp-section">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>العميل</th>
                <th>التاريخ</th>
                <th>الإجمالي الأصلي</th><th>الإشعارات الدائنة</th><th>الصافي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>طريقة الدفع</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr
                  key={inv._id}
                  data-testid="invoice-row"
                  data-invoice-number={inv.invoiceNumber}
                  data-paid={inv.paid}
                  data-remaining={inv.remaining}
                  className="invoice-row-compact cursor-pointer"
                  tabIndex={0}
                  aria-label={`فتح الفاتورة ${inv.invoiceNumber}`}
                  onClick={() => setSelectedInvoice(inv)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedInvoice(inv);
                    }
                  }}
                >
                  <td>
                    <button
                      data-testid="invoice-open-number"
                      onClick={(event) => { event.stopPropagation(); setSelectedInvoice(inv); }}
                      className="font-mono text-xs font-black text-[var(--erp-accent-strong)] underline decoration-emerald-200 underline-offset-4 hover:text-emerald-800"
                    >
                      {inv.invoiceNumber}
                    </button>
                  </td>
                  <td>
                    {canCollect && inv.status !== "cancelled" && inv.status !== "returned" && inv.remaining > 0 && <button data-testid="invoice-collect" className="mr-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-700" onClick={(event) => { event.stopPropagation(); collect(inv); }}>تحصيل دفعة</button>}
                    {canRefund && inv.status !== "cancelled" && inv.status !== "returned" && inv.paid > 0 && <button data-testid="invoice-refund" className="mr-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-700" onClick={(event) => { event.stopPropagation(); refund(inv); }}>استرداد مبلغ</button>}
                    <p className="font-medium text-slate-800">{inv.customerName}</p>
                    {inv.customerPhone && <p className="text-xs text-slate-400">{inv.customerPhone}</p>}
                  </td>
                  <td className="text-slate-500 text-xs">
                    {new Date(inv._creationTime).toLocaleDateString("ar-EG-u-nu-latn")}
                  </td>
                  <td className="font-bold">{formatCurrency(inv.total)}</td><td>{formatCurrency(inv.creditedTotal ?? 0)}</td><td className="font-bold">{formatCurrency(inv.netTotal ?? inv.total)}</td>
                  <td className="text-emerald-600 font-medium">{formatCurrency(inv.paid)}</td>
                  <td className={`font-medium ${inv.remaining > 0 ? "text-amber-600" : "text-slate-400"}`}>
                    {formatCurrency(inv.remaining)}
                  </td>
                  <td>
                    <span className="text-xs text-slate-600">
                      {inv.paymentMethod === "cash" ? "نقدي" :
                       inv.paymentMethod === "card" ? "بطاقة" :
                       inv.paymentMethod === "transfer" ? "تحويل" : inv.paymentMethod}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${
                      inv.status === "cancelled" ? "badge-danger" :
                      inv.status === "paid" ? "badge-success" :
                      ["partial", "partial_return", "paid_returned_partial"].includes(inv.status) ? "badge-warning" :
                      inv.status === "returned" ? "badge-info" : "badge-danger"
                    }`}>
                      {inv.status === "cancelled" ? "ملغاة" : inv.status === "paid" ? "مدفوعة" :
                       inv.status === "partial" ? "جزئي" : inv.status === "partial_return" ? "مرتجعة جزئيًا" :
                       inv.status === "paid_returned_partial" ? "مدفوعة ومرتجعة جزئيًا" : inv.status === "returned" ? "مرتجعة بالكامل" : "معلقة"}
                    </span>
                  </td>
                  <td>
                    <button
                      data-testid="invoice-open"
                      onClick={(event) => { event.stopPropagation(); setSelectedInvoice(inv); }}
                      className="erp-action erp-action-primary"
                      title="فتح الفاتورة"
                    >
                      <Eye className="h-4 w-4" />
                      فتح
                    </button>
                    {canPrint && inv.status !== "cancelled" && <button
                      onClick={(event) => { event.stopPropagation(); if (canPrint) setPrintInvoice(inv); }}
                      className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors text-slate-500 hover:text-indigo-600"
                      title="طباعة الفاتورة"
                    >
                      <Printer className="w-4 h-4" />
                    </button>}
                    {canCancel && ["unpaid", "partial", "paid"].includes(inv.status) && (inv.creditedTotal ?? 0) === 0 && inv.paid === 0 && (
                      <button
                        onClick={(event) => { event.stopPropagation(); setCancelTarget(inv); setCancelReason(""); }}
                        className="mr-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        إلغاء الفاتورة
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    لا توجد فواتير
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canPrint && printInvoice && (
        <PrintModal
          type="invoice"
          data={printInvoice}
          onClose={() => setPrintInvoice(null)}
        />
      )}

      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" dir="rtl" role="dialog" aria-modal="true" data-testid="invoice-details-modal">
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-[var(--erp-navy)] px-5 py-4 text-white">
              <div>
                <p className="text-xs font-bold text-emerald-200">فاتورة مبيعات محفوظة</p>
                <h2 className="mt-1 text-xl font-black">{selectedInvoice.invoiceNumber}</h2>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && selectedInvoice.status !== "cancelled" && (
                  <button
                    type="button"
                    data-testid="invoice-edit-open"
                    onClick={() => setEditInvoice(selectedInvoice)}
                    className="rounded-lg border border-white/15 bg-emerald-500/20 px-3 py-2 text-xs font-black text-emerald-50 hover:bg-emerald-500/30"
                    title="تعديل الكمية أو السعر أو حذف صنف"
                  >
                    <Pencil className="ml-1 inline h-4 w-4" />تعديل
                  </button>
                )}
                {canPrint && selectedInvoice.status !== "cancelled" && (
                  <button onClick={() => setPrintInvoice(selectedInvoice)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-black hover:bg-white/15">
                    <Printer className="ml-1 inline h-4 w-4" />طباعة
                  </button>
                )}
                <button onClick={() => setSelectedInvoice(null)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 hover:bg-white/15" aria-label="إغلاق تفاصيل الفاتورة"><X className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="overflow-y-auto p-5">
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">العميل</p><p className="mt-1 font-black text-slate-800">{selectedInvoice.customerName}</p><p className="text-xs text-slate-400">{selectedInvoice.customerPhone || "بدون هاتف"}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">تاريخ الإنشاء</p><p className="mt-1 font-black text-slate-800">{new Date(selectedInvoice._creationTime).toLocaleString("ar-EG-u-nu-latn")}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">صافي الفاتورة</p><p className="mt-1 text-lg font-black text-emerald-800">{formatCurrency(selectedInvoice.netTotal ?? selectedInvoice.total)}</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">المتبقي</p><p className="mt-1 text-lg font-black text-amber-800">{formatCurrency(selectedInvoice.remaining)}</p></div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="data-table min-w-[720px]">
                  <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الإجمالي</th></tr></thead>
                  <tbody>
                    {selectedInvoice.items.map((item, index) => (
                      <tr key={`${item.productName}-${index}`}>
                        <td>{formatAmount(index + 1)}</td><td className="font-bold">{item.productName}</td><td>{formatAmount(item.quantity)}</td><td>{formatCurrency(item.unitPrice)}</td><td>{formatAmount(item.discount)}٪</td><td className="font-black">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-3 font-black text-slate-800">السجل المالي للفاتورة</h3>
                  <FinancialHistory referenceType="invoice" referenceId={String(selectedInvoice._id)} />
                </div>
                <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between"><dt>المجموع الفرعي</dt><dd className="font-bold">{formatCurrency(selectedInvoice.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt>الخصم</dt><dd className="font-bold text-red-600">{formatCurrency(selectedInvoice.discount)}</dd></div>
                  <div className="flex justify-between"><dt>الضريبة</dt><dd className="font-bold">{formatCurrency(selectedInvoice.tax)}</dd></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><dt className="font-black">الإجمالي</dt><dd className="font-black text-[var(--erp-accent-strong)]">{formatCurrency(selectedInvoice.total)}</dd></div>
                  <div className="flex justify-between"><dt>المدفوع</dt><dd className="font-bold text-emerald-700">{formatCurrency(selectedInvoice.paid)}</dd></div>
                  {selectedInvoice.notes && <div className="border-t border-slate-200 pt-2"><dt className="text-slate-500">ملاحظات</dt><dd className="mt-1 font-medium text-slate-700">{selectedInvoice.notes}</dd></div>}
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}

      {canEdit && editInvoice && (
        <InvoiceEditDialog
          invoice={editInvoice}
          onClose={() => setEditInvoice(null)}
          onSaved={() => {
            setEditInvoice(null);
            setSelectedInvoice(null);
          }}
        />
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-slate-800">إلغاء الفاتورة</h2>
            <div className="my-4 rounded-xl bg-slate-50 p-4 text-sm">
              <p><strong>رقم الفاتورة:</strong> {cancelTarget.invoiceNumber}</p>
              <p><strong>العميل:</strong> {cancelTarget.customerName}</p>
              <p><strong>الإجمالي:</strong> {formatCurrency(cancelTarget.total)}</p>
            </div>
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">سيتم عكس المخزون ورصيد العميل. أكد الإلغاء بكتابة السبب.</p>
            <form onSubmit={handleCancel} className="space-y-4">
              <div><label className="form-label">سبب الإلغاء *</label><textarea className="form-input" required value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} /></div>
              <div className="flex gap-3"><button className="btn-primary flex-1" disabled={isCancelling || !cancelReason.trim()}>{isCancelling ? "جارٍ الإلغاء..." : "تأكيد إلغاء الفاتورة"}</button><button type="button" className="btn-secondary" disabled={isCancelling} onClick={() => setCancelTarget(null)}>تراجع</button></div>
            </form>
          </div>
        </div>
      )}

      {collectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <form data-testid="invoice-collection-form" onSubmit={submitCollection} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">تحصيل دفعة للفاتورة {collectTarget.invoiceNumber}</h2>
            <input data-testid="invoice-collection-amount" className="form-input" type="number" min="0.01" max={collectTarget.remaining} step="0.01" required value={collectionAmount} onChange={event => setCollectionAmount(event.target.value)} placeholder="المبلغ" />
            <select data-testid="invoice-collection-account" className="form-input" required value={collectionAccountId} onChange={event => setCollectionAccountId(event.target.value)}>
              <option value="">اختر حساب التحصيل</option>
              {collectionAccounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}
            </select>
            <input data-testid="invoice-collection-date" className="form-input" type="date" required value={collectionDate} onChange={event => setCollectionDate(event.target.value)} />
            <textarea data-testid="invoice-collection-notes" className="form-input" value={collectionNotes} onChange={event => setCollectionNotes(event.target.value)} placeholder="ملاحظات" />
            <div className="flex gap-3">
              <button data-testid="invoice-collection-submit" className="btn-primary flex-1" disabled={isCollecting}>{isCollecting ? "جارٍ التحصيل..." : "تأكيد التحصيل"}</button>
              <button type="button" className="btn-secondary" disabled={isCollecting} onClick={() => setCollectTarget(null)}>إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <form data-testid="invoice-refund-form" onSubmit={submitRefund} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">استرداد مبلغ من الفاتورة {refundTarget.invoiceNumber}</h2>
            <input data-testid="invoice-refund-amount" className="form-input" type="number" min="0.01" max={refundTarget.paid} step="0.01" required value={refundAmount} onChange={event => setRefundAmount(event.target.value)} placeholder="المبلغ" />
            <select data-testid="invoice-refund-account" className="form-input" required value={refundAccountId} onChange={event => setRefundAccountId(event.target.value)}>
              <option value="">اختر حساب الاسترداد</option>
              {refundAccounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}
            </select>
            <input data-testid="invoice-refund-date" className="form-input" type="date" required value={refundDate} onChange={event => setRefundDate(event.target.value)} />
            <textarea data-testid="invoice-refund-reason" className="form-input" required value={refundReason} onChange={event => setRefundReason(event.target.value)} placeholder="سبب الاسترداد" />
            <div className="flex gap-3">
              <button data-testid="invoice-refund-submit" className="btn-primary flex-1" disabled={isRefunding}>{isRefunding ? "جارٍ الاسترداد..." : "تأكيد الاسترداد"}</button>
              <button type="button" className="btn-secondary" disabled={isRefunding} onClick={() => setRefundTarget(null)}>إلغاء</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
