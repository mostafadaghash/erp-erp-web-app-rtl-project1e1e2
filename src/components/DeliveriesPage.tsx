import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import {
  Truck, Plus, Search, X, Package, MapPin, Phone,
  CheckCircle, Clock, RotateCcw, XCircle, Send,
  ChevronDown, Eye, Trash2, Edit2, DollarSign
} from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

type Delivery = {
  _id: Id<"deliveries">;
  _creationTime: number;
  deliveryNumber: string;
  customerName: string;
  customerPhone: string;
  city: string;
  address: string;
  items: { productName: string; quantity: number; unitPrice: number }[];
  totalAmount: number;
  paymentMethod: string;
  codAmount?: number;
  prepaidAmount?: number;
  shippingCompany: string;
  trackingNumber?: string;
  shippingCost: number;
  status: string;
  expectedDate?: string;
  deliveredDate?: string;
  notes?: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: "في الانتظار",  color: "bg-amber-100 text-amber-700",   icon: Clock },
  shipped:   { label: "تم الشحن",     color: "bg-blue-100 text-blue-700",     icon: Send },
  delivered: { label: "تم التسليم",   color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  returned:  { label: "مرتجع",        color: "bg-red-100 text-red-700",       icon: RotateCcw },
  cancelled: { label: "ملغي",         color: "bg-slate-100 text-slate-600",   icon: XCircle },
};

const PAYMENT_LABELS: Record<string, string> = {
  cod:      "الدفع عند الاستلام",
  prepaid:  "مدفوع مسبقاً",
  partial:  "دفع جزئي",
};

const SHIPPING_COMPANIES = [
  "أرامكس", "DHL", "فيدكس", "بريد مصر", "J&T Express",
  "Bosta", "Mylerz", "Vhubs", "أخرى"
];

const CITIES = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "الشرقية",
  "القليوبية", "المنوفية", "الغربية", "كفر الشيخ", "البحيرة",
  "دمياط", "بورسعيد", "الإسماعيلية", "السويس", "الفيوم",
  "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا",
  "الأقصر", "أسوان", "البحر الأحمر", "الوادي الجديد", "مطروح",
  "شمال سيناء", "جنوب سيناء",
];

const emptyForm = {
  customerName: "",
  customerPhone: "",
  city: "",
  address: "",
  shippingCompany: "",
  trackingNumber: "",
  shippingCost: 0,
  paymentMethod: "cod",
  codAmount: 0,
  prepaidAmount: 0,
  expectedDate: "",
  notes: "",
  items: [{ productName: "", quantity: 1, unitPrice: 0 }],
};

export function DeliveriesPage() {
  const canCreate = usePermission("create_deliveries");
  const canEdit = usePermission("edit_deliveries");
  const canDelete = usePermission("delete_deliveries");
  const deliveries = useQuery(api.deliveries.list, {}) ?? [];
  const stats = useQuery(api.deliveries.getStats);
  const createDelivery = useMutation(api.deliveries.create);
  const updateStatus   = useMutation(api.deliveries.updateStatus);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewDelivery, setViewDelivery] = useState<Delivery | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Filter
  const filtered = deliveries.filter(d => {
    const matchSearch =
      d.customerName.includes(search) ||
      d.customerPhone.includes(search) ||
      d.deliveryNumber.includes(search) ||
      d.city.includes(search);
    const matchStatus = filterStatus === "all" || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalAmount = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { productName: "", quantity: 1, unitPrice: 0 }] }));
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx: number, field: string, value: string | number) =>
    setForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? { ...item, [field]: value } : item) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName || !form.city || !form.address || !form.shippingCompany) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (form.items.some(i => !i.productName)) {
      toast.error("يرجى إدخال اسم المنتج لكل عنصر");
      return;
    }
    setSaving(true);
    try {
      await createDelivery({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        city: form.city,
        address: form.address,
        items: form.items,
        totalAmount,
        paymentMethod: form.paymentMethod,
        codAmount: form.paymentMethod === "cod" ? totalAmount : form.codAmount || undefined,
        prepaidAmount: form.paymentMethod === "prepaid" ? totalAmount : form.prepaidAmount || undefined,
        shippingCompany: form.shippingCompany,
        trackingNumber: form.trackingNumber || undefined,
        shippingCost: Number(form.shippingCost),
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
      });
      toast.success("تم إنشاء الشحنة بنجاح ✅");
      setShowForm(false);
      setForm(emptyForm);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: Id<"deliveries">, status: string) => {
    try {
      const reason = status === "cancelled" || status === "returned" ? prompt("أدخل سبب الإلغاء أو الإرجاع") : undefined;
      if ((status === "cancelled" || status === "returned") && !reason?.trim()) return;
      await updateStatus({ id, status, reason });
      toast.success(`تم تحديث الحالة إلى: ${STATUS_CONFIG[status]?.label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء التحديث");
    }
  };

  const handleDelete = async (id: Id<"deliveries">) => {
    const reason = prompt("أدخل سبب إلغاء التوصيل");
    if (!reason?.trim() || !confirm("هل أنت متأكد من إلغاء التوصيل؟")) return;
    try {
      await updateStatus({ id, status: "cancelled", reason });
      toast.success("تم إلغاء التوصيل");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء الإلغاء");
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-600" />
            إدارة التوصيلات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">تتبع شحنات العملاء وحالة التوصيل</p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          شحنة جديدة
        </button>}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "الإجمالي",    value: stats.total,     color: "bg-slate-100 text-slate-700" },
            { label: "في الانتظار", value: stats.pending,   color: "bg-amber-100 text-amber-700" },
            { label: "تم الشحن",    value: stats.shipped,   color: "bg-blue-100 text-blue-700" },
            { label: "تم التسليم",  value: stats.delivered, color: "bg-emerald-100 text-emerald-700" },
            { label: "مرتجع",       value: stats.returned,  color: "bg-red-100 text-red-700" },
            { label: "COD لدى شركات الشحن", value: `${stats.codWithCarriers.toLocaleString("ar-EG")} ج.م`, color: "bg-purple-100 text-purple-700" },
            { label: "COD تمت تسويته", value: `${stats.codSettled.toLocaleString("ar-EG")} ج.م`, color: "bg-emerald-100 text-emerald-700" },
            { label: "COD معكوس", value: `${stats.codReversed.toLocaleString("ar-EG")} ج.م`, color: "bg-red-100 text-red-700" },
            { label: "رسوم شركات الشحن", value: `${stats.carrierFees.toLocaleString("ar-EG")} ج.م`, color: "bg-amber-100 text-amber-700" },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
              <p className="text-xl font-black">{s.value}</p>
              <p className="text-xs font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-9"
            placeholder="بحث بالاسم، الهاتف، رقم الشحنة، المدينة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "pending", "shipped", "delivered", "returned", "cancelled"].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                filterStatus === s
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300"
              }`}
            >
              {s === "all" ? "الكل" : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">لا توجد شحنات</p>
            <p className="text-slate-400 text-sm mt-1">أضف شحنة جديدة للبدء</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-b from-slate-50 to-slate-100 border-b border-slate-200">
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">رقم الشحنة</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">العميل</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">المدينة</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">المبلغ</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">الدفع</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">شركة الشحن</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">الحالة</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(d => {
                  const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <tr key={d._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                          {d.deliveryNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 text-sm">{d.customerName}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" />{d.customerPhone}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-sm text-slate-600">
                          <MapPin className="w-3 h-3 text-slate-400" />{d.city}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800">{d.totalAmount.toLocaleString("ar-EG")} ج.م</p>
                        {d.shippingCost > 0 && (
                          <p className="text-xs text-slate-400">شحن: {d.shippingCost} ج.م</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-slate-600">
                          {PAYMENT_LABELS[d.paymentMethod] ?? d.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-700">{d.shippingCompany}</p>
                        {d.trackingNumber && (
                          <p className="text-xs text-slate-400 font-mono">{d.trackingNumber}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className={`relative ${canEdit ? "group" : ""}`}>
                          <button className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${cfg.color} ${canEdit ? "cursor-pointer" : "cursor-default"}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {cfg.label}
                            {canEdit && <ChevronDown className="w-3 h-3" />}
                          </button>
                          {/* Status dropdown */}
                          {canEdit && <div className="absolute top-full mt-1 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-10 hidden group-hover:block min-w-36">
                            {Object.entries(STATUS_CONFIG).map(([key, val]) => {
                              const VIcon = val.icon;
                              return (
                                <button
                                  key={key}
                                  onClick={() => handleStatusChange(d._id, key)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                                    d.status === key ? "bg-slate-50 font-bold" : ""
                                  }`}
                                >
                                  <VIcon className="w-3.5 h-3.5" />
                                  {val.label}
                                </button>
                              );
                            })}
                          </div>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setViewDelivery(d as Delivery)}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="عرض التفاصيل"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canDelete && <button
                            onClick={() => handleDelete(d._id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                            title="إلغاء"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                شحنة جديدة
              </h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Customer Info */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-indigo-500" />
                  بيانات العميل
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">اسم العميل *</label>
                    <input className="form-input" value={form.customerName} onChange={e => setForm(f => ({...f, customerName: e.target.value}))} placeholder="محمد أحمد" required />
                  </div>
                  <div>
                    <label className="form-label">رقم الهاتف</label>
                    <input className="form-input" value={form.customerPhone} onChange={e => setForm(f => ({...f, customerPhone: e.target.value}))} placeholder="01xxxxxxxxx" dir="ltr" />
                  </div>
                  <div>
                    <label className="form-label">المدينة *</label>
                    <select className="form-input" value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} required>
                      <option value="">اختر المدينة</option>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">العنوان التفصيلي *</label>
                    <input className="form-input" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="الشارع، الحي، رقم المبنى" required />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-500" />
                    المنتجات
                  </h3>
                  <button type="button" onClick={addItem} className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> إضافة منتج
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        className="form-input flex-1"
                        placeholder="اسم المنتج"
                        value={item.productName}
                        onChange={e => updateItem(idx, "productName", e.target.value)}
                      />
                      <input
                        className="form-input w-16 text-center"
                        type="number" min="1"
                        placeholder="كمية"
                        value={item.quantity}
                        onChange={e => updateItem(idx, "quantity", Number(e.target.value))}
                      />
                      <input
                        className="form-input w-24"
                        type="number" min="0"
                        placeholder="السعر"
                        value={item.unitPrice}
                        onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))}
                      />
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="p-2 text-red-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-left">
                  <span className="text-sm font-bold text-slate-700">الإجمالي: </span>
                  <span className="text-lg font-black text-indigo-600">{totalAmount.toLocaleString("ar-EG")} ج.م</span>
                </div>
              </div>

              {/* Shipping & Payment */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-indigo-500" />
                  الشحن والدفع
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">شركة الشحن *</label>
                    <select className="form-input" value={form.shippingCompany} onChange={e => setForm(f => ({...f, shippingCompany: e.target.value}))} required>
                      <option value="">اختر شركة الشحن</option>
                      {SHIPPING_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">رقم التتبع</label>
                    <input className="form-input" value={form.trackingNumber} onChange={e => setForm(f => ({...f, trackingNumber: e.target.value}))} placeholder="اختياري" dir="ltr" />
                  </div>
                  <div>
                    <label className="form-label">تكلفة الشحن</label>
                    <input className="form-input" type="number" min="0" value={form.shippingCost} onChange={e => setForm(f => ({...f, shippingCost: Number(e.target.value)}))} />
                  </div>
                  <div>
                    <label className="form-label">طريقة الدفع</label>
                    <select className="form-input" value={form.paymentMethod} onChange={e => setForm(f => ({...f, paymentMethod: e.target.value}))}>
                      <option value="cod">الدفع عند الاستلام (COD)</option>
                      <option value="prepaid">مدفوع مسبقاً</option>
                      <option value="partial">دفع جزئي</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">تاريخ التسليم المتوقع</label>
                    <input className="form-input" type="date" value={form.expectedDate} onChange={e => setForm(f => ({...f, expectedDate: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="form-label">ملاحظات</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="أي تعليمات خاصة للتوصيل..." />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Truck className="w-4 h-4" />}
                  إنشاء الشحنة
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Delivery Modal */}
      {viewDelivery && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-black text-slate-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                {viewDelivery.deliveryNumber}
              </h2>
              <button onClick={() => setViewDelivery(null)} className="p-2 rounded-xl hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Status */}
              {(() => {
                const cfg = STATUS_CONFIG[viewDelivery.status];
                const Icon = cfg.icon;
                return (
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${cfg.color}`}>
                    <Icon className="w-5 h-5" />
                    <span className="font-bold">{cfg.label}</span>
                  </div>
                );
              })()}

              {/* Customer */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">العميل</p>
                  <p className="font-semibold text-slate-800">{viewDelivery.customerName}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">الهاتف</p>
                  <p className="font-semibold text-slate-800" dir="ltr">{viewDelivery.customerPhone}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-400 text-xs mb-0.5">العنوان</p>
                  <p className="font-semibold text-slate-800">{viewDelivery.city} — {viewDelivery.address}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-slate-400 text-xs mb-2">المنتجات</p>
                <div className="space-y-1.5">
                  {viewDelivery.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-slate-700">{item.productName} × {item.quantity}</span>
                      <span className="font-bold text-slate-800">{(item.quantity * item.unitPrice).toLocaleString("ar-EG")} ج.م</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-3 py-2 text-sm font-black text-indigo-700">
                    <span>الإجمالي</span>
                    <span>{viewDelivery.totalAmount.toLocaleString("ar-EG")} ج.م</span>
                  </div>
                </div>
              </div>

              {/* Shipping */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">شركة الشحن</p>
                  <p className="font-semibold text-slate-800">{viewDelivery.shippingCompany}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-0.5">طريقة الدفع</p>
                  <p className="font-semibold text-slate-800">{PAYMENT_LABELS[viewDelivery.paymentMethod]}</p>
                </div>
                {viewDelivery.trackingNumber && (
                  <div className="col-span-2">
                    <p className="text-slate-400 text-xs mb-0.5">رقم التتبع</p>
                    <p className="font-mono font-bold text-slate-800">{viewDelivery.trackingNumber}</p>
                  </div>
                )}
                {viewDelivery.expectedDate && (
                  <div>
                    <p className="text-slate-400 text-xs mb-0.5">تاريخ التسليم المتوقع</p>
                    <p className="font-semibold text-slate-800">{viewDelivery.expectedDate}</p>
                  </div>
                )}
                {viewDelivery.deliveredDate && (
                  <div>
                    <p className="text-slate-400 text-xs mb-0.5">تاريخ التسليم الفعلي</p>
                    <p className="font-semibold text-emerald-700">{viewDelivery.deliveredDate}</p>
                  </div>
                )}
              </div>

              {viewDelivery.notes && (
                <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-800">
                  <p className="font-bold mb-1">ملاحظات:</p>
                  <p>{viewDelivery.notes}</p>
                </div>
              )}

              {/* Status Actions */}
              {canEdit && <div className="flex gap-2 flex-wrap pt-1">
                {Object.entries(STATUS_CONFIG).map(([key, val]) => {
                  if (key === viewDelivery.status) return null;
                  const VIcon = val.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => { handleStatusChange(viewDelivery._id, key); setViewDelivery(null); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${val.color} hover:opacity-80 transition-opacity`}
                    >
                      <VIcon className="w-3.5 h-3.5" />
                      {val.label}
                    </button>
                  );
                })}
              </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
