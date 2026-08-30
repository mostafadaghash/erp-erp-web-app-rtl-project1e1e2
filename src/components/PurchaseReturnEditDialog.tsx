import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";
import { useCurrency } from "../lib/utils";

type EditablePurchaseReturn = {
  _id: Id<"purchaseReturns">;
  returnNumber: string;
  status: string;
  cashRefund: number;
  financialTransactionId?: Id<"financialTransactions">;
  items: Array<{
    receiptItemIndex: number;
    productName: string;
    quantityReturned: number;
    goodsCreditAmount: number;
  }>;
};

type EditLine = {
  receiptItemIndex: number;
  productName: string;
  quantity: number;
  unitCredit: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function PurchaseReturnEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: EditablePurchaseReturn;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateReturn = useMutation(api.documentCorrections.editPurchaseReturn);
  const { formatCurrency, formatAmount } = useCurrency();
  const requestId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<EditLine[]>(() => row.items.map((item) => ({
    receiptItemIndex: item.receiptItemIndex,
    productName: item.productName,
    quantity: item.quantityReturned,
    unitCredit: roundMoney(item.goodsCreditAmount / item.quantityReturned),
  })));

  const blocked = row.status !== "posted" || row.cashRefund > 0 || Boolean(row.financialTransactionId);
  const goodsTotal = roundMoney(lines.reduce((sum, line) => sum + line.quantity * line.unitCredit, 0));

  const updateLine = (index: number, patch: Partial<EditLine>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const save = async () => {
    if (saving || blocked) return;
    if (!reason.trim()) return void toast.error("اكتب سبب التعديل");
    if (!lines.length) return void toast.error("يجب أن يحتوي المرتجع على صنف واحد على الأقل");
    if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) return void toast.error("راجع كميات مرتجع الشراء");
    if (lines.some((line) => !Number.isFinite(line.unitCredit) || line.unitCredit <= 0)) return void toast.error("راجع قيمة وحدة مرتجع الشراء");
    setSaving(true);
    try {
      await updateReturn({
        purchaseReturnId: row._id,
        items: lines.map((line) => ({
          receiptItemIndex: line.receiptItemIndex,
          quantity: line.quantity,
          unitCredit: line.unitCredit,
        })),
        reason: reason.trim(),
        date,
        requestId: requestId.current,
      });
      toast.success("تم تصحيح مرتجع المشتريات وتحديث المخزون ورصيد المورد");
      requestId.current = crypto.randomUUID();
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تعديل مرتجع المشتريات"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-3" dir="rtl" role="dialog" aria-modal="true" data-testid="purchase-return-edit-modal">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[var(--erp-navy)] px-5 py-4 text-white">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><Pencil className="h-5 w-5" /></span><div><p className="text-xs font-bold text-emerald-200">تصحيح مرتجع مشتريات</p><h2 className="mt-1 text-xl font-black">{row.returnNumber}</h2></div></div>
          <button type="button" onClick={onClose} disabled={saving} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </header>
        <div className="overflow-y-auto p-5">
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">التصحيح يعكس أثر المرتجع القديم ثم يعيد ترحيل الكميات والقيم الجديدة إلى المخزون ورصيد المورد والأستاذ العام. المرتجعات التي حرّكت الخزينة تُصحح بالعكس ثم إعادة الإنشاء.</div>
          {blocked && <div data-testid="purchase-return-edit-finance-lock" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">هذا المرتجع تمت تسويته نقدياً أو إلغاؤه؛ استخدم إلغاء المرتجع ثم أنشئ المستند الصحيح.</div>}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="data-table min-w-[700px]"><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>قيمة وحدة الخصم</th><th>الإجمالي</th><th>حذف</th></tr></thead><tbody>
              {lines.map((line, index) => <tr key={`${line.receiptItemIndex}-${index}`}><td>{formatAmount(index + 1)}</td><td className="font-black">{line.productName}</td><td><input data-testid={`purchase-return-edit-quantity-${index}`} className="form-input w-24 text-center" type="number" min="1" step="1" value={line.quantity} disabled={saving || blocked} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td><td><input data-testid={`purchase-return-edit-price-${index}`} className="form-input w-32 text-center" type="number" min="0.01" step="0.01" value={line.unitCredit} disabled={saving || blocked} onChange={(event) => updateLine(index, { unitCredit: Number(event.target.value) })} /></td><td className="font-black text-[var(--erp-accent-strong)]">{formatCurrency(line.quantity * line.unitCredit)}</td><td><button type="button" disabled={saving || blocked || lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></td></tr>)}
            </tbody></table>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><label><span className="form-label">سبب التعديل *</span><textarea data-testid="purchase-return-edit-reason" className="form-input" rows={3} value={reason} disabled={saving || blocked} onChange={(event) => setReason(event.target.value)} /></label><label><span className="form-label">تاريخ التصحيح</span><input className="form-input" type="date" value={date} disabled={saving || blocked} onChange={(event) => setDate(event.target.value)} /></label></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">خصم البضاعة بعد التصحيح</p><p className="mt-2 text-2xl font-black text-[var(--erp-accent-strong)]">{formatCurrency(goodsTotal)}</p></div>
          </div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>إلغاء</button><button data-testid="purchase-return-edit-save" type="button" className="btn-primary flex items-center gap-2" onClick={() => void save()} disabled={saving || blocked || !reason.trim()}><Save className="h-4 w-4" />{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button></footer>
      </div>
    </div>
  );
}
