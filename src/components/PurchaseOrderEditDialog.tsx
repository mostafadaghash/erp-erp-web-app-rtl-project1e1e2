import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";
import { useCurrency } from "../lib/utils";

type PurchaseLine = {
  productId?: Id<"products">;
  productName: string;
  quantity: number;
  unitCost: number;
};

type EditablePurchase = {
  _id: Id<"shipments">;
  shipmentNumber: string;
  status: string;
  items: Array<{
    productId?: Id<"products">;
    productName: string;
    quantity: number;
    unitCost: number;
  }>;
  shippingCost: number;
  expectedDate?: string;
  notes?: string;
};

export function PurchaseOrderEditDialog({
  shipment,
  onClose,
  onSaved,
}: {
  shipment: EditablePurchase;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updatePurchase = useMutation(api.documentCorrections.editPurchaseOrder);
  const { formatCurrency, formatAmount } = useCurrency();
  const requestId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<PurchaseLine[]>(() => shipment.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitCost: item.unitCost,
  })));
  const [shippingCost, setShippingCost] = useState(shipment.shippingCost);
  const [expectedDate, setExpectedDate] = useState(shipment.expectedDate ?? "");
  const [notes, setNotes] = useState(shipment.notes ?? "");
  const [reason, setReason] = useState("");

  const goodsTotal = lines.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const grandTotal = goodsTotal + (Number.isFinite(shippingCost) ? shippingCost : 0);
  const blocked = shipment.status === "arrived" || shipment.status === "cancelled";

  const updateLine = (index: number, patch: Partial<PurchaseLine>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  };

  const save = async () => {
    if (saving || blocked) return;
    if (!reason.trim()) return void toast.error("اكتب سبب التعديل");
    if (!lines.length) return void toast.error("يجب أن يحتوي مستند المشتريات على صنف واحد على الأقل");
    if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) {
      return void toast.error("راجع الكميات؛ يجب أن تكون أعداداً صحيحة أكبر من صفر");
    }
    if (lines.some((line) => !Number.isFinite(line.unitCost) || line.unitCost <= 0)) {
      return void toast.error("راجع تكاليف شراء الوحدات");
    }
    if (!Number.isFinite(shippingCost) || shippingCost < 0) return void toast.error("تكلفة الشحن غير صالحة");

    setSaving(true);
    try {
      await updatePurchase({
        shipmentId: shipment._id,
        items: lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitCost: line.unitCost,
        })),
        shippingCost,
        expectedDate: expectedDate || undefined,
        notes: notes.trim() || undefined,
        reason: reason.trim(),
        requestId: requestId.current,
      });
      toast.success("تم تصحيح مستند المشتريات");
      requestId.current = crypto.randomUUID();
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تعديل مستند المشتريات"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-3" dir="rtl" role="dialog" aria-modal="true" data-testid="purchase-edit-modal">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 bg-[var(--erp-navy)] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><Pencil className="h-5 w-5" /></span>
            <div><p className="text-xs font-bold text-emerald-200">تصحيح مستند مشتريات محفوظ</p><h2 className="mt-1 text-xl font-black">{shipment.shipmentNumber}</h2></div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 hover:bg-white/15" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </header>

        <div className="overflow-y-auto p-5">
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            يمكن تعديل الكمية وتكلفة الشراء قبل الاستلام والترحيل. بعد الاستلام لا يسمح بتغيير التاريخ المالي مباشرة؛ استخدم مرتجع المشتريات أو الإلغاء.
          </div>
          {blocked && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">هذا المستند تم ترحيله أو إلغاؤه ولا يقبل التعديل المباشر.</div>}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="data-table min-w-[760px]">
              <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>تكلفة الوحدة</th><th>الإجمالي</th><th>حذف</th></tr></thead>
              <tbody>{lines.map((line, index) => <tr key={`${String(line.productId ?? line.productName)}-${index}`}>
                <td>{formatAmount(index + 1)}</td>
                <td className="font-black text-slate-800">{line.productName}</td>
                <td><input data-testid={`purchase-edit-quantity-${index}`} className="form-input w-24 text-center font-black" type="number" min="1" step="1" value={line.quantity} disabled={saving || blocked} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td>
                <td><input data-testid={`purchase-edit-cost-${index}`} className="form-input w-32 text-center font-black" type="number" min="0.01" step="0.01" value={line.unitCost} disabled={saving || blocked} onChange={(event) => updateLine(index, { unitCost: Number(event.target.value) })} /></td>
                <td className="font-black text-[var(--erp-accent-strong)]">{formatCurrency(line.quantity * line.unitCost)}</td>
                <td><button type="button" onClick={() => removeLine(index)} disabled={saving || blocked || lines.length === 1} className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-700 disabled:opacity-40" title="حذف الصنف"><Trash2 className="h-4 w-4" /></button></td>
              </tr>)}</tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className="form-label">تكلفة الشحن</span><input data-testid="purchase-edit-shipping" className="form-input" type="number" min="0" step="0.01" value={shippingCost} disabled={saving || blocked} onChange={(event) => setShippingCost(Number(event.target.value))} /></label>
                <label><span className="form-label">الوصول المتوقع</span><input className="form-input" type="date" value={expectedDate} disabled={saving || blocked} onChange={(event) => setExpectedDate(event.target.value)} /></label>
              </div>
              <label><span className="form-label">ملاحظات</span><input className="form-input" value={notes} disabled={saving || blocked} onChange={(event) => setNotes(event.target.value)} /></label>
              <label><span className="form-label">سبب التعديل *</span><textarea data-testid="purchase-edit-reason" className="form-input" rows={3} value={reason} disabled={saving || blocked} onChange={(event) => setReason(event.target.value)} placeholder="مثال: تصحيح كمية أو تكلفة شراء مسجلة بالخطأ" /></label>
            </div>
            <dl className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex justify-between"><dt>البضاعة بعد التعديل</dt><dd className="font-bold">{formatCurrency(goodsTotal)}</dd></div>
              <div className="flex justify-between"><dt>الشحن</dt><dd className="font-bold">{formatCurrency(shippingCost || 0)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2"><dt className="font-black">الإجمالي الجديد</dt><dd className="font-black text-[var(--erp-accent-strong)]">{formatCurrency(grandTotal)}</dd></div>
            </dl>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>إلغاء</button>
          <button type="button" data-testid="purchase-edit-save" className="btn-primary flex items-center gap-2" onClick={() => void save()} disabled={saving || blocked || !reason.trim()}><Save className="h-4 w-4" />{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button>
        </footer>
      </div>
    </div>
  );
}
