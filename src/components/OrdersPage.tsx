import { useEffect, useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Clock,
  CreditCard,
  Eye,
  FileText,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  ORDER_TRANSITIONS,
  normalizeOrderStatus,
  orderStatusLabel,
  type CanonicalOrderStatus,
} from "../../shared/businessRules";
import { decodeOrderOperationalMeta } from "../../shared/orderOperationalMeta";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { buildEgyptWhatsAppUrl, useCurrency } from "../lib/utils";
import { FinancialHistory } from "./FinancialHistory";
import { SearchableCombobox, type SearchableComboboxOption } from "./SearchableCombobox";

type OrderStatus = CanonicalOrderStatus;
type IntakeItem = { productId: string; quantity: number; notes?: string };
type OrderProduct = { _id: Id<"products">; name: string; sku: string; barcode?: string; stock: number; isActive?: boolean };
type IntakeForm = {
  customerId: string;
  expectedDate: string;
  internalNotes: string;
  customerAddress: string;
  deliveryAddress: string;
  shippingCompany: string;
  deliveryNotes: string;
  deposit: string;
};

type CollectionDraft = {
  order: Doc<"orders">;
  status: "delivered_to_customer" | "received";
  amount: string;
  accountId: string;
  date: string;
  notes: string;
  reason: string;
  requestId: string;
};

const statusTone: Record<OrderStatus, string> = {
  pending: "badge badge-warning",
  confirmed: "badge badge-info",
  preparing: "badge badge-info",
  ready: "badge badge-purple",
  delivered_to_customer: "badge badge-success",
  handed_to_shipping: "badge badge-info",
  received: "badge badge-success",
  cancelled: "badge badge-danger",
};

const statusIcon: Record<OrderStatus, React.ElementType> = {
  pending: Clock,
  confirmed: CheckCircle,
  preparing: Package,
  ready: Package,
  delivered_to_customer: CheckCircle,
  handed_to_shipping: Truck,
  received: Truck,
  cancelled: XCircle,
};

const filterOptions: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all", label: "كل الحالات" },
  { value: "pending", label: "قيد الانتظار" },
  { value: "confirmed", label: "مؤكد" },
  { value: "preparing", label: "جاري التجهيز" },
  { value: "ready", label: "تم التجهيز" },
  { value: "handed_to_shipping", label: "تم التسليم لشركة الشحن" },
  { value: "delivered_to_customer", label: "تم التسليم للعميل" },
  { value: "received", label: "تم الاستلام" },
  { value: "cancelled", label: "ملغي" },
];

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function itemPriced(item: { unitPrice: number }) {
  return Number.isFinite(item.unitPrice) && item.unitPrice >= 0;
}

export function OrdersPage({ createRequestToken }: { createRequestToken?: number }) {
  const { formatCurrency } = useCurrency();
  const canCreate = usePermission("create_order_intake");
  const canEditIntake = usePermission("edit_order_intake");
  const canPrice = usePermission("price_orders");
  const canEditStatus = usePermission("edit_orders");
  const canCollect = usePermission("record_collections");
  const canCancel = usePermission("delete_orders");
  const canRefund = usePermission("refund_collections");
  const canPrint = usePermission("print_orders");

  const [filterStatus, setFilterStatus] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"all" | "today" | "week" | "month">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editOrder, setEditOrder] = useState<Doc<"orders"> | null>(null);
  const [priceOrder, setPriceOrder] = useState<Doc<"orders"> | null>(null);
  const [detailsId, setDetailsId] = useState<Id<"orders"> | null>(null);
  const [actionsId, setActionsId] = useState<Id<"orders"> | null>(null);
  const [transitionOrder, setTransitionOrder] = useState<Doc<"orders"> | null>(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [collection, setCollection] = useState<CollectionDraft | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Doc<"orders"> | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelDisposition, setCancelDisposition] = useState<"customer_credit" | "refund">("customer_credit");
  const [cancelRequestId, setCancelRequestId] = useState(uuid);
  const [printId, setPrintId] = useState<Id<"orders"> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (createRequestToken && canCreate) setShowCreate(true);
  }, [createRequestToken, canCreate]);

  useEffect(() => {
    if (!actionsId) return;
    const close = () => setActionsId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [actionsId]);

  const { results: orders, status: paginationStatus, loadMore } = usePaginatedQuery(
    api.orderPagination.list,
    filterStatus === "all" ? {} : { status: filterStatus },
    { initialNumItems: 25 },
  );
  const stats = useQuery(api.operationStatusDashboard.orderCounts, {});
  const details = useQuery(api.orders.details, detailsId ? { id: detailsId } : "skip");
  const prep = useQuery(api.orderLifecycle.preparationOrder, printId ? { id: printId } : "skip");
  const collectionAccounts = useQuery(api.finance.collectionAccountPicker, canCollect && collection ? {} : "skip") ?? [];
  const transition = useMutation(api.orderLifecycle.transition);
  const cancel = useMutation(api.orderLifecycle.cancel);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ar-EG");
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start = period === "today" ? todayStart
      : period === "week" ? todayStart - 6 * 86_400_000
        : period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
          : 0;
    return orders.filter(order => {
      if (start && order._creationTime < start) return false;
      if (!needle) return true;
      return order.orderNumber.toLocaleLowerCase("ar-EG").includes(needle)
        || order.customerName.toLocaleLowerCase("ar-EG").includes(needle)
        || (order.customerPhone ?? "").includes(needle);
    });
  }, [orders, period, search]);

  const performTransition = async (order: Doc<"orders">, status: OrderStatus, reason?: string) => {
    if (busy) return;
    if (status === "cancelled") {
      setCancelOrder(order);
      setCancelReason("");
      setCancelDisposition("customer_credit");
      setCancelRequestId(uuid());
      return;
    }
    if (status === "delivered_to_customer" || status === "received") {
      if (order.remaining > 0) {
        setCollection({ order, status, amount: String(order.remaining), accountId: "", date: today(), notes: "", reason: reason ?? "", requestId: uuid() });
        return;
      }
    }
    setBusy(true);
    try {
      await transition({ id: order._id, status, reason: reason?.trim() || undefined, requestId: uuid() });
      toast.success(`تم تغيير الحالة إلى ${orderStatusLabel(status)}`);
      setTransitionOrder(null);
      setTransitionReason("");
      setActionsId(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تغيير حالة الطلب"));
    } finally {
      setBusy(false);
    }
  };

  const submitCollection = async () => {
    if (!collection || busy) return;
    const amount = Number(collection.amount);
    if (!Number.isFinite(amount) || amount !== collection.order.remaining) return toast.error("يجب تحصيل كامل المتبقي");
    if (!collection.accountId) return toast.error("اختر الخزنة أو الحساب");
    setBusy(true);
    try {
      await transition({
        id: collection.order._id,
        status: collection.status,
        reason: collection.reason.trim() || undefined,
        requestId: uuid(),
        collection: {
          amount,
          accountId: collection.accountId as Id<"financialAccounts">,
          paymentDate: collection.date,
          requestId: collection.requestId,
          notes: collection.notes.trim() || undefined,
        },
      });
      toast.success("تم التحصيل وإغلاق مرحلة التسليم بنجاح");
      setCollection(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحصيل المتبقي"));
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = async () => {
    if (!cancelOrder || busy || !cancelReason.trim()) return;
    const requiresDisposition = cancelOrder.deposit > 0 || Boolean(cancelOrder.linkedInvoiceId);
    setBusy(true);
    try {
      await cancel({
        id: cancelOrder._id,
        reason: cancelReason.trim(),
        disposition: requiresDisposition ? cancelDisposition : undefined,
        date: today(),
        requestId: cancelRequestId,
      });
      toast.success("تم إلغاء الطلب ومعالجة آثاره");
      setCancelOrder(null);
      setCancelRequestId(uuid());
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إلغاء الطلب"));
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = () => {
    setFilterStatus("all");
    setPeriod("all");
    setSearch("");
  };

  return (
    <div className="space-y-4 p-3 lg:p-4" data-testid="orders-page">
      <header className="erp-page-header gap-3 px-4 py-3">
        <div className="min-w-0">
          <span className="erp-kicker">المبيعات</span>
          <h1 className="erp-page-title"><ShoppingCart className="h-5 w-5 text-[var(--erp-accent)]" />طلبات البيع</h1>
          <p className="erp-page-subtitle">إدخال بدون تسعير بواسطة خدمة العملاء، ثم تسعير وتأكيد وتجهيز وتسليم محكوم.</p>
        </div>
        {canCreate && <button data-testid="order-create-open" className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />طلب بيع جديد</button>}
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7" data-testid="orders-summary-strip">
        {[
          ["قيد الانتظار", stats?.pending ?? 0, Clock],
          ["مؤكد", stats?.confirmed ?? 0, CheckCircle],
          ["جاري التجهيز", stats?.preparing ?? 0, Package],
          ["تم التجهيز", stats?.ready ?? 0, Package],
          ["لدى شركة الشحن", stats?.handed_to_shipping ?? 0, Truck],
          ["تم التسليم", stats?.delivered_to_customer ?? 0, CheckCircle],
          ["تم الاستلام", stats?.received ?? 0, Truck],
        ].map(([label, value, Icon]) => {
          const SummaryIcon = Icon as React.ElementType;
          return <div key={String(label)} className="flex min-h-16 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5"><div><p className="text-xl font-black text-slate-800">{Number(value).toLocaleString("en-US")}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{String(label)}</p></div><SummaryIcon className="h-4 w-4 text-slate-400" /></div>;
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 xl:flex-row">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input data-testid="order-search" className="form-input h-10 pr-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث برقم الطلب أو العميل أو الهاتف..." /></div>
          <select data-testid="order-status-filter" className="form-input h-10 xl:w-52" value={filterStatus} onChange={event => setFilterStatus(event.target.value as OrderStatus | "all")}>{filterOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select data-testid="order-period-filter" className="form-input h-10 xl:w-44" value={period} onChange={event => setPeriod(event.target.value as typeof period)}><option value="all">كل الفترات</option><option value="today">اليوم</option><option value="week">آخر 7 أيام</option><option value="month">هذا الشهر</option></select>
          {(search || filterStatus !== "all" || period !== "all") && <button className="erp-action justify-center" onClick={clearFilters}><RotateCcw className="h-4 w-4" />مسح الفلاتر</button>}
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {paginationStatus === "LoadingFirstPage" ? <div className="py-14 text-center text-slate-400">جارٍ تحميل الطلبات...</div>
          : filtered.length === 0 ? <div className="py-14 text-center text-slate-400">لا توجد طلبات مطابقة</div>
            : <div className="overflow-x-auto"><table className="data-table min-w-[1100px]"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>الأصناف</th><th>القيمة</th><th>العربون</th><th>المتبقي</th><th>الحالة</th><th>المتوقع</th><th>الإجراء</th></tr></thead><tbody>{filtered.map(order => {
              const current = normalizeOrderStatus(order.status) ?? "pending";
              const Icon = statusIcon[current];
              const allowed = (ORDER_TRANSITIONS[current] ?? []).filter(status => status !== "cancelled") as OrderStatus[];
              const priced = order.items.length > 0 && order.items.every(itemPriced);
              const meta = decodeOrderOperationalMeta(order.notes);
              return <tr key={order._id} data-testid="order-row" data-order-number={order.orderNumber} data-status={current} tabIndex={0} onClick={() => setDetailsId(order._id)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setDetailsId(order._id); } }} className="cursor-pointer hover:bg-emerald-50/40">
                <td><div className="font-mono text-xs font-black text-indigo-700">{order.orderNumber}</div>{order.linkedInvoiceId && <div className="mt-1 text-[10px] font-bold text-violet-600">فاتورة مرتبطة</div>}</td>
                <td><div className="font-bold text-slate-800">{order.customerName}</div><div className="text-xs text-slate-400" dir="ltr">{order.customerPhone ?? "—"}</div></td>
                <td><div className="font-bold text-slate-700">{order.items.length} صنف</div><div className="max-w-52 truncate text-[11px] text-slate-400">{order.items.map(item => item.productName).join("، ")}</div></td>
                <td>{priced ? <span className="font-black">{formatCurrency(order.total)}</span> : <span className="badge badge-warning">بانتظار التسعير</span>}</td>
                <td className="font-bold text-emerald-700">{formatCurrency(order.deposit)}</td>
                <td className="font-black text-amber-700">{priced ? formatCurrency(order.remaining) : "—"}</td>
                <td><span className={statusTone[current]}><Icon className="ml-1 h-3 w-3" />{orderStatusLabel(current)}</span></td>
                <td className="text-xs text-slate-500">{order.expectedDate ?? "—"}</td>
                <td onClick={event => event.stopPropagation()}><div className="flex items-center justify-end gap-1">
                  {current === "pending" && !priced && canPrice && <button data-testid="order-price-open" className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-black text-blue-700" onClick={() => setPriceOrder(order)}>تسعير</button>}
                  {current === "pending" && canEditIntake && !order.linkedInvoiceId && <button className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600" title="تعديل بيانات الإدخال" onClick={() => setEditOrder(order)}><Pencil className="h-3.5 w-3" /></button>}
                  <div className="relative"><button data-testid="order-action-toggle" className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700" onClick={event => { event.stopPropagation(); setActionsId(currentId => currentId === order._id ? null : order._id); }}>الإجراء <ChevronDown className="h-3 w-3" /></button>
                    {actionsId === order._id && <div data-testid="order-actions-menu" className="absolute left-0 top-9 z-50 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" onClick={event => event.stopPropagation()}>
                      {canEditStatus && allowed.map(status => <button key={status} data-status-action={status} className="flex w-full items-center rounded-lg px-3 py-2 text-right text-xs font-bold text-slate-700 hover:bg-indigo-50" onClick={() => {
                        const backwards = (current === "ready" && status === "preparing") || (current === "handed_to_shipping" && status === "ready");
                        if (backwards) { setTransitionOrder(order); setTransitionReason(""); setActionsId(null); return; }
                        void performTransition(order, status);
                      }}>{orderStatusLabel(status)}</button>)}
                      {canPrice && current === "pending" && <button className="flex w-full items-center rounded-lg px-3 py-2 text-right text-xs font-bold text-blue-700 hover:bg-blue-50" onClick={() => { setPriceOrder(order); setActionsId(null); }}>تسعير الطلب</button>}
                      {canPrint && current !== "pending" && current !== "cancelled" && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => { setPrintId(order._id); setActionsId(null); }}><Printer className="h-4 w-4" />أمر التجهيز</button>}
                      {order.customerPhone && <a className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-50" href={buildEgyptWhatsAppUrl(order.customerPhone, `متابعة طلبكم ${order.orderNumber}: ${orderStatusLabel(current)}`)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />واتساب العميل</a>}
                      {canCancel && current !== "cancelled" && current !== "received" && current !== "delivered_to_customer" && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50" onClick={() => { setCancelOrder(order); setCancelReason(""); setCancelDisposition("customer_credit"); setCancelRequestId(uuid()); setActionsId(null); }}><Trash2 className="h-4 w-4" />إلغاء الطلب</button>}
                      {meta.shippingCompany && <div className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400">شركة الشحن: {meta.shippingCompany}</div>}
                    </div>}
                  </div>
                </div></td>
              </tr>;
            })}</tbody></table></div>}
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500"><span>الظاهر: {filtered.length.toLocaleString("en-US")}</span>{paginationStatus === "CanLoadMore" && <button className="erp-action" onClick={() => loadMore(25)}>تحميل المزيد</button>}</div>
      </div>

      {showCreate && <OrderIntakeDialog onClose={() => setShowCreate(false)} />}
      {editOrder && <OrderIntakeDialog order={editOrder} onClose={() => setEditOrder(null)} />}
      {priceOrder && <PricingDialog order={priceOrder} onClose={() => setPriceOrder(null)} />}

      {transitionOrder && <Modal title={`إرجاع ${transitionOrder.orderNumber}`} onClose={() => setTransitionOrder(null)}><div className="space-y-4"><div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><AlertCircle className="mb-1 inline h-4 w-4" /> الرجوع لحالة سابقة يتطلب سببًا واضحًا في سجل المراجعة.</div><textarea className="form-input min-h-24" value={transitionReason} onChange={event => setTransitionReason(event.target.value)} placeholder="سبب الرجوع..." /><button className="btn-primary w-full" disabled={busy || !transitionReason.trim()} onClick={() => void performTransition(transitionOrder, normalizeOrderStatus(transitionOrder.status) === "handed_to_shipping" ? "ready" : "preparing", transitionReason)}>{busy ? "جارٍ التنفيذ..." : "تأكيد الرجوع"}</button></div></Modal>}

      {collection && <Modal title="تحصيل المتبقي قبل الإغلاق" onClose={() => setCollection(null)}><div className="space-y-3"><div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">المتبقي المطلوب تحصيله: <strong>{formatCurrency(collection.order.remaining)}</strong>. العربون السابق محسوب بالفعل ولن يُحصّل مرة ثانية.</div><input className="form-input" type="number" step="0.01" value={collection.amount} onChange={event => setCollection({ ...collection, amount: event.target.value })} /><select className="form-input" value={collection.accountId} onChange={event => setCollection({ ...collection, accountId: event.target.value })}><option value="">اختر الخزنة / الحساب</option>{collectionAccounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}</select><input className="form-input" type="date" value={collection.date} onChange={event => setCollection({ ...collection, date: event.target.value })} /><textarea className="form-input" value={collection.notes} onChange={event => setCollection({ ...collection, notes: event.target.value })} placeholder="مرجع أو ملاحظة التحصيل" /><button className="btn-success w-full" disabled={busy} onClick={() => void submitCollection()}>{busy ? "جارٍ التحصيل..." : "تحصيل وإتمام الحالة"}</button></div></Modal>}

      {cancelOrder && <Modal title={`إلغاء ${cancelOrder.orderNumber}`} onClose={() => setCancelOrder(null)}><div className="space-y-4"><textarea className="form-input min-h-24" value={cancelReason} onChange={event => setCancelReason(event.target.value)} placeholder="سبب الإلغاء *" />{(cancelOrder.deposit > 0 || cancelOrder.linkedInvoiceId) && <div><label className="form-label">معالجة المدفوعات</label><select className="form-input" value={cancelDisposition} onChange={event => setCancelDisposition(event.target.value as typeof cancelDisposition)}><option value="customer_credit">يظل رصيدًا مقدمًا للعميل</option>{canRefund && <option value="refund">رد المدفوعات من الخزائن الأصلية</option>}</select></div>}<button className="btn-danger w-full" disabled={busy || !cancelReason.trim()} onClick={() => void submitCancel()}>{busy ? "جارٍ الإلغاء..." : "إلغاء ومعالجة الآثار"}</button></div></Modal>}

      {detailsId && <Modal title="تفاصيل طلب البيع" onClose={() => setDetailsId(null)} wide><div className="space-y-5">{!details ? <div className="py-8 text-center text-slate-400">جارٍ التحميل...</div> : <><div className="grid gap-3 sm:grid-cols-4"><Info label="رقم الطلب" value={details.order.orderNumber} /><Info label="العميل" value={details.order.customerName} /><Info label="الإجمالي" value={details.order.items.every(itemPriced) ? formatCurrency(details.order.total) : "بانتظار التسعير"} /><Info label="المتبقي" value={details.order.items.every(itemPriced) ? formatCurrency(details.order.remaining) : "—"} /></div><div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><FileText className="h-4 w-4" />الفاتورة المرتبطة</h3>{details.invoice ? <div className="text-sm"><p className="font-mono font-bold text-indigo-700">{details.invoice.invoiceNumber}</p><p>الإجمالي: {formatCurrency(details.invoice.total)}</p><p>المدفوع: {formatCurrency(details.invoice.paid)}</p><p>المتبقي: {formatCurrency(details.invoice.remaining)}</p></div> : <p className="text-sm text-slate-400">تُنشأ الفاتورة مرة واحدة عند التأكيد.</p>}</div><div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><Truck className="h-4 w-4" />الشحن</h3>{details.deliveries.length ? details.deliveries.map(delivery => <div key={delivery._id} className="mb-2 rounded-lg bg-slate-50 p-2 text-sm">{delivery.deliveryNumber} — {delivery.shippingCompany} — {delivery.status}</div>) : <p className="text-sm text-slate-400">لا توجد عمليات شحن مرتبطة.</p>}</div></div><div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 font-black">الحركات المالية</h3><FinancialHistory referenceType="order" referenceId={String(details.order._id)} /></div><div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 font-black">التسلسل الزمني</h3>{details.timeline.map(event => <div key={event.key} className="mb-3 flex gap-3 text-sm"><span className="mt-2 h-2 w-2 rounded-full bg-indigo-500" /><div className="flex-1"><div className="flex justify-between"><strong>{event.title}</strong><span className="text-xs text-slate-400">{event.date}</span></div><p className="text-xs text-slate-500">{event.description}</p></div></div>)}</div></>}</div></Modal>}

      {printId && <PreparationPrintModal data={prep} onClose={() => setPrintId(null)} />}
    </div>
  );
}

function OrderIntakeDialog({ order, onClose }: { order?: Doc<"orders">; onClose: () => void }) {
  const create = useMutation(api.orderIntake.create);
  const update = useMutation(api.orderIntake.update);
  const customers = useQuery(api.customers.list, {}) ?? [];
  const products = (useQuery(api.products.list, {}) ?? []) as OrderProduct[];
  const canDeposit = usePermission("record_order_deposits");
  const accounts = useQuery(api.orderIntake.depositAccounts, canDeposit && !order ? {} : "skip") ?? [];
  const existingMeta = decodeOrderOperationalMeta(order?.notes);
  const [form, setForm] = useState<IntakeForm>(() => ({
    customerId: order?.customerId ? String(order.customerId) : "",
    expectedDate: order?.expectedDate ?? "",
    internalNotes: existingMeta.internalNotes ?? "",
    customerAddress: existingMeta.customerAddress ?? "",
    deliveryAddress: existingMeta.deliveryAddress ?? "",
    shippingCompany: existingMeta.shippingCompany ?? "",
    deliveryNotes: existingMeta.deliveryNotes ?? "",
    deposit: "",
  }));
  const [items, setItems] = useState<IntakeItem[]>(() => order ? order.items.map(item => ({ productId: item.productId ? String(item.productId) : "", quantity: item.quantity, notes: item.notes })) : [{ productId: "", quantity: 1 }]);
  const [accountId, setAccountId] = useState("");
  const [requestId, setRequestId] = useState(uuid);
  const [saving, setSaving] = useState(false);

  const activeProducts = products.filter(product => product.isActive !== false);
  const customerOptions: SearchableComboboxOption[] = customers.map(customer => ({ value: String(customer._id), label: customer.name, description: customer.phone, searchText: `${customer.name} ${customer.phone}` }));
  const accountOptions: SearchableComboboxOption[] = accounts.map(account => ({ value: String(account._id), label: account.name, description: account.type, searchText: `${account.name} ${account.type}` }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const selected = items.filter(item => item.productId);
    if (!form.customerId) return toast.error("اختر عميلًا مسجلًا");
    if (!selected.length) return toast.error("أضف صنفًا واحدًا على الأقل");
    if (selected.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0)) return toast.error("راجع الكميات");
    const deposit = Number(form.deposit || 0);
    if (!order && deposit > 0 && (!canDeposit || !accountId)) return toast.error("اختر خزنة استلام العربون");
    setSaving(true);
    try {
      const common = {
        customerId: form.customerId as Id<"customers">,
        items: selected.map(item => ({ productId: item.productId as Id<"products">, quantity: item.quantity, notes: item.notes?.trim() || undefined })),
        expectedDate: form.expectedDate || undefined,
        internalNotes: form.internalNotes.trim() || undefined,
        customerAddress: form.customerAddress.trim() || undefined,
        deliveryAddress: form.deliveryAddress.trim() || undefined,
        shippingCompany: form.shippingCompany.trim() || undefined,
        deliveryNotes: form.deliveryNotes.trim() || undefined,
      };
      if (order) {
        await update({ id: order._id, ...common, requestId });
        toast.success("تم تحديث بيانات الطلب وإعادته للتسعير");
      } else {
        await create({ ...common, creationRequestId: requestId, initialDeposit: deposit > 0 ? { amount: deposit, accountId: accountId as Id<"financialAccounts">, paymentDate: today(), requestId: `${requestId}:deposit` } : undefined });
        toast.success("تم إنشاء طلب البيع وإضافته للمتابعة");
      }
      setRequestId(uuid());
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر حفظ طلب البيع"));
    } finally {
      setSaving(false);
    }
  };

  const productOptions = activeProducts.map(product => ({ value: String(product._id), label: product.name, description: `${product.sku}${product.barcode ? ` — ${product.barcode}` : ""} — متاح ${product.stock}`, searchText: `${product.name} ${product.sku} ${product.barcode ?? ""}` }));

  return <Modal title={order ? `تعديل بيانات ${order.orderNumber}` : "طلب بيع جديد — إدخال خدمة العملاء"} onClose={onClose} wide><form onSubmit={submit} className="space-y-4"><div className="rounded-xl bg-cyan-50 p-3 text-sm font-bold text-cyan-800">هذه الشاشة لا تعرض ولا تقبل أسعار بيع. التسعير مسؤولية المبيعات في خطوة مستقلة.</div><div><label className="form-label">العميل *</label><SearchableCombobox value={form.customerId} onChange={value => setForm({ ...form, customerId: value })} options={customerOptions} placeholder="ابحث باسم العميل أو الهاتف..." /></div><section className="rounded-xl border border-slate-200"><div className="flex items-center justify-between border-b border-slate-100 p-3"><strong>الأصناف والكميات</strong><button type="button" className="erp-action" onClick={() => setItems([...items, { productId: "", quantity: 1 }])}><Plus className="h-4 w-4" />صنف</button></div><div className="divide-y divide-slate-100">{items.map((item, index) => <div key={index} data-testid="order-intake-item" className="grid gap-2 p-3 md:grid-cols-[1fr_120px_1fr_42px]"><SearchableCombobox value={item.productId} onChange={value => setItems(items.map((row, rowIndex) => rowIndex === index ? { ...row, productId: value } : row))} options={productOptions} placeholder="الصنف..." /><input data-testid="order-intake-quantity" className="form-input" type="number" min="1" value={item.quantity} onChange={event => setItems(items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row))} /><input className="form-input" value={item.notes ?? ""} onChange={event => setItems(items.map((row, rowIndex) => rowIndex === index ? { ...row, notes: event.target.value } : row))} placeholder="ملاحظة الصنف" /><button type="button" className="grid h-10 w-10 place-items-center text-red-500" disabled={items.length === 1} onClick={() => setItems(items.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></button></div>)}</div></section><div className="grid gap-3 md:grid-cols-2"><Field label="تاريخ التسليم المتوقع"><input className="form-input" type="date" value={form.expectedDate} onChange={event => setForm({ ...form, expectedDate: event.target.value })} /></Field><Field label="شركة الشحن"><input className="form-input" value={form.shippingCompany} onChange={event => setForm({ ...form, shippingCompany: event.target.value })} /></Field><Field label="عنوان العميل"><input className="form-input" value={form.customerAddress} onChange={event => setForm({ ...form, customerAddress: event.target.value })} /></Field><Field label="عنوان التسليم"><input className="form-input" value={form.deliveryAddress} onChange={event => setForm({ ...form, deliveryAddress: event.target.value })} /></Field><Field label="ملاحظات التسليم"><textarea className="form-input min-h-20" value={form.deliveryNotes} onChange={event => setForm({ ...form, deliveryNotes: event.target.value })} /></Field><Field label="ملاحظات داخلية لفريق العمل"><textarea data-testid="order-internal-notes" className="form-input min-h-20" value={form.internalNotes} onChange={event => setForm({ ...form, internalNotes: event.target.value })} /></Field></div>{!order && canDeposit && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="grid gap-3 md:grid-cols-2"><Field label="العربون (اختياري)"><input data-testid="order-deposit" className="form-input bg-white" type="number" min="0" step="0.01" value={form.deposit} onChange={event => setForm({ ...form, deposit: event.target.value })} /></Field>{Number(form.deposit) > 0 && <Field label="الخزنة / طريقة الاستلام"><SearchableCombobox value={accountId} onChange={setAccountId} options={accountOptions} placeholder="اختر الخزنة..." /></Field>}</div></section>}<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button><button data-testid="order-intake-submit" type="submit" disabled={saving} className="btn-primary">{saving ? "جارٍ الحفظ..." : "حفظ الطلب بدون تسعير"}</button></div></form></Modal>;
}

function PricingDialog({ order, onClose }: { order: Doc<"orders">; onClose: () => void }) {
  const price = useMutation(api.orderLifecycle.price);
  const [prices, setPrices] = useState(() => order.items.map(item => ({ productId: item.productId ? String(item.productId) : "", value: item.unitPrice >= 0 ? String(item.unitPrice) : "" })));
  const [busy, setBusy] = useState(false);
  const { formatCurrency } = useCurrency();
  const subtotal = order.items.reduce((sum, item, index) => sum + item.quantity * (Number(prices[index]?.value) || 0), 0);
  const submit = async () => {
    if (prices.some(row => !row.productId || row.value === "" || Number(row.value) < 0)) return toast.error("سعّر جميع الأصناف قبل الحفظ");
    setBusy(true);
    try {
      await price({ id: order._id, prices: prices.map(row => ({ productId: row.productId as Id<"products">, unitPrice: Number(row.value) })), requestId: uuid() });
      toast.success("تم تسعير جميع أصناف الطلب");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تسعير الطلب"));
    } finally {
      setBusy(false);
    }
  };
  return <Modal title={`تسعير ${order.orderNumber}`} onClose={onClose}><div className="space-y-3"><div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">لا يمكن تأكيد الطلب قبل إدخال سعر لكل صنف. التحقق يتم في الـBackend أيضًا.</div>{order.items.map((item, index) => <div key={`${item.productName}-${index}`} className="grid grid-cols-[1fr_90px_150px] items-center gap-2 rounded-xl border border-slate-200 p-3"><div><strong>{item.productName}</strong><div className="text-xs text-slate-400">الكمية: {item.quantity}</div></div><div className="text-center font-bold">× {item.quantity}</div><input data-testid="order-price-input" className="form-input" type="number" min="0" step="0.01" value={prices[index]?.value ?? ""} onChange={event => setPrices(prices.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} placeholder="سعر البيع" /></div>)}<div className="flex justify-between rounded-xl bg-slate-50 p-3"><span>إجمالي البنود قبل الضريبة</span><strong>{formatCurrency(subtotal)}</strong></div><button data-testid="order-price-submit" className="btn-primary w-full" disabled={busy} onClick={() => void submit()}>{busy ? "جارٍ التسعير..." : "حفظ تسعير جميع الأصناف"}</button></div></Modal>;
}

function PreparationPrintModal({ data, onClose }: { data: Awaited<ReturnType<typeof useQuery<typeof api.orderLifecycle.preparationOrder>>> | undefined; onClose: () => void }) {
  if (!data) return <Modal title="أمر التجهيز" onClose={onClose}><div className="py-8 text-center text-slate-400">جارٍ تجهيز المستند...</div></Modal>;
  return <div className="fixed inset-0 z-[140] overflow-y-auto bg-slate-950/60 p-4"><div className="mx-auto max-w-3xl"><div className="mb-3 flex justify-end gap-2 print:hidden"><button className="btn-secondary" onClick={onClose}>إغلاق</button><button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة</button></div><article data-testid="preparation-order-print" className="min-h-[900px] bg-white p-8 text-slate-900 print:min-h-0 print:p-4"><header className="mb-6 border-b-2 border-slate-900 pb-4 text-center"><h1 className="text-2xl font-black">أمر تجهيز</h1><p className="mt-2 font-mono font-bold">{data.orderNumber}</p></header><div className="mb-5 grid grid-cols-2 gap-3 text-sm"><Info label="العميل" value={data.customerName} /><Info label="الهاتف" value={data.customerPhone ?? "—"} /><Info label="عنوان التسليم" value={data.deliveryAddress ?? data.customerAddress ?? "—"} /><Info label="شركة الشحن" value={data.shippingCompany ?? "—"} /></div><table className="w-full border-collapse text-sm"><thead><tr><th className="border p-2 text-right">الصنف</th><th className="border p-2">SKU / باركود</th><th className="border p-2">الكمية</th><th className="border p-2 text-right">ملاحظة</th></tr></thead><tbody>{data.items.map((item, index) => <tr key={index}><td className="border p-2 font-bold">{item.name}</td><td className="border p-2 text-center font-mono">{item.sku || "—"}</td><td className="border p-2 text-center text-lg font-black">{item.quantity}</td><td className="border p-2">{item.notes ?? "—"}</td></tr>)}</tbody></table>{(data.deliveryNotes || data.internalNotes) && <div className="mt-6 rounded-xl border p-4"><strong>ملاحظات التجهيز</strong><p className="mt-2 whitespace-pre-wrap text-sm">{[data.deliveryNotes, data.internalNotes].filter(Boolean).join("\n")}</p></div>}<p className="mt-8 text-center text-xs font-bold text-slate-500">هذا المستند تشغيلي ولا يحتوي على أسعار أو تكلفة أو ربح أو إجماليات مالية.</p></article></div></div>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"><div className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "max-w-5xl" : "max-w-xl"}`}><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-black text-slate-900">{title}</h2><button className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100" onClick={onClose}><X className="h-4 w-4" /></button></header><div className="overflow-y-auto p-5">{children}</div></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="form-label">{label}</span>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>;
}
