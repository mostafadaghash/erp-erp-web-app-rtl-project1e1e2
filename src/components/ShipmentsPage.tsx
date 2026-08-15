import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";
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

export function ShipmentsPage({ createRequestToken }: { createRequestToken?: number }) {
  const canCreate = usePermission("create_shipments");
  const canEdit = usePermission("edit_shipments");
  const canDelete = usePermission("delete_shipments");
  const canPostPurchaseReceipts = usePermission("post_purchase_receipts");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (createRequestToken && canCreate) setShowForm(true);
  }, [createRequestToken, canCreate]);

  const shipments = useQuery(api.shipments.list, filterStatus !== "all" ? { status: filterStatus } : {});
  const [receiving, setReceiving] = useState<NonNullable<typeof shipments>[number] | null>(null);
  const stats = useQuery(api.shipments.stats);
  const updateStatus = useMutation(api.shipments.updateStatus);

  const filtered = (shipments ?? []).filter(s =>
    s.supplierName.includes(search) ||
    s.shipmentNumber.includes(search)
  );

  const handleStatusChange = async (id: Id<"shipments">, status: string) => {
    try {
      const reason = status === "cancelled" ? prompt("أدخل سبب إلغاء عملية الشراء") : undefined;
      if (status === "cancelled" && !reason?.trim()) return;
      await updateStatus({ id, status, reason });
      toast.success(
        status === "arrived"
          ? "تم استلام عملية الشراء وتحديث المخزون تلقائياً"
          : "تم تحديث حالة عملية الشراء"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    }
  };

  const handleDelete = async (id: Id<"shipments">) => {
    const reason = prompt("أدخل سبب إلغاء عملية الشراء");
    if (!reason?.trim() || !confirm("هل أنت متأكد من إلغاء عملية الشراء؟")) return;
    try {
      await updateStatus({ id, status: "cancelled", reason });
      toast.success("تم إلغاء عملية الشراء");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حدث خطأ");
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="shipments-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Ship className="w-6 h-6 text-indigo-600" />
            المشتريات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">تتبع طلبات الشراء من الموردين</p>
        </div>
        {canCreate && <button data-testid="shipment-create-open" onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          عملية شراء جديدة
        </button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "تم الطلب",    value: stats?.ordered ?? 0,    color: "text-blue-600",   bg: "bg-blue-50",   icon: Clock },
          { label: "في الطريق",   value: stats?.inTransit ?? 0,  color: "text-amber-600",  bg: "bg-amber-50",  icon: Plane },
          { label: "وصلت",        value: stats?.arrived ?? 0,    color: "text-emerald-600",bg: "bg-emerald-50",icon: CheckCircle },
          { label: "إجمالي التكلفة", value: (stats?.totalCost ?? 0).toLocaleString("ar-EG") + " ج.م",
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
            لديك <span className="font-black">{stats?.inTransit}</span> عملية شراء في الطريق — تأكد من متابعة وصولها وتحديث المخزون
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-9"
            placeholder="بحث بالمورد أو رقم عملية الشراء..."
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
            <p className="text-slate-500 font-medium">لا توجد عمليات شراء</p>
            <p className="text-slate-400 text-sm mt-1">أضف عملية شراء جديدة لتتبع مشترياتك</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم عملية الشراء</th>
                  <th>المورد</th>
                  <th>الأصناف</th>
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
                    <tr key={shipment._id} data-testid="shipment-row" data-shipment-number={shipment.shipmentNumber} data-supplier-name={shipment.supplierName} data-status={shipment.status}>
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
                      <td className="text-slate-700 font-medium">{shipment.totalCost.toLocaleString("ar-EG")} ج.م</td>
                      <td className="text-slate-500">{shipment.shippingCost.toLocaleString("ar-EG")} ج.م</td>
                      <td className="font-bold text-slate-800">{shipment.grandTotal.toLocaleString("ar-EG")} ج.م</td>
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
                          {canEdit && nextStatus && shipment.status !== "cancelled" && (nextStatus !== "arrived" || canPostPurchaseReceipts) && (
                            <button
                              data-testid="shipment-status-next"
                              data-next-status={nextStatus}
                              onClick={() => nextStatus === "arrived" ? setReceiving(shipment) : void handleStatusChange(shipment._id, nextStatus)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                                nextStatus === "arrived"
                                  ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                  : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                              }`}
                            >
                              {nextStatus === "arrived" ? "استلام عملية الشراء" : statusConfig[nextStatus].label}
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

      {/* New Shipment Form */}
      {showForm && <NewShipmentForm onClose={() => setShowForm(false)} />}
      {receiving && <ReceiveShipmentModal shipment={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}

function NewShipmentForm({ onClose }: { onClose: () => void }) {
  const createShipment = useMutation(api.shipments.create);
  const options = useQuery(api.shipments.creationOptions);
  const suppliers = options?.suppliers;
  const products = options?.products;

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
        unitCost: item.unitCost,
        total: item.quantity * item.unitCost,
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
    if (!form.supplierId) { toast.error("اختر مورداً نشطاً"); return; }
    if (items.some(i => !i.productName.trim())) { toast.error("أدخل اسم الصنف لكل عنصر"); return; }
    if (totalCost === 0) { toast.error("أضف صنفًا واحداً على الأقل بتكلفة"); return; }
    try {
      await createShipment({
        supplierName: form.supplierName,
        supplierId: form.supplierId as Id<"suppliers">,
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
      toast.success("تم إنشاء عملية الشراء بنجاح");
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
            عملية شراء جديدة
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form data-testid="shipment-create-form" onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Supplier */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">بيانات المورد</p>
            <div>
              <label className="form-label">اختر مورداً</label>
              <select data-testid="shipment-supplier-select" className="form-input" value={form.supplierId} onChange={handleSupplierSelect}>
                <option value="">— اختر المورد —</option>
                {(suppliers ?? []).map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">اسم المورد *</label>
              <input className="form-input" value={form.supplierName} readOnly placeholder="اسم المورد" />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">الأصناف</p>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium hover:text-indigo-700">
                <Plus className="w-4 h-4" />
                إضافة صنف
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} data-testid="shipment-item-row" data-item-index={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
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
                  <label className="form-label text-xs">اختر من الأصناف الموجودة (اختياري)</label>
                  <select data-testid="shipment-product-select" className="form-input text-sm"
                    value={item.productId ?? ""}
                    onChange={e => handleProductSelect(idx, e.target.value)}>
                    <option value="">— صنف جديد —</option>
                    {(products ?? []).map(p => (
                      <option key={p._id} value={p._id}>{p.name} (مخزون: {p.stock})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3 sm:col-span-1">
                    <input className="form-input" placeholder="اسم الصنف *" value={item.productName}
                      onChange={e => updateItem(idx, "productName", e.target.value)} />
                  </div>
                  <div>
                    <input data-testid="shipment-item-quantity" className="form-input text-center" type="number" placeholder="الكمية" min="1"
                      value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div>
                    <input data-testid="shipment-item-unit-cost" className="form-input text-center" type="number" placeholder="تكلفة الوحدة" min="0"
                      value={item.unitCost || ""} onChange={e => updateItem(idx, "unitCost", Number(e.target.value))} />
                  </div>
                </div>
                <div className="text-left text-sm font-bold text-indigo-600">
                  {(item.quantity * item.unitCost).toLocaleString("ar-EG")} ج.م
                </div>
              </div>
            ))}
          </div>

          {/* Costs */}
          <div className="bg-indigo-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 text-sm">تكلفة البضاعة</span>
              <span className="font-bold text-slate-800">{totalCost.toLocaleString("ar-EG")} ج.م</span>
            </div>
            <div>
              <label className="form-label">تكلفة الشحن (ج.م)</label>
              <input data-testid="shipment-shipping-cost" className="form-input" type="number" placeholder="0" min="0"
                value={form.shippingCost} onChange={e => setForm({ ...form, shippingCost: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-t border-indigo-200 pt-3">
              <span className="font-semibold text-slate-700">الإجمالي الكلي</span>
              <span className="font-black text-xl text-indigo-700">{grandTotal.toLocaleString("ar-EG")} ج.م</span>
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
              <input data-testid="shipment-notes" className="form-input" placeholder="ملاحظات" value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button data-testid="shipment-submit" type="submit" className="btn-primary flex-1">حفظ عملية الشراء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReceiveShipmentModal({ shipment, onClose }: { shipment: { _id: Id<"shipments">; shipmentNumber: string; supplierName: string; totalCost: number; shippingCost: number; grandTotal: number }; onClose: () => void }) {
  const receiveShipment = useMutation(api.shipments.receive);
  const [requestId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [externalInvoiceNumber, setExternalInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [supplierFreightAmount, setSupplierFreightAmount] = useState(String(shipment.shippingCost));
  const supplierFreight = Number(supplierFreightAmount) || 0;
  const externalFreight = shipment.shippingCost - supplierFreight;
  const payable = shipment.totalCost + supplierFreight;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await receiveShipment({ shipmentId: shipment._id, receiptDate, requestId, externalInvoiceNumber: externalInvoiceNumber.trim() || undefined, invoiceDate: invoiceDate || undefined, dueDate: dueDate || undefined, supplierFreightAmount: supplierFreight });
      toast.success(`تم الاستلام بمستند ${result.receiptNumber ?? "PUR"}`);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر استلام عملية الشراء"));
    } finally { setSubmitting(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
    <form data-testid="shipment-receive-form" data-shipment-number={shipment.shipmentNumber} onSubmit={submit} className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex justify-between"><div><h2 className="font-black text-lg">استلام عملية الشراء</h2><p className="font-mono text-indigo-600">{shipment.shipmentNumber}</p><p>{shipment.supplierName}</p></div><button type="button" onClick={onClose}><X /></button></div>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
        <span>إجمالي البضاعة</span><b>{shipment.totalCost.toLocaleString("ar-EG")} ج.م</b>
        <span>إجمالي الشحن</span><b>{shipment.shippingCost.toLocaleString("ar-EG")} ج.م</b>
        <span>الشحن المحمل على المورد</span><b>{supplierFreight.toLocaleString("ar-EG")} ج.م</b>
        <span>الشحن الخارجي</span><b>{externalFreight.toLocaleString("ar-EG")} ج.م</b>
        <span>قيمة المخزون الواصلة</span><b>{shipment.grandTotal.toLocaleString("ar-EG")} ج.م</b>
        <span>مديونية المورد</span><b>{payable.toLocaleString("ar-EG")} ج.م</b>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="form-label">تاريخ الاستلام *<input data-testid="shipment-receive-date" required type="date" className="form-input" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></label>
        <label className="form-label">رقم فاتورة المورد<input data-testid="shipment-external-invoice" className="form-input" value={externalInvoiceNumber} onChange={e => setExternalInvoiceNumber(e.target.value)} /></label>
        <label className="form-label">تاريخ الفاتورة<input type="date" className="form-input" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></label>
        <label className="form-label">تاريخ الاستحقاق<input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
        <label className="form-label col-span-2">قيمة الشحن المستحقة للمورد<input required type="number" min="0" max={shipment.shippingCost} step="0.01" className="form-input" value={supplierFreightAmount} onChange={e => setSupplierFreightAmount(e.target.value)} /></label>
      </div>
      <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={onClose}>إلغاء</button><button data-testid="shipment-receive-submit" disabled={submitting} className="btn-primary flex-1">{submitting ? "جارٍ الترحيل..." : "استلام وترحيل المديونية"}</button></div>
    </form>
  </div>;
}
