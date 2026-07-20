import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";
import {
  Ship, Plus, X, Search, Clock, Plane,
  CheckCircle, XCircle, Trash2, Package,
  TrendingDown, AlertCircle
} from "lucide-react";

type ShipmentStatus = "ordered" | "in_transit" | "arrived" | "cancelled";

const statusConfig: Record<ShipmentStatus, { label: string; badge: string; icon: React.ElementType }> = {
  ordered:    { label: "تم الطلب",      badge: "badge badge-info",    icon: Clock },
  in_transit: { label: "في الطريق",     badge: "badge badge-warning", icon: Plane },
  arrived:    { label: "وصلت",          badge: "badge badge-success", icon: CheckCircle },
  cancelled:  { label: "ملغية",         badge: "badge badge-danger",  icon: XCircle },
};

const statusFlow: ShipmentStatus[] = ["ordered", "in_transit", "arrived"];

interface ShipItem {
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
  productId?: string;
}

const emptyItem = (): ShipItem => ({ productName: "", quantity: 1, unitCost: 0, total: 0 });

export function ShipmentsPage() {
  const canCreate = usePermission("create_shipments");
  const canEdit = usePermission("edit_shipments");
  const canDelete = usePermission("delete_shipments");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const shipments = useQuery(api.shipments.list, filterStatus !== "all" ? { status: filterStatus } : {});
  const stats = useQuery(api.shipments.stats);
  const updateStatus = useMutation(api.shipments.updateStatus);
  const removeShipment = useMutation(api.shipments.remove);

  const filtered = (shipments ?? []).filter(s =>
    s.supplierName.includes(search) ||
    s.shipmentNumber.includes(search)
  );

  const handleStatusChange = async (id: Id<"shipments">, status: string) => {
    try {
      const arrivedDate = status === "arrived" ? new Date().toISOString().split("T")[0] : undefined;
      await updateStatus({ id, status, arrivedDate });
      toast.success(
        status === "arrived"
          ? "تم استلام الشحنة وتحديث المخزون تلقائياً"
          : "تم تحديث حالة الشحنة"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    }
  };

  const handleDelete = async (id: Id<"shipments">) => {
    if (!confirm("هل أنت متأكد من حذف هذه الشحنة؟")) return;
    try {
      await removeShipment({ id });
      toast.success("تم حذف الشحنة");
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
            <Ship className="w-6 h-6 text-indigo-600" />
            الشحنات الواردة
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">تتبع طلبات الشراء من الموردين</p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          شحنة جديدة
        </button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "تم الطلب",    value: stats?.ordered ?? 0,    color: "text-blue-600",   bg: "bg-blue-50",   icon: Clock },
          { label: "في الطريق",   value: stats?.inTransit ?? 0,  color: "text-amber-600",  bg: "bg-amber-50",  icon: Plane },
          { label: "وصلت",        value: stats?.arrived ?? 0,    color: "text-emerald-600",bg: "bg-emerald-50",icon: CheckCircle },
          { label: "إجمالي التكلفة", value: (stats?.totalCost ?? 0).toLocaleString("ar-SA") + " ر",
            color: "text-indigo-600", bg: "bg-indigo-50", icon: TrendingDown },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card flex items-center gap-4">
              <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-black text-slate-800">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* In-transit alert */}
      {(stats?.inTransit ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-800 text-sm font-medium">
            لديك <span className="font-black">{stats?.inTransit}</span> شحنة في الطريق — تأكد من متابعة وصولها وتحديث المخزون
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-9"
            placeholder="بحث بالمورد أو رقم الشحنة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { v: "all", l: "الكل" },
            { v: "ordered", l: "تم الطلب" },
            { v: "in_transit", l: "في الطريق" },
            { v: "arrived", l: "وصلت" },
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
              <Ship className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">لا توجد شحنات</p>
            <p className="text-slate-400 text-sm mt-1">أضف شحنة جديدة لتتبع مشترياتك</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم الشحنة</th>
                  <th>المورد</th>
                  <th>المنتجات</th>
                  <th>تكلفة البضاعة</th>
                  <th>الشحن</th>
                  <th>الإجمالي</th>
                  <th>الحالة</th>
                  <th>التاريخ المتوقع</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((shipment) => {
                  const cfg = statusConfig[shipment.status as ShipmentStatus] ?? statusConfig.ordered;
                  const Icon = cfg.icon;
                  const currentIdx = statusFlow.indexOf(shipment.status as ShipmentStatus);
                  const nextStatus = currentIdx >= 0 && currentIdx < statusFlow.length - 1
                    ? statusFlow[currentIdx + 1] : null;
                  return (
                    <tr key={shipment._id}>
                      <td>
                        <span className="font-mono font-bold text-indigo-600 text-xs">{shipment.shipmentNumber}</span>
                      </td>
                      <td>
                        <p className="font-medium text-slate-800">{shipment.supplierName}</p>
                      </td>
                      <td>
                        <p className="text-slate-700">{shipment.items.length} صنف</p>
                        <p className="text-xs text-slate-400 truncate max-w-36">
                          {shipment.items.map(i => i.productName).join("، ")}
                        </p>
                      </td>
                      <td className="text-slate-700 font-medium">{shipment.totalCost.toLocaleString("ar-SA")} ر</td>
                      <td className="text-slate-500">{shipment.shippingCost.toLocaleString("ar-SA")} ر</td>
                      <td className="font-bold text-slate-800">{shipment.grandTotal.toLocaleString("ar-SA")} ر</td>
                      <td>
                        <span className={cfg.badge}>
                          <Icon className="w-3 h-3 ml-1" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="text-slate-500 text-xs">
                        {shipment.arrivedDate
                          ? <span className="text-emerald-600 font-medium">وصلت {shipment.arrivedDate}</span>
                          : shipment.expectedDate ?? "—"}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {canEdit && nextStatus && shipment.status !== "cancelled" && (
                            <button
                              onClick={() => handleStatusChange(shipment._id, nextStatus)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                                nextStatus === "arrived"
                                  ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                  : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                              }`}
                            >
                              {nextStatus === "arrived" ? "استلام الشحنة" : statusConfig[nextStatus].label}
                            </button>
                          )}
                          {canEdit && shipment.status !== "arrived" && shipment.status !== "cancelled" && (
                            <button
                              onClick={() => handleStatusChange(shipment._id, "cancelled")}
                              className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                              title="إلغاء"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && <button
                            onClick={() => handleDelete(shipment._id)}
                            className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="حذف"
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

      {/* New Shipment Form */}
      {showForm && <NewShipmentForm onClose={() => setShowForm(false)} />}
    </div>
  );
}

function NewShipmentForm({ onClose }: { onClose: () => void }) {
  const createShipment = useMutation(api.shipments.create);
  const suppliers = useQuery(api.suppliers.list);
  const products = useQuery(api.products.list, {});

  const [form, setForm] = useState({
    supplierName: "",
    supplierId: "",
    shippingCost: "",
    expectedDate: "",
    notes: "",
  });
  const [items, setItems] = useState<ShipItem[]>([emptyItem()]);

  const totalCost = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const shippingCost = parseFloat(form.shippingCost) || 0;
  const grandTotal = totalCost + shippingCost;

  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof ShipItem, value: string | number) => {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      updated.total = updated.quantity * updated.unitCost;
      return updated;
    }));
  };

  const handleProductSelect = (idx: number, productId: string) => {
    const product = products?.find(p => p._id === productId);
    if (product) {
      setItems(items.map((item, i) => i === idx ? {
        ...item,
        productId,
        productName: product.name,
        unitCost: product.costPrice,
        total: item.quantity * product.costPrice,
      } : item));
    }
  };

  const handleSupplierSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const s = suppliers?.find(s => s._id === id);
    setForm({ ...form, supplierId: id, supplierName: s?.name ?? "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName.trim()) { toast.error("أدخل اسم المورد"); return; }
    if (items.some(i => !i.productName.trim())) { toast.error("أدخل اسم المنتج لكل عنصر"); return; }
    if (totalCost === 0) { toast.error("أضف منتجاً واحداً على الأقل بتكلفة"); return; }
    try {
      await createShipment({
        supplierName: form.supplierName,
        supplierId: form.supplierId ? form.supplierId as Id<"suppliers"> : undefined,
        items: items.map(i => ({
          productId: i.productId ? i.productId as Id<"products"> : undefined,
          productName: i.productName,
          quantity: i.quantity,
          unitCost: i.unitCost,
          total: i.quantity * i.unitCost,
        })),
        totalCost,
        shippingCost,
        grandTotal,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
      });
      toast.success("تم إنشاء الشحنة بنجاح");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl z-10">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Ship className="w-5 h-5 text-indigo-600" />
            شحنة جديدة
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Supplier */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">بيانات المورد</p>
            <div>
              <label className="form-label">اختر مورداً</label>
              <select className="form-input" value={form.supplierId} onChange={handleSupplierSelect}>
                <option value="">— مورد جديد —</option>
                {(suppliers ?? []).map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">اسم المورد *</label>
              <input className="form-input" value={form.supplierName}
                onChange={e => setForm({ ...form, supplierName: e.target.value })} placeholder="اسم المورد" />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">المنتجات</p>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium hover:text-indigo-700">
                <Plus className="w-4 h-4" />
                إضافة منتج
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">صنف {idx + 1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)}
                      className="p-1 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div>
                  <label className="form-label text-xs">اختر من المنتجات الموجودة (اختياري)</label>
                  <select className="form-input text-sm"
                    value={item.productId ?? ""}
                    onChange={e => handleProductSelect(idx, e.target.value)}>
                    <option value="">— منتج جديد —</option>
                    {(products ?? []).map(p => (
                      <option key={p._id} value={p._id}>{p.name} (مخزون: {p.stock})</option>
                    ))}
                  </select>
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
                    <input className="form-input text-center" type="number" placeholder="تكلفة الوحدة" min="0"
                      value={item.unitCost || ""} onChange={e => updateItem(idx, "unitCost", Number(e.target.value))} />
                  </div>
                </div>
                <div className="text-left text-sm font-bold text-indigo-600">
                  {(item.quantity * item.unitCost).toLocaleString("ar-SA")} ريال
                </div>
              </div>
            ))}
          </div>

          {/* Costs */}
          <div className="bg-indigo-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 text-sm">تكلفة البضاعة</span>
              <span className="font-bold text-slate-800">{totalCost.toLocaleString("ar-SA")} ريال</span>
            </div>
            <div>
              <label className="form-label">تكلفة الشحن (ريال)</label>
              <input className="form-input" type="number" placeholder="0" min="0"
                value={form.shippingCost} onChange={e => setForm({ ...form, shippingCost: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-t border-indigo-200 pt-3">
              <span className="font-semibold text-slate-700">الإجمالي الكلي</span>
              <span className="font-black text-xl text-indigo-700">{grandTotal.toLocaleString("ar-SA")} ريال</span>
            </div>
          </div>

          {/* Date & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">تاريخ الوصول المتوقع</label>
              <input className="form-input" type="date" value={form.expectedDate}
                onChange={e => setForm({ ...form, expectedDate: e.target.value })} />
            </div>
            <div>
              <label className="form-label">ملاحظات</label>
              <input className="form-input" placeholder="ملاحظات" value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button type="submit" className="btn-primary flex-1">حفظ الشحنة</button>
          </div>
        </form>
      </div>
    </div>
  );
}
