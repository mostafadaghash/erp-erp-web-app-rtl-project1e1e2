import { FinancialHistory } from "./FinancialHistory";
import { useEffect, useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  ShoppingCart, Plus, X, Search, Clock, CheckCircle, Package, Truck, XCircle,
  CreditCard, Trash2, MessageCircle, Printer, Pencil, Eye, FileText, Link2,
  MoreHorizontal,
} from "lucide-react";
import { PrintModal } from "./PrintTemplate";
import { buildEgyptWhatsAppUrl } from "../lib/utils";
import { getErrorMessage } from "../lib/errors";
import { SearchableCombobox, type SearchableComboboxOption } from "./SearchableCombobox";

function buildWhatsAppLink(phone: string, message: string) {
  return buildEgyptWhatsAppUrl(phone, message);
}

function getWhatsAppMessage(status: string, orderNumber: string, customerName: string, storeName: string, remaining: number): string {
  const greeting = `السلام عليكم ${customerName} 👋`;
  const store = `*${storeName}*`;
  const ordNum = `رقم أمر البيع: *${orderNumber}*`;
  switch (status) {
    case "confirmed": return `${greeting}\n\nنود إعلامكم بأن طلبكم لدى ${store} قد تم تأكيده ✅\n${ordNum}\n\nسنقوم بإشعاركم فور جاهزية الطلب. شكراً لثقتكم 🙏`;
    case "ready": return `${greeting}\n\nيسعدنا إعلامكم بأن طلبكم لدى ${store} أصبح جاهزاً للاستلام 🎉\n${ordNum}\n${remaining > 0 ? `\nالمبلغ المتبقي: *${remaining.toLocaleString("ar-EG")} ج.م*\n` : ""}\nيمكنكم التفضل باستلامه في أي وقت خلال أوقات الدوام. شكراً لكم 😊`;
    case "delivered": return `${greeting}\n\nشكراً لزيارتكم ${store} 🌟\n${ordNum}\n\nنتمنى أن تكونوا راضين عن خدمتكم. يسعدنا دائماً خدمتكم 💙`;
    case "cancelled": return `${greeting}\n\nنأسف لإعلامكم بأنه تم إلغاء طلبكم لدى ${store}\n${ordNum}\n\nللاستفسار أو إعادة الطلب، يرجى التواصل معنا. نعتذر عن أي إزعاج 🙏`;
    default: return `${greeting}\n\nتحديث على طلبكم لدى ${store}\n${ordNum}`;
  }
}

type OrderStatus = "pending" | "confirmed" | "ready" | "delivered" | "cancelled";
type OrderPeriod = "all" | "today" | "week" | "month" | "custom";
type OrderItem = { productId?: string; productName: string; quantity: number; unitPrice: number; notes?: string };

const statusConfig: Record<OrderStatus, { label: string; badge: string; icon: React.ElementType }> = {
  pending: { label: "قيد الانتظار", badge: "badge badge-warning", icon: Clock },
  confirmed: { label: "مؤكد", badge: "badge badge-info", icon: CheckCircle },
  ready: { label: "جاهز", badge: "badge badge-purple", icon: Package },
  delivered: { label: "تم التسليم", badge: "badge badge-success", icon: Truck },
  cancelled: { label: "ملغي", badge: "badge badge-danger", icon: XCircle },
};

const statusFlow: OrderStatus[] = ["pending", "confirmed", "ready", "delivered"];
const orderFilters: Array<{ v: OrderStatus | "all"; l: string }> = [
  { v: "all", l: "كل الحالات" },
  { v: "pending", l: "قيد الانتظار" },
  { v: "confirmed", l: "مؤكد" },
  { v: "ready", l: "جاهز" },
  { v: "delivered", l: "تم التسليم" },
  { v: "cancelled", l: "ملغي" },
];
const periodFilters: Array<{ v: OrderPeriod; l: string }> = [
  { v: "all", l: "كل الفترات" },
  { v: "today", l: "اليوم" },
  { v: "week", l: "آخر 7 أيام" },
  { v: "month", l: "هذا الشهر" },
  { v: "custom", l: "فترة مخصصة" },
];
const emptyItem = (): OrderItem => ({ productId: "", productName: "", quantity: 1, unitPrice: 0 });
const money = (value: number) => `${value.toLocaleString("ar-EG")} ج.م`;
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export function OrdersPage({ createRequestToken }: { createRequestToken?: number }) {
  const canCreate = usePermission("create_orders");
  const canEdit = usePermission("edit_orders");
  const canDelete = usePermission("delete_orders");
  const canCollect = usePermission("record_collections");
  const canRefund = usePermission("refund_collections");
  const canPrint = usePermission("print_orders");

  const [filterStatus, setFilterStatus] = useState<OrderStatus | "all">("all");
  const [filterPeriod, setFilterPeriod] = useState<OrderPeriod>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [openActionsId, setOpenActionsId] = useState<Id<"orders"> | null>(null);
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

  useEffect(() => {
    if (createRequestToken && canCreate) setShowForm(true);
  }, [createRequestToken, canCreate]);

  useEffect(() => {
    if (!openActionsId) return;
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openActionsId]);

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
  const today = new Date();
  const todayKey = dateKey(today);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
  const weekStartKey = dateKey(weekStart);
  const monthStartKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const filtered = orders.filter((order) => {
    const matchesSearch = !needle
      || order.customerName.toLocaleLowerCase("ar-EG").includes(needle)
      || order.orderNumber.toLocaleLowerCase("ar-EG").includes(needle)
      || (order.customerPhone ?? "").includes(needle);
    if (!matchesSearch) return false;
    if (filterPeriod === "all") return true;
    const orderDate = dateKey(new Date(order._creationTime));
    if (filterPeriod === "today") return orderDate === todayKey;
    if (filterPeriod === "week") return orderDate >= weekStartKey && orderDate <= todayKey;
    if (filterPeriod === "month") return orderDate >= monthStartKey && orderDate <= todayKey;
    if (customFrom && orderDate < customFrom) return false;
    if (customTo && orderDate > customTo) return false;
    return true;
  });

  const handleStatusChange = async (id: Id<"orders">, status: OrderStatus) => {
    if (statusBusyId) return;
    setStatusBusyId(id);
    try {
      await updateStatus({ id, status });
      toast.success("تم تحديث حالة أمر البيع");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث حالة أمر البيع"));
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
      toast.success("تم إلغاء أمر البيع");
      setCancelTarget(null);
      setCancelReason("");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إلغاء أمر البيع"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-3 lg:p-4" data-testid="orders-page">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-indigo-600" /><h1 className="text-xl font-black text-slate-900">أوامر البيع</h1></div>
          <p className="mt-0.5 text-xs text-slate-500">إدارة أوامر البيع ومتابعة التجهيز والتحصيل والتسليم من شاشة واحدة</p>
        </div>
        {canCreate && <button data-testid="order-create-open" onClick={() => setShowForm(true)} className="btn-primary flex shrink-0 items-center gap-2"><Plus className="w-4 h-4" />أمر بيع جديد</button>}
      </div>

      {stats && !stats.isReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">إحصائيات أوامر البيع قيد التهيئة. قائمة الأوامر تعمل بصورة طبيعية.</div>}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="orders-compact-stats">
        {[
          { label: "قيد الانتظار", value: stats?.pending ?? 0, color: "text-amber-700", bg: "bg-amber-50", icon: Clock },
          { label: "مؤكدة", value: stats?.confirmed ?? 0, color: "text-blue-700", bg: "bg-blue-50", icon: CheckCircle },
          { label: "جاهزة", value: stats?.ready ?? 0, color: "text-purple-700", bg: "bg-purple-50", icon: Package },
          { label: "تم التسليم", value: stats?.delivered ?? 0, color: "text-emerald-700", bg: "bg-emerald-50", icon: Truck },
        ].map((item) => {
          const Icon = item.icon;
          return <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><div className={`grid h-9 w-9 place-items-center rounded-lg ${item.bg}`}><Icon className={`h-4 w-4 ${item.color}`} /></div><div><p className="text-lg font-black leading-none text-slate-900">{item.value}</p><p className="mt-1 text-[11px] text-slate-500">{item.label}</p></div></div>;
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" data-testid="orders-toolbar">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input data-testid="order-search" className="form-input pr-9" placeholder="ابحث باسم العميل أو رقم أمر البيع أو الهاتف..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select data-testid="order-status-filter" className="form-input lg:w-44" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as OrderStatus | "all")}>
            {orderFilters.map((filter) => <option key={filter.v} value={filter.v}>{filter.l}</option>)}
          </select>
          <select data-testid="order-period-filter" className="form-input lg:w-40" value={filterPeriod} onChange={(event) => setFilterPeriod(event.target.value as OrderPeriod)}>
            {periodFilters.map((filter) => <option key={filter.v} value={filter.v}>{filter.l}</option>)}
          </select>
          <div className="flex h-10 items-center justify-center rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-600 lg:min-w-28">{filtered.length.toLocaleString("ar-EG")} نتيجة</div>
        </div>
        {filterPeriod === "custom" && <div className="mt-2 grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-2 lg:mr-auto lg:w-[420px]" data-testid="order-custom-period"><input aria-label="من تاريخ" className="form-input" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /><input aria-label="إلى تاريخ" className="form-input" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoadingOrders ? <div className="py-12 text-center text-sm text-slate-400">جارٍ تحميل أوامر البيع...</div> : filtered.length === 0 ? <div className="py-12 text-center"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-100"><ShoppingCart className="h-5 w-5 text-slate-400" /></div><p className="text-sm font-medium text-slate-500">{needle || filterPeriod !== "all" ? "لا توجد أوامر مطابقة للفلاتر الحالية" : "لا توجد أوامر بيع"}</p></div> : <div className="overflow-x-auto"><table className="data-table min-w-[1050px]"><thead><tr><th>رقم أمر البيع</th><th>العميل</th><th>الأصناف</th><th>الإجمالي</th><th>التحصيل</th><th>الحالة</th><th>المتوقع</th><th className="w-48">الإجراء</th></tr></thead><tbody>{filtered.map((order) => {
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
          const hasSecondaryActions = canModifyBody || (canCollect && financialEditable && order.remaining > 0) || (canRefund && financialEditable && order.deposit > 0) || Boolean(showWA && waLink) || canPrint || (canDelete && !["cancelled", "delivered"].includes(order.status));
          return <tr key={order._id} data-testid="order-row" data-order-number={order.orderNumber} data-customer-name={order.customerName} data-status={order.status} role="button" tabIndex={0} className="cursor-pointer transition hover:bg-indigo-50/40 focus:bg-indigo-50/50 focus:outline-none" onClick={() => setDetailsTarget(order._id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetailsTarget(order._id); } }}>
            <td><span className="font-mono text-xs font-black text-indigo-700">{order.orderNumber}</span>{order.linkedInvoiceId && <span className="mr-2 inline-flex items-center gap-1 text-[10px] text-violet-600"><Link2 className="h-3 w-3" />فاتورة</span>}</td>
            <td><p className="font-bold text-slate-800">{order.customerName}</p>{order.customerPhone && <p className="mt-0.5 text-xs text-slate-400" dir="ltr">{order.customerPhone}</p>}</td>
            <td><p className="text-sm text-slate-700">{order.items.length} صنف</p><p className="max-w-40 truncate text-[11px] text-slate-400">{order.items.map((item) => item.productName).join("، ")}</p></td>
            <td className="font-black text-slate-800">{money(order.total)}</td>
            <td><p className="text-xs text-emerald-700">مدفوع {money(order.deposit)}</p><p className={`mt-1 text-xs font-black ${order.remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}>متبقي {money(order.remaining)}</p></td>
            <td><span className={cfg.badge}><Icon className="ml-1 h-3 w-3" />{cfg.label}</span>{order.status === "ready" && order.linkedInvoiceId && <p className="mt-1 text-[10px] text-violet-600">التسليم من الشحن</p>}</td>
            <td className="text-xs text-slate-500">{order.expectedDate ?? "—"}</td>
            <td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-1.5">
                {canEdit && nextStatus && order.status !== "cancelled" && <button data-testid="order-status-next" data-next-status={nextStatus} disabled={statusBusyId === order._id} onClick={() => handleStatusChange(order._id, nextStatus)} className="min-w-20 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{statusConfig[nextStatus].label}</button>}
                {hasSecondaryActions && openActionsId !== order._id && <button data-testid="order-actions-menu" type="button" onClick={(event) => { event.stopPropagation(); setOpenActionsId(order._id); }} className="grid h-8 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="مزيد من الإجراءات"><MoreHorizontal className="h-4 w-4" /></button>}
                {openActionsId === order._id && <div data-testid="order-actions-expanded" className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                  <button type="button" onClick={() => { setDetailsTarget(order._id); setOpenActionsId(null); }} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="التفاصيل"><Eye className="h-3.5 w-3.5" /></button>
                  {canModifyBody && <button type="button" onClick={() => { setEditTarget(order); setOpenActionsId(null); }} className="grid h-7 w-7 place-items-center rounded-md text-blue-600 hover:bg-blue-50" title="تعديل"><Pencil className="h-3.5 w-3.5" /></button>}
                  {canCollect && financialEditable && order.remaining > 0 && <button type="button" onClick={() => { setShowPayment(order._id); setPaymentAmount(""); setPaymentAccountId(""); setPaymentNotes(""); setPaymentRequestId(crypto.randomUUID()); setOpenActionsId(null); }} className="grid h-7 w-7 place-items-center rounded-md text-emerald-700 hover:bg-emerald-50" title="تسجيل دفعة"><CreditCard className="h-3.5 w-3.5" /></button>}
                  {canRefund && financialEditable && order.deposit > 0 && <button type="button" onClick={() => { openRefund(order); setOpenActionsId(null); }} className="grid h-7 w-7 place-items-center rounded-md text-amber-700 hover:bg-amber-50" title="استرداد عربون"><CreditCard className="h-3.5 w-3.5" /></button>}
                  {showWA && waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" onClick={() => setOpenActionsId(null)} className="grid h-7 w-7 place-items-center rounded-md text-green-600 hover:bg-green-50" title={`إرسال إشعار واتساب — ${cfg.label}`}><MessageCircle className="h-3.5 w-3.5" /></a>}
                  {canPrint && <button type="button" onClick={() => { setPrintOrder(order); setOpenActionsId(null); }} className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-slate-100" title="طباعة"><Printer className="h-3.5 w-3.5" /></button>}
                  {canDelete && !["cancelled", "delivered"].includes(order.status) && <button type="button" onClick={() => { openCancel(order); setOpenActionsId(null); }} className="grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50" title="إلغاء أمر البيع"><Trash2 className="h-3.5 w-3.5" /></button>}
                  <button type="button" onClick={() => setOpenActionsId(null)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100" title="إغلاق"><X className="h-3.5 w-3.5" /></button>
                </div>}
              </div>
            </td>
          </tr>;
        })}</tbody></table></div>}
        {!isLoadingOrders && orders.length > 0 && <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2"><p className="text-[11px] text-slate-500">تم تحميل {orders.length.toLocaleString("ar-EG")} أمر بيع{(needle || filterPeriod !== "all") && paginationStatus !== "Exhausted" ? " — الفلاتر الحالية داخل النتائج المحمّلة" : ""}</p><div className="flex items-center gap-2">{paginationStatus === "CanLoadMore" && <button type="button" className="erp-action" onClick={() => loadMore(25)}>تحميل المزيد</button>}{paginationStatus === "LoadingMore" && <span className="text-xs text-slate-400">جارٍ التحميل...</span>}{paginationStatus === "Exhausted" && <span className="text-[11px] text-slate-400">كل النتائج محملة</span>}</div></div>}
      </div>

      {showPayment && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"><div className="flex items-center justify-between mb-5"><h2 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-600" />تسجيل دفعة</h2><button disabled={busy} onClick={() => setShowPayment(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div><div className="space-y-4"><div><label className="form-label">المبلغ المدفوع (ج.م)</label><input className="form-input text-center text-xl font-bold" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} autoFocus /></div><select className="form-input" value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)}><option value="">اختر حساب التحصيل</option>{collectionAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select><input className="form-input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /><textarea className="form-input" placeholder="ملاحظات" value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} /><div className="flex gap-3"><button disabled={busy} onClick={() => setShowPayment(null)} className="btn-secondary flex-1">إلغاء</button><button disabled={busy} onClick={() => handlePayment(showPayment)} className="btn-success flex-1">{busy ? "جارٍ التسجيل..." : "تسجيل"}</button></div></div></div></div>}

      {refundTarget && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><form onSubmit={handleRefund} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"><h2 className="font-bold text-slate-800">استرداد عربون {refundTarget.orderNumber}</h2><div><label className="form-label">المبلغ *</label><input required min="0.01" max={refundTarget.deposit} step="0.01" type="number" className="form-input" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} /></div><div><label className="form-label">حساب الاسترداد *</label><select required className="form-input" value={refundAccountId} onChange={(event) => setRefundAccountId(event.target.value)}><option value="">اختر الحساب</option>{refundAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select></div><div><label className="form-label">التاريخ *</label><input required type="date" className="form-input" value={refundDate} onChange={(event) => setRefundDate(event.target.value)} /></div><div><label className="form-label">السبب *</label><textarea required className="form-input" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} /></div><div className="flex gap-3"><button type="submit" disabled={busy || !refundReason.trim()} className="btn-primary flex-1">{busy ? "جارٍ الاسترداد..." : "استرداد"}</button><button type="button" disabled={busy} className="btn-secondary" onClick={() => setRefundTarget(null)}>إلغاء</button></div></form></div>}

      {cancelTarget && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><form onSubmit={handleCancel} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold text-red-700 flex items-center gap-2"><XCircle className="w-5 h-5" />إلغاء أمر البيع {cancelTarget.orderNumber}</h2><button type="button" disabled={busy} onClick={() => setCancelTarget(null)}><X className="w-4 h-4" /></button></div>{cancelTarget.deposit > 0 && <p className="text-sm bg-amber-50 text-amber-800 rounded-xl p-3">يوجد عربون بقيمة {money(cancelTarget.deposit)}. يجب استرداده أولًا قبل الإلغاء.</p>}{cancelTarget.linkedInvoiceId && <p className="text-sm bg-violet-50 text-violet-800 rounded-xl p-3">أمر البيع مرتبط بفاتورة؛ يجب معالجة الفاتورة/عملية الشحن أولًا.</p>}<div><label className="form-label">سبب الإلغاء *</label><textarea className="form-input" required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="اكتب سببًا واضحًا قابلًا للمراجعة" /></div><div className="flex gap-3"><button type="submit" disabled={busy || !cancelReason.trim() || cancelTarget.deposit > 0 || Boolean(cancelTarget.linkedInvoiceId)} className="btn-danger flex-1 disabled:opacity-50">{busy ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}</button><button type="button" disabled={busy} className="btn-secondary" onClick={() => setCancelTarget(null)}>رجوع</button></div></form></div>}

      {detailsTarget && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"><div className="sticky top-0 bg-white border-b p-5 flex items-center justify-between z-10"><h2 className="font-bold text-slate-800 flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-600" />تفاصيل أمر البيع</h2><button onClick={() => setDetailsTarget(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div>{!details ? <div className="p-8 text-center text-slate-400">جارٍ تحميل التفاصيل...</div> : <div className="p-6 space-y-6"><div className="grid sm:grid-cols-4 gap-3"><Info label="رقم أمر البيع" value={details.order.orderNumber} /><Info label="العميل" value={details.order.customerName} /><Info label="الإجمالي" value={money(details.order.total)} /><Info label="المتبقي" value={money(details.order.remaining)} /></div><div className="grid md:grid-cols-2 gap-4"><div className="border rounded-2xl p-4"><h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3"><FileText className="w-4 h-4" />الفاتورة المرتبطة</h3>{details.invoice ? <div className="space-y-2 text-sm"><p className="font-mono text-indigo-600">{details.invoice.invoiceNumber}</p><p>الحالة: {details.invoice.status}</p><p>الإجمالي: {money(details.invoice.total)}</p><p>المدفوع: {money(details.invoice.paid)} — المتبقي: {money(details.invoice.remaining)}</p></div> : <p className="text-sm text-slate-400">لم يتم ربط فاتورة بعد.</p>}</div><div className="border rounded-2xl p-4"><h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3"><Truck className="w-4 h-4" />عمليات الشحن</h3>{details.deliveries.length ? <div className="space-y-2">{details.deliveries.map((delivery) => <div key={delivery._id} className="text-sm bg-slate-50 rounded-xl p-3"><p className="font-mono font-bold text-violet-600">{delivery.deliveryNumber}</p><p>{delivery.shippingCompany} — {delivery.status}</p>{delivery.trackingNumber && <p className="text-xs text-slate-500">تتبع: {delivery.trackingNumber}</p>}</div>)}</div> : <p className="text-sm text-slate-400">لا توجد عملية شحن مرتبطة.</p>}</div></div><div className="border rounded-2xl p-4"><h3 className="font-bold text-slate-700 mb-3">الحركات المالية</h3><FinancialHistory referenceType="order" referenceId={String(details.order._id)} /></div><div className="border rounded-2xl p-4"><h3 className="font-bold text-slate-700 mb-3">التسلسل الزمني لأمر البيع</h3><div className="space-y-3">{details.timeline.map((event) => <div key={event.key} className="flex gap-3"><div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" /><div className="flex-1"><div className="flex justify-between gap-3"><p className="font-medium text-sm text-slate-800">{event.title}</p><span className="text-xs text-slate-400">{event.date}</span></div><p className="text-xs text-slate-500">{event.description}</p>{"amount" in event && typeof event.amount === "number" && <p className={`text-xs font-bold ${event.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(event.amount)}</p>}</div></div>)}</div></div></div>}</div></div>}

      {showForm && <NewOrderForm onClose={() => setShowForm(false)} />}
      {editTarget && <EditOrderForm order={editTarget} onClose={() => setEditTarget(null)} />}
      {canPrint && printOrder && <PrintModal type="order" data={printOrder} onClose={() => setPrintOrder(null)} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400">{label}</p><p className="font-bold text-slate-800 mt-1">{value}</p></div>;
}

type OrderProduct = { _id: Id<"products">; name: string; sku: string; barcode?: string; stock: number; sellPrice?: number; isActive?: boolean };

function OrderItemsEditor({ items, setItems, products }: { items: OrderItem[]; setItems: (items: OrderItem[]) => void; products: OrderProduct[] }) {
  const activeProducts = products.filter((product) => product.isActive !== false);
  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (index: number) => setItems(items.length === 1 ? items : items.filter((_, itemIndex) => itemIndex !== index));
  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const chooseProduct = (index: number, productId: string) => {
    if (!productId) {
      setItems(items.map((item, itemIndex) => itemIndex === index ? emptyItem() : item));
      return;
    }
    const product = activeProducts.find((row) => String(row._id) === productId);
    if (!product) return;
    const duplicateIndex = items.findIndex((item, itemIndex) => itemIndex !== index && item.productId === productId);
    if (duplicateIndex >= 0) {
      const next = items
        .map((item, itemIndex) => itemIndex === duplicateIndex ? { ...item, quantity: item.quantity + Math.max(1, items[index]?.quantity ?? 1) } : item)
        .filter((_, itemIndex) => itemIndex !== index || items.length === 1);
      setItems(next.length ? next : [emptyItem()]);
      toast.info("الصنف موجود بالفعل وتمت زيادة الكمية");
      return;
    }
    const next = items.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      productId,
      productName: product.name,
      unitPrice: product.sellPrice ?? item.unitPrice ?? 0,
    } : item);
    if (index === items.length - 1) next.push(emptyItem());
    setItems(next);
  };

  return <section className="rounded-2xl border border-slate-200 bg-white overflow-visible" data-testid="order-items-editor">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div><p className="font-black text-slate-800">الأصناف</p><p className="mt-0.5 text-xs text-slate-500">ابحث باسم الصنف أو SKU أو الباركود، وسيظهر سطر جديد تلقائيًا بعد الاختيار.</p></div>
      <button type="button" onClick={addItem} className="erp-action shrink-0"><Plus className="w-4 h-4" />إضافة صنف</button>
    </div>
    <div className="hidden lg:grid grid-cols-[minmax(280px,1fr)_100px_140px_140px_44px] gap-2 px-4 py-2 text-[11px] font-black text-slate-500 bg-slate-50/80">
      <span>الصنف</span><span>الكمية</span><span>سعر الوحدة</span><span>الإجمالي</span><span />
    </div>
    <div className="divide-y divide-slate-100 px-3">
      {items.map((item, index) => {
        const selectedProduct = activeProducts.find((row) => String(row._id) === item.productId);
        const options: SearchableComboboxOption[] = activeProducts.map((product) => ({
          value: String(product._id),
          label: product.name,
          description: `${product.sku}${product.barcode ? ` — ${product.barcode}` : ""} — متاح ${product.stock}${typeof product.sellPrice === "number" ? ` — ${money(product.sellPrice)}` : ""}`,
          searchText: `${product.name} ${product.sku} ${product.barcode ?? ""}`,
        }));
        if (!item.productId && item.productName) options.unshift({ value: `legacy:${index}`, label: item.productName, description: "صنف محفوظ سابقًا — اختر الصنف المقابل من المخزون عند الحاجة", disabled: true });
        const pickerValue = item.productId || (item.productName ? `legacy:${index}` : "");
        return <div key={index} data-testid="order-item-row" data-item-index={index} className="grid gap-2 py-3 lg:grid-cols-[minmax(280px,1fr)_100px_140px_140px_44px] lg:items-start">
          <div>
            <label className="form-label lg:hidden">الصنف</label>
            <SearchableCombobox testId="order-item-product" value={pickerValue} onChange={(value) => chooseProduct(index, value.startsWith("legacy:") ? "" : value)} options={options} placeholder="ابحث عن صنف..." emptyText="لا يوجد صنف مطابق" />
            {selectedProduct && <p className="mt-1 text-[11px] text-slate-500">SKU: {selectedProduct.sku} · المتاح: <span className={selectedProduct.stock > 0 ? "font-bold text-emerald-700" : "font-bold text-red-600"}>{selectedProduct.stock}</span></p>}
          </div>
          <div><label className="form-label lg:hidden">الكمية</label><input data-testid="order-item-quantity" className="form-input text-center" type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, "quantity", Number(event.target.value))} /></div>
          <div><label className="form-label lg:hidden">سعر الوحدة</label><input data-testid="order-item-price" className="form-input text-center font-bold" type="number" min="0" step="0.01" value={item.unitPrice || ""} onChange={(event) => updateItem(index, "unitPrice", Number(event.target.value))} /></div>
          <div><label className="form-label lg:hidden">الإجمالي</label><div className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-black text-indigo-700">{money(item.quantity * item.unitPrice)}</div></div>
          <button type="button" disabled={items.length === 1} onClick={() => removeItem(index)} className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="حذف الصنف"><Trash2 className="w-4 h-4" /></button>
          <div className="lg:col-span-5"><input className="form-input text-sm" placeholder="ملاحظات الصنف (اختياري)" value={item.notes ?? ""} onChange={(event) => updateItem(index, "notes", event.target.value)} /></div>
        </div>;
      })}
    </div>
  </section>;
}

function NewOrderForm({ onClose }: { onClose: () => void }) {
  const createOrder = useMutation(api.orders.create);
  const customers = useQuery(api.customers.list, {});
  const products = (useQuery(api.products.list, {}) ?? []) as OrderProduct[];
  const canCollect = usePermission("record_collections");
  const accounts = useQuery(api.finance.collectionAccountPicker, canCollect ? {} : "skip") ?? [];
  const [accountId, setAccountId] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerId: "", expectedDate: "", notes: "", deposit: "" });
  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);
  const selectedItems = items.filter((item) => Boolean(item.productId || item.productName.trim()));
  const total = selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCustomerSelect = (id: string) => {
    if (!id) return setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
    const customer = customers?.find((row) => String(row._id) === id);
    if (customer) setForm({ ...form, customerId: id, customerName: customer.name, customerPhone: customer.phone });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!form.customerName.trim()) return toast.error("أدخل اسم العميل");
    if (!selectedItems.length) return toast.error("اختر صنفًا واحدًا على الأقل");
    if (selectedItems.some((item) => !item.productName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPrice < 0)) return toast.error("راجع بيانات الأصناف والكميات والأسعار");
    const deposit = Number(form.deposit) || 0;
    if (deposit > total) return toast.error("العربون أكبر من الإجمالي");
    if (deposit > 0 && !form.customerId) return toast.error("العربون يتطلب عميلاً مسجلاً");
    if (deposit > 0 && !accountId) return toast.error("اختر حساب تحصيل العربون");
    setSaving(true);
    try {
      await createOrder({ customerName: form.customerName, customerPhone: form.customerPhone || undefined, customerId: form.customerId ? form.customerId as Id<"customers"> : undefined, items: selectedItems.map((item) => ({ productId: item.productId ? item.productId as Id<"products"> : undefined, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, notes: item.notes?.trim() || undefined })), total, creationRequestId: requestId, initialDeposit: deposit > 0 ? { amount: deposit, accountId: accountId as Id<"financialAccounts">, paymentDate: new Date().toISOString().slice(0, 10), requestId, notes: undefined } : undefined, expectedDate: form.expectedDate || undefined, notes: form.notes || undefined });
      toast.success("تم إنشاء أمر البيع بنجاح");
      setRequestId(crypto.randomUUID());
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إنشاء أمر البيع"));
    } finally {
      setSaving(false);
    }
  };

  const accountOptions: SearchableComboboxOption[] = accounts.map((account) => ({ value: String(account._id), label: account.name, searchText: account.name }));
  return <OrderFormShell title="أمر بيع جديد" subtitle="اختر العميل والأصناف وسجل العربون وموعد التسليم من شاشة واحدة." onClose={onClose}><form data-testid="order-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5 space-y-4"><CustomerEditor form={form} setForm={setForm} customers={customers ?? []} onSelect={handleCustomerSelect} /><OrderItemsEditor items={items} setItems={setItems} products={products} /><div className="grid gap-4 lg:grid-cols-[1fr_320px]"><DateNotesEditor form={form} setForm={setForm} /><div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 space-y-3"><div className="flex items-center justify-between"><span className="font-bold text-slate-700">إجمالي أمر البيع</span><span data-testid="order-total" data-value={total} className="font-black text-xl text-indigo-700">{money(total)}</span></div><div><label className="form-label">العربون / الدفعة الأولى</label><input data-testid="order-deposit" className="form-input bg-white" type="number" min="0" step="0.01" disabled={!canCollect} value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} />{canCollect && Number(form.deposit) > 0 && <div className="mt-2"><SearchableCombobox value={accountId} onChange={setAccountId} options={accountOptions} placeholder="ابحث عن حساب التحصيل..." emptyText="لا توجد حسابات تحصيل" /></div>}</div><div className="flex justify-between border-t border-indigo-100 pt-2 text-sm"><span>المتبقي</span><strong className="text-amber-700">{money(Math.max(0, total - (Number(form.deposit) || 0)))}</strong></div></div></div></div><div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 lg:px-5"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary">إلغاء</button><button data-testid="order-submit" type="submit" disabled={saving} className="btn-primary min-w-40 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ أمر البيع"}</button></div></form></OrderFormShell>;
}

function EditOrderForm({ order, onClose }: { order: Doc<"orders">; onClose: () => void }) {
  const updateOrder = useMutation(api.orders.update);
  const customers = useQuery(api.customers.list, {});
  const products = (useQuery(api.products.list, {}) ?? []) as OrderProduct[];
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customerName: order.customerName, customerPhone: order.customerPhone ?? "", customerId: order.customerId ? String(order.customerId) : "", expectedDate: order.expectedDate ?? "", notes: order.notes ?? "", deposit: String(order.deposit) });
  const [items, setItems] = useState<OrderItem[]>(order.items.map((item) => ({ ...item, productId: "productId" in item && item.productId ? String(item.productId) : undefined })));
  const selectedItems = items.filter((item) => Boolean(item.productId || item.productName.trim()));
  const total = selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCustomerSelect = (id: string) => {
    if (order.deposit > 0) return;
    if (!id) return setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
    const customer = customers?.find((row) => String(row._id) === id);
    if (customer) setForm({ ...form, customerId: id, customerName: customer.name, customerPhone: customer.phone });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!form.customerName.trim()) return toast.error("اسم العميل مطلوب");
    if (!selectedItems.length) return toast.error("اختر صنفًا واحدًا على الأقل");
    if (selectedItems.some((item) => !item.productName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPrice < 0)) return toast.error("راجع بيانات الأصناف والكميات والأسعار");
    if (total < order.deposit) return toast.error("الإجمالي الجديد أقل من العربون المسجل");
    setSaving(true);
    try {
      await updateOrder({ id: order._id, customerId: form.customerId ? form.customerId as Id<"customers"> : undefined, customerName: form.customerName, customerPhone: form.customerPhone || undefined, items: selectedItems.map((item) => ({ productId: item.productId ? item.productId as Id<"products"> : undefined, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, notes: item.notes?.trim() || undefined })), expectedDate: form.expectedDate || undefined, notes: form.notes || undefined });
      toast.success("تم تحديث أمر البيع");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث أمر البيع"));
    } finally {
      setSaving(false);
    }
  };

  return <OrderFormShell title={`تعديل ${order.orderNumber}`} subtitle="تعديل العميل والأصناف مسموح قبل تجهيز الطلب وربطه بالفاتورة." onClose={onClose}><form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5 space-y-4"><CustomerEditor form={form} setForm={setForm} customers={customers ?? []} onSelect={handleCustomerSelect} disabledCustomer={order.deposit > 0} /><OrderItemsEditor items={items} setItems={setItems} products={products} /><div className="grid gap-4 lg:grid-cols-[1fr_320px]"><DateNotesEditor form={form} setForm={setForm} /><div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><div className="flex justify-between"><span className="font-semibold">الإجمالي</span><span className="font-black text-xl text-indigo-700">{money(total)}</span></div><div className="flex justify-between text-sm mt-3"><span>العربون المحفوظ</span><span>{money(order.deposit)}</span></div><div className="flex justify-between text-sm mt-1"><span>المتبقي</span><span className="font-bold text-amber-700">{money(Math.max(0, total - order.deposit))}</span></div></div></div></div><div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 lg:px-5"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary">إلغاء</button><button type="submit" disabled={saving} className="btn-primary min-w-40 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button></div></form></OrderFormShell>;
}

type FormState = { customerName: string; customerPhone: string; customerId: string; expectedDate: string; notes: string; deposit: string };

function CustomerEditor({ form, setForm, customers, onSelect, disabledCustomer = false }: { form: FormState; setForm: (form: FormState) => void; customers: Array<{ _id: Id<"customers">; name: string; phone: string }>; onSelect: (value: string) => void; disabledCustomer?: boolean }) {
  const customerOptions: SearchableComboboxOption[] = customers.map((customer) => ({ value: String(customer._id), label: customer.name, description: customer.phone, searchText: `${customer.name} ${customer.phone}` }));
  return <section className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="order-customer-editor">
    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-black text-slate-800">العميل</p><p className="mt-0.5 text-xs text-slate-500">اكتب جزءًا من الاسم أو رقم الهاتف للوصول للعميل مباشرة.</p></div>{form.customerId && <span className="badge badge-success">عميل مسجل</span>}</div>
    <SearchableCombobox testId="order-customer-combobox" disabled={disabledCustomer} value={form.customerId} onChange={onSelect} options={customerOptions} placeholder="ابحث باسم العميل أو رقم الهاتف..." emptyText="لا يوجد عميل مطابق" />
    {disabledCustomer && <p className="text-xs text-amber-700 mt-2">لا يمكن تغيير العميل بعد تسجيل عربون.</p>}
    {form.customerId ? <div className="mt-3 grid gap-2 rounded-xl bg-emerald-50 px-4 py-3 sm:grid-cols-2"><div><p className="text-[11px] font-bold text-emerald-700">اسم العميل</p><p className="mt-1 font-black text-slate-800">{form.customerName}</p></div><div><p className="text-[11px] font-bold text-emerald-700">رقم الهاتف</p><p className="mt-1 font-mono font-bold text-slate-800" dir="ltr">{form.customerPhone || "—"}</p></div></div> : <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className="form-label">اسم العميل *</label><input disabled={disabledCustomer} className="form-input disabled:bg-slate-100" placeholder="عميل غير مسجل" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} /></div><div><label className="form-label">رقم الهاتف</label><input disabled={disabledCustomer} className="form-input disabled:bg-slate-100" placeholder="01xxxxxxxxx" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} /></div></div>}
  </section>;
}

function DateNotesEditor({ form, setForm }: { form: FormState; setForm: (form: FormState) => void }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="mb-3 font-black text-slate-800">التسليم والملاحظات</p><div className="grid gap-3 sm:grid-cols-2"><div><label className="form-label">تاريخ التسليم المتوقع</label><input className="form-input" type="date" value={form.expectedDate} onChange={(event) => setForm({ ...form, expectedDate: event.target.value })} /></div><div className="sm:col-span-2"><label className="form-label">ملاحظات أمر البيع</label><textarea className="form-input min-h-20" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="أي ملاحظات تخص التجهيز أو التسليم..." /></div></div></div>;
}

function OrderFormShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"><div className="flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-2xl"><div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 lg:px-5"><div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><ShoppingCart className="w-5 h-5 text-indigo-600" />{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="إغلاق"><X className="w-4 h-4" /></button></div>{children}</div></div>;
}
