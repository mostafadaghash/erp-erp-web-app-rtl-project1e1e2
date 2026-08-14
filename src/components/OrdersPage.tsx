import { FinancialHistory } from "./FinancialHistory";
import { useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  ShoppingCart, Plus, X, Search, Clock, CheckCircle, Package, Truck, XCircle,
  CreditCard, Trash2, MessageCircle, Printer, Pencil, Eye, FileText, Link2,
} from "lucide-react";
import { PrintModal } from "./PrintTemplate";
import { buildEgyptWhatsAppUrl } from "../lib/utils";
import { getErrorMessage } from "../lib/errors";

function buildWhatsAppLink(phone: string, message: string) {
  return buildEgyptWhatsAppUrl(phone, message);
}

function getWhatsAppMessage(status: string, orderNumber: string, customerName: string, storeName: string, remaining: number): string {
  const greeting = `السلام عليكم ${customerName} 👋`;
  const store = `*${storeName}*`;
  const ordNum = `رقم الطلب: *${orderNumber}*`;
  switch (status) {
    case "confirmed": return `${greeting}\n\nنود إعلامكم بأن طلبكم لدى ${store} قد تم تأكيده ✅\n${ordNum}\n\nسنقوم بإشعاركم فور جاهزية الطلب. شكراً لثقتكم 🙏`;
    case "ready": return `${greeting}\n\nيسعدنا إعلامكم بأن طلبكم لدى ${store} أصبح جاهزاً للاستلام 🎉\n${ordNum}\n${remaining > 0 ? `\nالمبلغ المتبقي: *${remaining.toLocaleString("ar-EG")} ج.م*\n` : ""}\nيمكنكم التفضل باستلامه في أي وقت خلال أوقات الدوام. شكراً لكم 😊`;
    case "delivered": return `${greeting}\n\nشكراً لزيارتكم ${store} 🌟\n${ordNum}\n\nنتمنى أن تكونوا راضين عن خدمتكم. يسعدنا دائماً خدمتكم 💙`;
    case "cancelled": return `${greeting}\n\nنأسف لإعلامكم بأنه تم إلغاء طلبكم لدى ${store}\n${ordNum}\n\nللاستفسار أو إعادة الطلب، يرجى التواصل معنا. نعتذر عن أي إزعاج 🙏`;
    default: return `${greeting}\n\nتحديث على طلبكم لدى ${store}\n${ordNum}`;
  }
}

type OrderStatus = "pending" | "confirmed" | "ready" | "delivered" | "cancelled";
type OrderItem = { productName: string; quantity: number; unitPrice: number; notes?: string };

const statusConfig: Record<OrderStatus, { label: string; badge: string; icon: React.ElementType }> = {
  pending: { label: "قيد الانتظار", badge: "badge badge-warning", icon: Clock },
  confirmed: { label: "مؤكد", badge: "badge badge-info", icon: CheckCircle },
  ready: { label: "جاهز", badge: "badge badge-purple", icon: Package },
  delivered: { label: "تم التسليم", badge: "badge badge-success", icon: Truck },
  cancelled: { label: "ملغي", badge: "badge badge-danger", icon: XCircle },
};

const statusFlow: OrderStatus[] = ["pending", "confirmed", "ready", "delivered"];
const orderFilters: Array<{ v: OrderStatus | "all"; l: string }> = [
  { v: "all", l: "الكل" },
  { v: "pending", l: "انتظار" },
  { v: "confirmed", l: "مؤكد" },
  { v: "ready", l: "جاهز" },
  { v: "delivered", l: "مُسلَّم" },
  { v: "cancelled", l: "ملغي" },
];
const emptyItem = (): OrderItem => ({ productName: "", quantity: 1, unitPrice: 0 });
const money = (value: number) => `${value.toLocaleString("ar-EG")} ج.م`;

export function OrdersPage() {
  const canCreate = usePermission("create_orders");
  const canEdit = usePermission("edit_orders");
  const canDelete = usePermission("delete_orders");
  const canCollect = usePermission("record_collections");
  const canRefund = usePermission("refund_collections");
  const canPrint = usePermission("print_orders");

  const [filterStatus, setFilterStatus] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Doc<"orders"> | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Id<"orders"> | null>(null);
  const [showPayment, setShowPayment] = useState<Id<"orders"> | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentRequestId, setPaymentRequestId] = useState(() => crypto.randomUUID());
  const [refundTarget, setRefundTarget] = useState<Doc<"orders"> | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundAccountId, setRefundAccountId] = useState("");
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundReason, setRefundReason] = useState("");
  const [refundRequestId, setRefundRequestId] = useState(() => crypto.randomUUID());
  const [cancelTarget, setCancelTarget] = useState<Doc<"orders"> | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<Id<"orders"> | null>(null);
  const [printOrder, setPrintOrder] = useState<Doc<"orders"> | null>(null);

  const { results: orders, status: paginationStatus, loadMore } = usePaginatedQuery(
    api.orderPagination.list,
    filterStatus === "all" ? {} : { status: filterStatus },
    { initialNumItems: 25 },
  );
  const stats = useQuery(api.orders.stats);
  const details = useQuery(api.orders.details, detailsTarget ? { id: detailsTarget } : "skip");
  const settings = useQuery(api.settings.getPublic);
  const updateStatus = useMutation(api.orders.updateStatus);
  const addPayment = useMutation(api.orders.addPayment);
  const refundDeposit = useMutation(api.orders.refundDeposit);
  const cancelOrder = useMutation(api.orders.cancel);
  const collectionAccounts = useQuery(api.finance.collectionAccountPicker, canCollect && showPayment !== null ? {} : "skip") ?? [];
  const refundAccounts = useQuery(api.finance.refundAccountPicker, canRefund && refundTarget !== null ? {} : "skip") ?? [];

  const storeName = settings?.storeName ?? "المتجر";
  const isLoadingOrders = paginationStatus === "LoadingFirstPage";
  const needle = search.trim().toLocaleLowerCase("ar-EG");
  const filtered = orders.filter((order) => {
    if (!needle) return true;
    return order.customerName.toLocaleLowerCase("ar-EG").includes(needle)
      || order.orderNumber.toLocaleLowerCase("ar-EG").includes(needle)
      || (order.customerPhone ?? "").includes(needle);
  });

  const handleStatusChange = async (id: Id<"orders">, status: OrderStatus) => {
    if (statusBusyId) return;
    setStatusBusyId(id);
    try {
      await updateStatus({ id, status });
      toast.success("تم تحديث حالة الطلب");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث حالة الطلب"));
    } finally {
      setStatusBusyId(null);
    }
  };

  const handlePayment = async (id: Id<"orders">) => {
    if (busy) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("أدخل مبلغاً صحيحاً");
    if (!paymentAccountId) return toast.error("اختر الحساب المالي");
    setBusy(true);
    try {
      await addPayment({ id, amount, accountId: paymentAccountId as Id<"financialAccounts">, paymentDate, requestId: paymentRequestId, notes: paymentNotes.trim() || undefined });
      toast.success("تم تسجيل الدفعة بنجاح");
      setShowPayment(null);
      setPaymentAmount("");
      setPaymentNotes("");
      setPaymentRequestId(crypto.randomUUID());
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تسجيل الدفعة"));
    } finally {
      setBusy(false);
    }
  };

  const openRefund = (order: Doc<"orders">) => {
    setRefundTarget(order);
    setRefundAmount("");
    setRefundAccountId("");
    setRefundReason("");
    setRefundDate(new Date().toISOString().slice(0, 10));
    setRefundRequestId(crypto.randomUUID());
  };

  const handleRefund = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(refundAmount);
    const reason = refundReason.trim();
    if (!refundTarget || busy || !Number.isFinite(amount) || amount <= 0) return;
    if (!refundAccountId) return toast.error("اختر حساب الاسترداد");
    if (!reason) return toast.error("سبب الاسترداد مطلوب");
    setBusy(true);
    try {
      await refundDeposit({ id: refundTarget._id, amount, accountId: refundAccountId as Id<"financialAccounts">, date: refundDate, reason, requestId: refundRequestId });
      toast.success("تم استرداد العربون بنجاح");
      setRefundTarget(null);
      setRefundRequestId(crypto.randomUUID());
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر استرداد العربون"));
    } finally {
      setBusy(false);
    }
  };

  const openCancel = (order: Doc<"orders">) => {
    setCancelTarget(order);
    setCancelReason("");
  };

  const handleCancel = async (event: React.FormEvent) => {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (!cancelTarget || busy) return;
    if (!reason) return toast.error("سبب الإلغاء مطلوب");
    setBusy(true);
    try {
      await cancelOrder({ id: cancelTarget._id, reason });
      toast.success("تم إلغاء الطلب");
      setCancelTarget(null);
      setCancelReason("");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إلغاء الطلب"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="orders-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-indigo-600" />الأوردرات</h1>
          <p className="text-slate-500 text-sm mt-0.5">دورة الطلب من الإنشاء حتى الفاتورة والتوصيل والتسليم</p>
        </div>
        {canCreate && <button data-testid="order-create-open" onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />أوردر جديد</button>}
      </div>

      {stats && !stats.isReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">إحصائيات الطلبات قيد التهيئة أو إعادة البناء. قائمة الطلبات تعمل بصورة طبيعية، لكن بطاقات الملخص لن تُعتمد حتى اكتمال التهيئة.</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "قيد الانتظار", value: stats?.pending ?? 0, color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
          { label: "مؤكدة", value: stats?.confirmed ?? 0, color: "text-blue-600", bg: "bg-blue-50", icon: CheckCircle },
          { label: "جاهزة", value: stats?.ready ?? 0, color: "text-purple-600", bg: "bg-purple-50", icon: Package },
          { label: "مُسلَّمة", value: stats?.delivered ?? 0, color: "text-emerald-600", bg: "bg-emerald-50", icon: Truck },
        ].map((item) => {
          const Icon = item.icon;
          return <div key={item.label} className="stat-card flex items-center gap-4"><div className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center flex-shrink-0`}><Icon className={`w-5 h-5 ${item.color}`} /></div><div><p className="text-2xl font-black text-slate-800">{item.value}</p><p className="text-xs text-slate-500">{item.label}</p></div></div>;
        })}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input data-testid="order-search" className="form-input pr-9" placeholder="بحث بالاسم أو رقم الطلب أو الهاتف..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="flex gap-2 flex-wrap">
          {orderFilters.map((filter) => <button key={filter.v} onClick={() => setFilterStatus(filter.v)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterStatus === filter.v ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"}`}>{filter.l}</button>)}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoadingOrders ? <div className="text-center py-16 text-slate-400">جارٍ تحميل الأوردرات...</div> : filtered.length === 0 ? <div className="text-center py-16"><div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><ShoppingCart className="w-7 h-7 text-slate-400" /></div><p className="text-slate-500 font-medium">{needle ? "لا توجد نتائج ضمن الأوردرات المحمّلة" : "لا توجد أوردرات"}</p></div> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>المنتجات</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>المتوقع</th><th>إجراءات</th></tr></thead><tbody>{filtered.map((order) => {
          const cfg = statusConfig[order.status as OrderStatus] ?? statusConfig.pending;
          const Icon = cfg.icon;
          const currentIdx = statusFlow.indexOf(order.status as OrderStatus);
          const candidate = currentIdx >= 0 && currentIdx < statusFlow.length - 1 ? statusFlow[currentIdx + 1] : null;
          const nextStatus = candidate === "delivered" && order.linkedInvoiceId ? null : candidate;
          const hasPhone = Boolean(order.customerPhone);
          const showWA = hasPhone && ["confirmed", "ready", "delivered", "cancelled"].includes(order.status);
          const waLink = order.customerPhone ? buildWhatsAppLink(order.customerPhone, getWhatsAppMessage(order.status, order.orderNumber, order.customerName, storeName, order.remaining)) : null;
          const canModifyBody = canEdit && ["pending", "confirmed"].includes(order.status) && !order.linkedInvoiceId;
          const financialEditable = !order.linkedInvoiceId && !["cancelled", "delivered"].includes(order.status);
          return <tr key={order._id} data-testid="order-row" data-order-number={order.orderNumber} data-customer-name={order.customerName} data-status={order.status}>
            <td><span className="font-mono font-bold text-indigo-600 text-xs">{order.orderNumber}</span>{order.linkedInvoiceId && <span className="mr-2 inline-flex items-center gap-1 text-[11px] text-violet-600"><Link2 className="w-3 h-3" />فاتورة</span>}</td>
            <td><p className="font-medium text-slate-800">{order.customerName}</p>{order.customerPhone && <p className="text-xs text-slate-400">{order.customerPhone}</p>}</td>
            <td><p className="text-slate-700">{order.items.length} منتج</p><p className="text-xs text-slate-400 truncate max-w-32">{order.items.map((item) => item.productName).join("، ")}</p></td>
            <td className="font-bold text-slate-800">{money(order.total)}</td>
            <td className="text-emerald-600 font-medium">{money(order.deposit)}</td>
            <td><span className={`font-bold ${order.remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>{money(order.remaining)}</span></td>
            <td><span className={cfg.badge}><Icon className="w-3 h-3 ml-1" />{cfg.label}</span></td>
            <td className="text-slate-500 text-xs">{order.expectedDate ?? "—"}</td>
            <td><div className="flex items-center gap-1.5">
              <button onClick={() => setDetailsTarget(order._id)} className="p-1.5 bg-slate-50 text-slate-500 rounded-lg hover:bg-indigo-50 hover:text-indigo-600" title="التفاصيل والـTimeline"><Eye className="w-3.5 h-3.5" /></button>
              {canModifyBody && <button onClick={() => setEditTarget(order)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100" title="تعديل الطلب"><Pencil className="w-3.5 h-3.5" /></button>}
              {canEdit && nextStatus && order.status !== "cancelled" && <button data-testid="order-status-next" data-next-status={nextStatus} disabled={statusBusyId === order._id} onClick={() => handleStatusChange(order._id, nextStatus)} className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap">{statusConfig[nextStatus].label}</button>}
              {canEdit && order.status === "ready" && order.linkedInvoiceId && <span className="text-[11px] text-violet-600 px-2 py-1 bg-violet-50 rounded-lg">التسليم من التوصيل</span>}
              {canCollect && financialEditable && order.remaining > 0 && <button onClick={() => { setShowPayment(order._id); setPaymentAmount(""); setPaymentAccountId(""); setPaymentNotes(""); setPaymentRequestId(crypto.randomUUID()); }} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="تسجيل دفعة"><CreditCard className="w-3.5 h-3.5" /></button>}
              {canRefund && financialEditable && order.deposit > 0 && <button onClick={() => openRefund(order)} className="p-1.5 bg-amber-50 text-amber-700 rounded-lg" title="استرداد عربون"><CreditCard className="w-3.5 h-3.5" /></button>}
              {showWA && waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100" title={`إرسال إشعار واتساب — ${cfg.label}`}><MessageCircle className="w-3.5 h-3.5" /></a>}
              {canPrint && <button onClick={() => setPrintOrder(order)} className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600" title="طباعة"><Printer className="w-3.5 h-3.5" /></button>}
              {canDelete && !["cancelled", "delivered"].includes(order.status) && <button onClick={() => openCancel(order)} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100" title="إلغاء الطلب"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div></td>
          </tr>;
        })}</tbody></table></div>}
        {!isLoadingOrders && orders.length > 0 && <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between gap-3 flex-wrap"><p className="text-xs text-slate-500">تم تحميل {orders.length.toLocaleString("ar-EG")} أوردر{needle && paginationStatus !== "Exhausted" ? " — البحث الحالي داخل النتائج المحمّلة فقط" : ""}</p><div className="flex items-center gap-2">{paginationStatus === "CanLoadMore" && <button type="button" className="btn-secondary" onClick={() => loadMore(25)}>تحميل المزيد</button>}{paginationStatus === "LoadingMore" && <span className="text-sm text-slate-400">جارٍ تحميل المزيد...</span>}{paginationStatus === "Exhausted" && <span className="text-xs text-slate-400">تم تحميل كل النتائج</span>}</div></div>}
      </div>

      {showPayment && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"><div className="flex items-center justify-between mb-5"><h2 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-600" />تسجيل دفعة</h2><button disabled={busy} onClick={() => setShowPayment(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div><div className="space-y-4"><div><label className="form-label">المبلغ المدفوع (ج.م)</label><input className="form-input text-center text-xl font-bold" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} autoFocus /></div><select className="form-input" value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)}><option value="">اختر حساب التحصيل</option>{collectionAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select><input className="form-input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /><textarea className="form-input" placeholder="ملاحظات" value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} /><div className="flex gap-3"><button disabled={busy} onClick={() => setShowPayment(null)} className="btn-secondary flex-1">إلغاء</button><button disabled={busy} onClick={() => handlePayment(showPayment)} className="btn-success flex-1">{busy ? "جارٍ التسجيل..." : "تسجيل"}</button></div></div></div></div>}

      {refundTarget && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><form onSubmit={handleRefund} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"><h2 className="font-bold text-slate-800">استرداد عربون {refundTarget.orderNumber}</h2><div><label className="form-label">المبلغ *</label><input required min="0.01" max={refundTarget.deposit} step="0.01" type="number" className="form-input" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} /></div><div><label className="form-label">حساب الاسترداد *</label><select required className="form-input" value={refundAccountId} onChange={(event) => setRefundAccountId(event.target.value)}><option value="">اختر الحساب</option>{refundAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select></div><div><label className="form-label">التاريخ *</label><input required type="date" className="form-input" value={refundDate} onChange={(event) => setRefundDate(event.target.value)} /></div><div><label className="form-label">السبب *</label><textarea required className="form-input" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} /></div><div className="flex gap-3"><button type="submit" disabled={busy || !refundReason.trim()} className="btn-primary flex-1">{busy ? "جارٍ الاسترداد..." : "استرداد"}</button><button type="button" disabled={busy} className="btn-secondary" onClick={() => setRefundTarget(null)}>إلغاء</button></div></form></div>}

      {cancelTarget && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><form onSubmit={handleCancel} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold text-red-700 flex items-center gap-2"><XCircle className="w-5 h-5" />إلغاء الطلب {cancelTarget.orderNumber}</h2><button type="button" disabled={busy} onClick={() => setCancelTarget(null)}><X className="w-4 h-4" /></button></div>{cancelTarget.deposit > 0 && <p className="text-sm bg-amber-50 text-amber-800 rounded-xl p-3">يوجد عربون بقيمة {money(cancelTarget.deposit)}. يجب استرداده أولًا قبل الإلغاء.</p>}{cancelTarget.linkedInvoiceId && <p className="text-sm bg-violet-50 text-violet-800 rounded-xl p-3">الطلب مرتبط بفاتورة؛ يجب معالجة الفاتورة/التوصيل أولًا.</p>}<div><label className="form-label">سبب الإلغاء *</label><textarea className="form-input" required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="اكتب سببًا واضحًا قابلًا للمراجعة" /></div><div className="flex gap-3"><button type="submit" disabled={busy || !cancelReason.trim() || cancelTarget.deposit > 0 || Boolean(cancelTarget.linkedInvoiceId)} className="btn-danger flex-1 disabled:opacity-50">{busy ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}</button><button type="button" disabled={busy} className="btn-secondary" onClick={() => setCancelTarget(null)}>رجوع</button></div></form></div>}

      {detailsTarget && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"><div className="sticky top-0 bg-white border-b p-5 flex items-center justify-between z-10"><h2 className="font-bold text-slate-800 flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-600" />تفاصيل الطلب</h2><button onClick={() => setDetailsTarget(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div>{!details ? <div className="p-8 text-center text-slate-400">جارٍ تحميل التفاصيل...</div> : <div className="p-6 space-y-6"><div className="grid sm:grid-cols-4 gap-3"><Info label="رقم الطلب" value={details.order.orderNumber} /><Info label="العميل" value={details.order.customerName} /><Info label="الإجمالي" value={money(details.order.total)} /><Info label="المتبقي" value={money(details.order.remaining)} /></div><div className="grid md:grid-cols-2 gap-4"><div className="border rounded-2xl p-4"><h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3"><FileText className="w-4 h-4" />الفاتورة المرتبطة</h3>{details.invoice ? <div className="space-y-2 text-sm"><p className="font-mono text-indigo-600">{details.invoice.invoiceNumber}</p><p>الحالة: {details.invoice.status}</p><p>الإجمالي: {money(details.invoice.total)}</p><p>المدفوع: {money(details.invoice.paid)} — المتبقي: {money(details.invoice.remaining)}</p></div> : <p className="text-sm text-slate-400">لم يتم ربط فاتورة بعد.</p>}</div><div className="border rounded-2xl p-4"><h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3"><Truck className="w-4 h-4" />التوصيلات</h3>{details.deliveries.length ? <div className="space-y-2">{details.deliveries.map((delivery) => <div key={delivery._id} className="text-sm bg-slate-50 rounded-xl p-3"><p className="font-mono font-bold text-violet-600">{delivery.deliveryNumber}</p><p>{delivery.shippingCompany} — {delivery.status}</p>{delivery.trackingNumber && <p className="text-xs text-slate-500">تتبع: {delivery.trackingNumber}</p>}</div>)}</div> : <p className="text-sm text-slate-400">لا يوجد توصيل مرتبط.</p>}</div></div><div className="border rounded-2xl p-4"><h3 className="font-bold text-slate-700 mb-3">الحركات المالية</h3><FinancialHistory referenceType="order" referenceId={String(details.order._id)} /></div><div className="border rounded-2xl p-4"><h3 className="font-bold text-slate-700 mb-3">Timeline الطلب</h3><div className="space-y-3">{details.timeline.map((event) => <div key={event.key} className="flex gap-3"><div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" /><div className="flex-1"><div className="flex justify-between gap-3"><p className="font-medium text-sm text-slate-800">{event.title}</p><span className="text-xs text-slate-400">{event.date}</span></div><p className="text-xs text-slate-500">{event.description}</p>{"amount" in event && typeof event.amount === "number" && <p className={`text-xs font-bold ${event.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(event.amount)}</p>}</div></div>)}</div></div></div>}</div></div>}

      {showForm && <NewOrderForm onClose={() => setShowForm(false)} />}
      {editTarget && <EditOrderForm order={editTarget} onClose={() => setEditTarget(null)} />}
      {canPrint && printOrder && <PrintModal type="order" data={printOrder} onClose={() => setPrintOrder(null)} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400">{label}</p><p className="font-bold text-slate-800 mt-1">{value}</p></div>;
}

function OrderItemsEditor({ items, setItems }: { items: OrderItem[]; setItems: (items: OrderItem[]) => void }) {
  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (index: number) => setItems(items.filter((_, itemIndex) => itemIndex !== index));
  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  return <div className="space-y-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">المنتجات المطلوبة</p><button type="button" onClick={addItem} className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium"><Plus className="w-4 h-4" />إضافة منتج</button></div>{items.map((item, index) => <div key={index} data-testid="order-item-row" data-item-index={index} className="bg-slate-50 rounded-xl p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">منتج {index + 1}</span>{items.length > 1 && <button type="button" onClick={() => removeItem(index)} className="p-1 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}</div><div className="grid grid-cols-3 gap-2"><input data-testid="order-item-name" className="form-input col-span-3 sm:col-span-1" placeholder="اسم المنتج *" value={item.productName} onChange={(event) => updateItem(index, "productName", event.target.value)} /><input data-testid="order-item-quantity" className="form-input text-center" type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, "quantity", Number(event.target.value))} /><input data-testid="order-item-price" className="form-input text-center" type="number" min="0" step="0.01" value={item.unitPrice || ""} onChange={(event) => updateItem(index, "unitPrice", Number(event.target.value))} /></div><input className="form-input text-sm" placeholder="ملاحظات (اختياري)" value={item.notes ?? ""} onChange={(event) => updateItem(index, "notes", event.target.value)} /><div className="text-left text-sm font-bold text-indigo-600">{money(item.quantity * item.unitPrice)}</div></div>)}</div>;
}

function NewOrderForm({ onClose }: { onClose: () => void }) {
  const createOrder = useMutation(api.orders.create);
  const customers = useQuery(api.customers.list, {});
  const canCollect = usePermission("record_collections");
  const accounts = useQuery(api.finance.collectionAccountPicker, canCollect ? {} : "skip") ?? [];
  const [accountId, setAccountId] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerId: "", expectedDate: "", notes: "", deposit: "" });
  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCustomerSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value;
    if (!id) return setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
    const customer = customers?.find((row) => row._id === id);
    if (customer) setForm({ ...form, customerId: id, customerName: customer.name, customerPhone: customer.phone });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!form.customerName.trim()) return toast.error("أدخل اسم العميل");
    if (items.some((item) => !item.productName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPrice < 0)) return toast.error("راجع بيانات المنتجات والكميات والأسعار");
    const deposit = Number(form.deposit) || 0;
    if (deposit > total) return toast.error("العربون أكبر من الإجمالي");
    if (deposit > 0 && !form.customerId) return toast.error("العربون يتطلب عميلاً مسجلاً");
    if (deposit > 0 && !accountId) return toast.error("اختر حساب تحصيل العربون");
    setSaving(true);
    try {
      await createOrder({ customerName: form.customerName, customerPhone: form.customerPhone || undefined, customerId: form.customerId ? form.customerId as Id<"customers"> : undefined, items: items.map((item) => ({ ...item, notes: item.notes?.trim() || undefined })), total, creationRequestId: requestId, initialDeposit: deposit > 0 ? { amount: deposit, accountId: accountId as Id<"financialAccounts">, paymentDate: new Date().toISOString().slice(0, 10), requestId, notes: undefined } : undefined, expectedDate: form.expectedDate || undefined, notes: form.notes || undefined });
      toast.success("تم إنشاء الأوردر بنجاح");
      setRequestId(crypto.randomUUID());
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إنشاء الطلب"));
    } finally {
      setSaving(false);
    }
  };

  return <OrderFormShell title="أوردر جديد" onClose={onClose}><form data-testid="order-create-form" onSubmit={handleSubmit} className="p-6 space-y-5"><CustomerEditor form={form} setForm={setForm} customers={customers ?? []} onSelect={handleCustomerSelect} /><OrderItemsEditor items={items} setItems={setItems} /><div className="bg-indigo-50 rounded-xl p-4 space-y-3"><div className="flex justify-between"><span className="font-semibold">الإجمالي</span><span data-testid="order-total" data-value={total} className="font-black text-xl text-indigo-700">{money(total)}</span></div><div><label className="form-label">العربون / الدفعة الأولى</label><input data-testid="order-deposit" className="form-input" type="number" min="0" step="0.01" disabled={!canCollect} value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} />{canCollect && Number(form.deposit) > 0 && <select className="form-input mt-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">اختر حساب التحصيل</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select>}</div></div><DateNotesEditor form={form} setForm={setForm} /><div className="flex gap-3"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary flex-1">إلغاء</button><button data-testid="order-submit" type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ الأوردر"}</button></div></form></OrderFormShell>;
}

function EditOrderForm({ order, onClose }: { order: Doc<"orders">; onClose: () => void }) {
  const updateOrder = useMutation(api.orders.update);
  const customers = useQuery(api.customers.list, {});
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customerName: order.customerName, customerPhone: order.customerPhone ?? "", customerId: order.customerId ? String(order.customerId) : "", expectedDate: order.expectedDate ?? "", notes: order.notes ?? "", deposit: String(order.deposit) });
  const [items, setItems] = useState<OrderItem[]>(order.items.map((item) => ({ ...item })));
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCustomerSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value;
    if (order.deposit > 0) return;
    if (!id) return setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
    const customer = customers?.find((row) => row._id === id);
    if (customer) setForm({ ...form, customerId: id, customerName: customer.name, customerPhone: customer.phone });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!form.customerName.trim()) return toast.error("اسم العميل مطلوب");
    if (items.some((item) => !item.productName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPrice < 0)) return toast.error("راجع بيانات المنتجات والكميات والأسعار");
    if (total < order.deposit) return toast.error("الإجمالي الجديد أقل من العربون المسجل");
    setSaving(true);
    try {
      await updateOrder({ id: order._id, customerId: form.customerId ? form.customerId as Id<"customers"> : undefined, customerName: form.customerName, customerPhone: form.customerPhone || undefined, items: items.map((item) => ({ ...item, notes: item.notes?.trim() || undefined })), expectedDate: form.expectedDate || undefined, notes: form.notes || undefined });
      toast.success("تم تحديث الطلب");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث الطلب"));
    } finally {
      setSaving(false);
    }
  };

  return <OrderFormShell title={`تعديل ${order.orderNumber}`} onClose={onClose}><form onSubmit={handleSubmit} className="p-6 space-y-5"><CustomerEditor form={form} setForm={setForm} customers={customers ?? []} onSelect={handleCustomerSelect} disabledCustomer={order.deposit > 0} /><OrderItemsEditor items={items} setItems={setItems} /><div className="bg-indigo-50 rounded-xl p-4"><div className="flex justify-between"><span className="font-semibold">الإجمالي الجديد</span><span className="font-black text-xl text-indigo-700">{money(total)}</span></div><div className="flex justify-between text-sm mt-2"><span>العربون المحفوظ</span><span>{money(order.deposit)}</span></div><div className="flex justify-between text-sm mt-1"><span>المتبقي بعد الحفظ</span><span className="font-bold text-amber-700">{money(Math.max(0, total - order.deposit))}</span></div></div><DateNotesEditor form={form} setForm={setForm} /><div className="flex gap-3"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary flex-1">إلغاء</button><button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button></div></form></OrderFormShell>;
}

type FormState = { customerName: string; customerPhone: string; customerId: string; expectedDate: string; notes: string; deposit: string };

function CustomerEditor({ form, setForm, customers, onSelect, disabledCustomer = false }: { form: FormState; setForm: (form: FormState) => void; customers: Array<{ _id: Id<"customers">; name: string; phone: string }>; onSelect: (event: React.ChangeEvent<HTMLSelectElement>) => void; disabledCustomer?: boolean }) {
  return <div className="bg-slate-50 rounded-xl p-4 space-y-3"><p className="text-sm font-semibold text-slate-700">بيانات العميل</p><div><label className="form-label">اختر عميلاً (اختياري)</label><select data-testid="order-customer-select" disabled={disabledCustomer} className="form-input disabled:bg-slate-100" value={form.customerId} onChange={onSelect}><option value="">— بدون ربط —</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} — {customer.phone}</option>)}</select>{disabledCustomer && <p className="text-xs text-amber-700 mt-1">لا يمكن تغيير العميل بعد تسجيل عربون.</p>}</div><div className="grid grid-cols-2 gap-3"><div><label className="form-label">اسم العميل *</label><input disabled={disabledCustomer} className="form-input disabled:bg-slate-100" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} /></div><div><label className="form-label">رقم الهاتف</label><input disabled={disabledCustomer} className="form-input disabled:bg-slate-100" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} /></div></div></div>;
}

function DateNotesEditor({ form, setForm }: { form: FormState; setForm: (form: FormState) => void }) {
  return <div className="grid grid-cols-2 gap-3"><div><label className="form-label">تاريخ التسليم المتوقع</label><input className="form-input" type="date" value={form.expectedDate} onChange={(event) => setForm({ ...form, expectedDate: event.target.value })} /></div><div><label className="form-label">ملاحظات</label><input className="form-input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div></div>;
}

function OrderFormShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"><div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl z-10"><h2 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-indigo-600" />{title}</h2><button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div>{children}</div></div>;
}

