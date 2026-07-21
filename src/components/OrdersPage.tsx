import { FinancialHistory } from "./FinancialHistory";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";
import {
  ShoppingCart, Plus, X, Search,
  Clock, CheckCircle, Package, Truck, XCircle,
  CreditCard, Trash2, MessageCircle, Printer
} from "lucide-react";
import { PrintModal } from "./PrintTemplate";
import { buildEgyptWhatsAppUrl } from "../lib/utils";
import { getErrorMessage } from "../lib/errors";

// ─── WhatsApp helper ───────────────────────────────────────────────────────────
function buildWhatsAppLink(phone: string, message: string) {
  return buildEgyptWhatsAppUrl(phone, message);
}

function getWhatsAppMessage(
  status: string,
  orderNumber: string,
  customerName: string,
  storeName: string,
  remaining: number
): string {
  const greeting = `السلام عليكم ${customerName} 👋`;
  const store = `*${storeName}*`;
  const ordNum = `رقم الطلب: *${orderNumber}*`;

  switch (status) {
    case "confirmed":
      return `${greeting}\n\nنود إعلامكم بأن طلبكم لدى ${store} قد تم تأكيده ✅\n${ordNum}\n\nسنقوم بإشعاركم فور جاهزية الطلب. شكراً لثقتكم 🙏`;
    case "ready":
      return `${greeting}\n\nيسعدنا إعلامكم بأن طلبكم لدى ${store} أصبح جاهزاً للاستلام 🎉\n${ordNum}\n${remaining > 0 ? `\nالمبلغ المتبقي: *${remaining.toLocaleString("ar-EG")} ج.م*\n` : ""}\nيمكنكم التفضل باستلامه في أي وقت خلال أوقات الدوام. شكراً لكم 😊`;
    case "delivered":
      return `${greeting}\n\nشكراً لزيارتكم ${store} 🌟\n${ordNum}\n\nنتمنى أن تكونوا راضين عن خدمتنا. يسعدنا دائماً خدمتكم 💙`;
    case "cancelled":
      return `${greeting}\n\nنأسف لإعلامكم بأنه تم إلغاء طلبكم لدى ${store}\n${ordNum}\n\nللاستفسار أو إعادة الطلب، يرجى التواصل معنا. نعتذر عن أي إزعاج 🙏`;
    default:
      return `${greeting}\n\nتحديث على طلبكم لدى ${store}\n${ordNum}`;
  }
}

type OrderStatus = "pending" | "confirmed" | "ready" | "delivered" | "cancelled";

const statusConfig: Record<OrderStatus, { label: string; badge: string; icon: React.ElementType }> = {
  pending:   { label: "قيد الانتظار", badge: "badge badge-warning",  icon: Clock },
  confirmed: { label: "مؤكد",         badge: "badge badge-info",     icon: CheckCircle },
  ready:     { label: "جاهز",          badge: "badge badge-purple",   icon: Package },
  delivered: { label: "تم التسليم",    badge: "badge badge-success",  icon: Truck },
  cancelled: { label: "ملغي",          badge: "badge badge-danger",   icon: XCircle },
};

const statusFlow: OrderStatus[] = ["pending", "confirmed", "ready", "delivered"];

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

const emptyItem = (): OrderItem => ({ productName: "", quantity: 1, unitPrice: 0 });

export function OrdersPage() {
  const canCreate = usePermission("create_orders");
  const canEdit = usePermission("edit_orders");
  const canDelete = usePermission("delete_orders");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Id<"orders"> | null>(null);
  const [showPayment, setShowPayment] = useState<Id<"orders"> | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [printOrder, setPrintOrder] = useState<any>(null);

  const orders = useQuery(api.orders.list, filterStatus !== "all" ? { status: filterStatus } : {});
  const stats = useQuery(api.orders.stats);
  const settings = useQuery(api.settings.getPublic);
  const updateStatus = useMutation(api.orders.updateStatus);
  const addPayment = useMutation(api.orders.addPayment);
  const refundDeposit = useMutation(api.orders.refundDeposit);
  const accounts = useQuery(api.finance.collectionAccountPicker, {} as const) ?? [];
  const removeOrder = useMutation(api.orders.cancel);

  const storeName = settings?.storeName ?? "المتجر";
  const storeWhatsApp = settings?.whatsappNumber ?? "";

  const filtered = (orders ?? []).filter(o =>
    o.customerName.includes(search) ||
    o.orderNumber.includes(search) ||
    (o.customerPhone ?? "").includes(search)
  );

  const handleStatusChange = async (id: Id<"orders">, status: string) => {
    try {
      await updateStatus({ id, status });
      toast.success("تم تحديث حالة الطلب");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    }
  };

  const handlePayment = async (id: Id<"orders">) => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    try {
      if (!paymentAccountId) return toast.error("اختر الحساب المالي");
      await addPayment({ id, amount, accountId: paymentAccountId as Id<"financialAccounts">, paymentDate, requestId: crypto.randomUUID(), notes: paymentNotes || undefined });
      toast.success("تم تسجيل الدفعة بنجاح");
      setShowPayment(null);
      setPaymentAmount("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    }
  };

  const handleDelete = async (id: Id<"orders">) => {
    const reason = prompt("أدخل سبب إلغاء الطلب");
    if (!reason?.trim() || !confirm("هل أنت متأكد من إلغاء هذا الطلب؟")) return;
    try {
      await removeOrder({ id, reason });
      toast.success("تم إلغاء الطلب");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-indigo-600" />
            الأوردرات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">إدارة طلبات العملاء المسبقة</p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          أوردر جديد
        </button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "قيد الانتظار", value: stats?.pending ?? 0, color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
          { label: "مؤكدة",        value: stats?.confirmed ?? 0, color: "text-blue-600",  bg: "bg-blue-50",  icon: CheckCircle },
          { label: "جاهزة",        value: stats?.ready ?? 0,     color: "text-purple-600",bg: "bg-purple-50",icon: Package },
          { label: "مُسلَّمة",     value: stats?.delivered ?? 0, color: "text-emerald-600",bg:"bg-emerald-50",icon: Truck },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card flex items-center gap-4">
              <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
              <select className="form-input" value={paymentAccountId} onChange={e => setPaymentAccountId(e.target.value)}><option value="">اختر حساب التحصيل</option>{accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}</select>
              <input className="form-input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              <textarea className="form-input" placeholder="ملاحظات" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-9"
            placeholder="بحث بالاسم أو رقم الطلب..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { v: "all", l: "الكل" },
            { v: "pending", l: "انتظار" },
            { v: "confirmed", l: "مؤكد" },
            { v: "ready", l: "جاهز" },
            { v: "delivered", l: "مُسلَّم" },
          ].map(f => (
            <button
              key={f.v}
              onClick={() => setFilterStatus(f.v)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filterStatus === f.v
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">لا توجد أوردرات</p>
            <p className="text-slate-400 text-sm mt-1">أضف أوردراً جديداً للبدء</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>العميل</th>
                  <th>المنتجات</th>
                  <th>الإجمالي</th>
                  <th>المدفوع</th>
                  <th>المتبقي</th>
                  <th>الحالة</th>
                  <th>التاريخ المتوقع</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const cfg = statusConfig[order.status as OrderStatus] ?? statusConfig.pending;
                  const Icon = cfg.icon;
                  const currentIdx = statusFlow.indexOf(order.status as OrderStatus);
                  const nextStatus = currentIdx >= 0 && currentIdx < statusFlow.length - 1
                    ? statusFlow[currentIdx + 1] : null;

                  // WhatsApp
                  const hasPhone = !!(order.customerPhone);
                  const waStatuses = ["confirmed", "ready", "delivered", "cancelled"];
                  const showWA = hasPhone && waStatuses.includes(order.status);
                  const waLink = hasPhone
                    ? buildWhatsAppLink(
                        order.customerPhone!,
                        getWhatsAppMessage(order.status, order.orderNumber, order.customerName, storeName, order.remaining)
                      )
                    : null;

                  return (
                    <tr key={order._id}>
                      <td>
                        <span className="font-mono font-bold text-indigo-600 text-xs">{order.orderNumber}<FinancialHistory referenceType="order" referenceId={String(order._id)} /></span>
                      </td>
                      <td>
                        <p className="font-medium text-slate-800">{order.customerName}</p>
                        {order.customerPhone && (
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            {order.customerPhone}
                          </p>
                        )}
                      </td>
                      <td>
                        <p className="text-slate-700">{order.items.length} منتج</p>
                        <p className="text-xs text-slate-400 truncate max-w-32">
                          {order.items.map(i => i.productName).join("، ")}
                        </p>
                      </td>
                      <td className="font-bold text-slate-800">{order.total.toLocaleString("ar-EG")} ج.م</td>
                      <td className="text-emerald-600 font-medium">{order.deposit.toLocaleString("ar-EG")} ج.م</td>
                      <td>
                        <span className={`font-bold ${order.remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {order.remaining.toLocaleString("ar-EG")} ج.م
                        </span>
                      </td>
                      <td>
                        <span className={cfg.badge}>
                          <Icon className="w-3 h-3 ml-1" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="text-slate-500 text-xs">{order.expectedDate ?? "—"}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {canEdit && nextStatus && order.status !== "cancelled" && (
                            <button
                              onClick={() => handleStatusChange(order._id, nextStatus)}
                              className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors whitespace-nowrap"
                            >
                              {statusConfig[nextStatus].label}
                            </button>
                          )}
                          {canEdit && order.remaining > 0 && order.status !== "cancelled" && (
                            <button
                              onClick={() => { setShowPayment(order._id); setPaymentAmount(""); }}
                              className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                              title="تسجيل دفعة"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {/* WhatsApp notification button */}
                          {showWA && waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                              title={`إرسال إشعار واتساب — ${cfg.label}`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {!hasPhone && order.status !== "pending" && (
                            <span
                              className="p-1.5 bg-slate-50 text-slate-300 rounded-lg cursor-not-allowed"
                              title="لا يوجد رقم هاتف للعميل"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {canEdit && order.status !== "delivered" && (
                            <button
                              onClick={() => handleStatusChange(order._id, "cancelled")}
                              className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                              title="إلغاء"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setPrintOrder(order)}
                            className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            title="طباعة إيصال"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {canDelete && <button
                            onClick={() => handleDelete(order._id)}
                            className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="إلغاء"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                تسجيل دفعة
              </h2>
              <button onClick={() => setShowPayment(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="form-label">المبلغ المدفوع (ج.م)</label>
                <input
                  className="form-input text-center text-xl font-bold"
                  type="number"
                  placeholder="0"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPayment(null)} className="btn-secondary flex-1">إلغاء</button>
                <button onClick={() => handlePayment(showPayment)} className="btn-success flex-1">تسجيل</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Order Form */}
      {showForm && <NewOrderForm onClose={() => setShowForm(false)} />}

      {/* Print Modal */}
      {printOrder && (
        <PrintModal
          type="order"
          data={printOrder}
          onClose={() => setPrintOrder(null)}
        />
      )}
    </div>
  );
}

function NewOrderForm({ onClose }: { onClose: () => void }) {
  const createOrder = useMutation(api.orders.create);
  const customers = useQuery(api.customers.list);
  const canCollect = usePermission("record_collections");
  const accounts = useQuery(api.finance.collectionAccountPicker, canCollect ? {} : "skip") ?? [];
  const [accountId, setAccountId] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerId: "" as string,
    expectedDate: "",
    notes: "",
    deposit: "",
  });
  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleCustomerSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) { setForm({ ...form, customerId: "", customerName: "", customerPhone: "" }); return; }
    const c = customers?.find(c => c._id === id);
    if (c) setForm({ ...form, customerId: id, customerName: c.name, customerPhone: c.phone });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.customerName.trim()) { toast.error("أدخل اسم العميل"); return; }
    if (items.some(i => !i.productName.trim())) { toast.error("أدخل اسم المنتج لكل عنصر"); return; }
    if (total === 0) { toast.error("أضف منتجاً واحداً على الأقل بسعر"); return; }
    const deposit = parseFloat(form.deposit) || 0;
    if (deposit > total) { toast.error("العربون أكبر من الإجمالي"); return; }
    if (deposit > 0 && !accountId) { toast.error("اختر حساب تحصيل العربون"); return; }
    setSaving(true);
    try {
      await createOrder({
        customerName: form.customerName,
        customerPhone: form.customerPhone || undefined,
        customerId: form.customerId ? form.customerId as Id<"customers"> : undefined,
        items: items.map(i => ({
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          notes: i.notes || undefined,
        })),
        total,
        creationRequestId: requestId,
        initialDeposit: deposit > 0 ? { amount: deposit, accountId: accountId as Id<"financialAccounts">, paymentDate: new Date().toISOString().slice(0, 10), requestId } : undefined,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
      });
      toast.success("تم إنشاء الأوردر بنجاح");
      setRequestId(crypto.randomUUID());
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "تعذر إنشاء الطلب"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl z-10">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            أوردر جديد
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Customer */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">بيانات العميل</p>
            <div>
              <label className="form-label">اختر عميلاً (اختياري)</label>
              <select className="form-input" value={form.customerId} onChange={handleCustomerSelect}>
                <option value="">— عميل جديد —</option>
                {(customers ?? []).map(c => (
                  <option key={c._id} value={c._id}>{c.name} — {c.phone}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">اسم العميل *</label>
                <input className="form-input" value={form.customerName}
                  onChange={e => setForm({ ...form, customerName: e.target.value })} placeholder="اسم العميل" />
              </div>
              <div>
                <label className="form-label">رقم الهاتف</label>
                <input className="form-input" value={form.customerPhone}
                  onChange={e => setForm({ ...form, customerPhone: e.target.value })} placeholder="01xxxxxxxxx" />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">المنتجات المطلوبة</p>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium hover:text-indigo-700">
                <Plus className="w-4 h-4" />
                إضافة منتج
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">منتج {idx + 1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)}
                      className="p-1 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3 sm:col-span-1">
                    <input className="form-input" placeholder="اسم المنتج *" value={item.productName}
                      onChange={e => updateItem(idx, "productName", e.target.value)} />
                  </div>
                  <div>
                    <input className="form-input text-center" type="number" placeholder="الكمية" min="1"
                      value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div>
                    <input className="form-input text-center" type="number" placeholder="السعر" min="0"
                      value={item.unitPrice || ""} onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))} />
                  </div>
                </div>
                <input className="form-input text-sm" placeholder="ملاحظات (اختياري)" value={item.notes ?? ""}
                  onChange={e => updateItem(idx, "notes", e.target.value)} />
                <div className="text-left text-sm font-bold text-indigo-600">
                  {(item.quantity * item.unitPrice).toLocaleString("ar-EG")} ج.م
                </div>
              </div>
            ))}
          </div>

          {/* Financial */}
          <div className="bg-indigo-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">الإجمالي</span>
              <span className="font-black text-xl text-indigo-700">{total.toLocaleString("ar-EG")} ج.م</span>
            </div>
            <div>
              <label className="form-label">العربون / الدفعة الأولى (ج.م)</label>
              <input className="form-input" type="number" placeholder="0" min="0" disabled={!canCollect}
                value={form.deposit} onChange={e => setForm({ ...form, deposit: e.target.value })} />
              {canCollect && Number(form.deposit) > 0 && <select className="form-input mt-2" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">اختر حساب التحصيل</option>{accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}</select>}
              {!canCollect && <p className="text-xs text-amber-700">يسجل مسؤول التحصيل العربون لاحقاً.</p>}
            </div>
            {form.deposit && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">المتبقي</span>
                <span className="font-bold text-amber-600">
                  {Math.max(0, total - parseFloat(form.deposit || "0")).toLocaleString("ar-EG")} ج.م
                </span>
              </div>
            )}
          </div>

          {/* Dates & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">تاريخ التسليم المتوقع</label>
              <input className="form-input" type="date" value={form.expectedDate}
                onChange={e => setForm({ ...form, expectedDate: e.target.value })} />
            </div>
            <div>
              <label className="form-label">ملاحظات</label>
              <input className="form-input" placeholder="ملاحظات إضافية" value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">حفظ الأوردر</button>
          </div>
        </form>
      </div>
    </div>
  );
}
