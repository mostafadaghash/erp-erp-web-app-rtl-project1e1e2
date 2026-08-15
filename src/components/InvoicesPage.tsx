import { FinancialHistory } from "./FinancialHistory";
import { SalesReturnsPanel } from "./SalesReturnsPanel";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import type { Page } from "./ERPApp";
import { FileText, Plus, Search, Printer, RotateCcw } from "lucide-react";
import { PrintModal } from "./PrintTemplate";
import { useCurrency } from "../lib/utils";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/errors";

interface InvoicesPageProps {
  onNavigate: (page: Page) => void;
  view?: "sales" | "returns";
}

export function InvoicesPage({ onNavigate, view = "sales" }: InvoicesPageProps) {
  const canCreate = usePermission("create_invoices");
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
  ).filter(inv => !filterStatus || inv.status === filterStatus);

  const activeFiltered = filtered.filter(invoice => invoice.status !== "cancelled");
  const totalRevenue = activeFiltered.reduce((s, i) => s + (i.netTotal ?? i.total), 0);
  const totalPaid = activeFiltered.reduce((s, i) => s + i.paid, 0);
  const totalPending = activeFiltered.reduce((s, i) => s + i.remaining, 0);

  const { formatCurrency } = useCurrency();

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            المبيعات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{invoices.length} فاتورة</p>
        </div>
        {canCreate && <button onClick={() => onNavigate("new-invoice")} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          فاتورة بيع جديدة
        </button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-indigo-600">{totalRevenue.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-slate-600 mt-0.5">إجمالي المبيعات (ج.م)</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-emerald-600">{totalPaid.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-slate-600 mt-0.5">المحصل (ج.م)</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-amber-600">{totalPending.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-slate-600 mt-0.5">المتبقي (ج.م)</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
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
                <tr key={inv._id} data-testid="invoice-row" data-invoice-number={inv.invoiceNumber} data-paid={inv.paid} data-remaining={inv.remaining}>
                  <td className="font-mono text-xs text-indigo-600 font-bold">{inv.invoiceNumber}<details><summary>السجل المالي</summary><FinancialHistory referenceType="invoice" referenceId={String(inv._id)} /></details></td>
                  <td>
                    {canCollect && inv.status !== "cancelled" && inv.status !== "returned" && inv.remaining > 0 && <button data-testid="invoice-collect" className="mr-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-700" onClick={() => collect(inv)}>تحصيل دفعة</button>}
                    {canRefund && inv.status !== "cancelled" && inv.status !== "returned" && inv.paid > 0 && <button data-testid="invoice-refund" className="mr-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-700" onClick={() => refund(inv)}>استرداد مبلغ</button>}
                    <p className="font-medium text-slate-800">{inv.customerName}</p>
                    {inv.customerPhone && <p className="text-xs text-slate-400">{inv.customerPhone}</p>}
                  </td>
                  <td className="text-slate-500 text-xs">
                    {new Date(inv._creationTime).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="font-bold">{inv.total.toLocaleString("ar-EG")} ج.م</td><td>{(inv.creditedTotal ?? 0).toLocaleString("ar-EG")} ج.م</td><td className="font-bold">{(inv.netTotal ?? inv.total).toLocaleString("ar-EG")} ج.م</td>
                  <td className="text-emerald-600 font-medium">{inv.paid.toLocaleString("ar-EG")} ج.م</td>
                  <td className={`font-medium ${inv.remaining > 0 ? "text-amber-600" : "text-slate-400"}`}>
                    {inv.remaining.toLocaleString("ar-EG")} ج.م
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
                    {canPrint && inv.status !== "cancelled" && <button
                      onClick={() => { if (canPrint) setPrintInvoice(inv); }}
                      className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors text-slate-500 hover:text-indigo-600"
                      title="طباعة الفاتورة"
                    >
                      <Printer className="w-4 h-4" />
                    </button>}
                    {canCancel && ["unpaid", "partial", "paid"].includes(inv.status) && (inv.creditedTotal ?? 0) === 0 && inv.paid === 0 && (
                      <button
                        onClick={() => { setCancelTarget(inv); setCancelReason(""); }}
                        className="mr-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        إلغاء الفاتورة
                      </button>
                    )}
                    {canCancel && inv.status !== "cancelled" && inv.paid > 0 && (
                      <p className="mt-1 text-xs text-amber-700">تحتاج معالجة استرداد مالي قبل الإلغاء</p>
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

      {/* Print Modal */}
      {canPrint && printInvoice && (
        <PrintModal
          type="invoice"
          data={printInvoice}
          onClose={() => setPrintInvoice(null)}
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
