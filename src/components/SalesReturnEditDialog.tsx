import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";
import { useCurrency } from "../lib/utils";

type EditableSalesReturn = {
  _id: Id<"salesReturns">;
  creditNoteNumber: string;
  status: string;
  cashRefund: number;
  financialTransactionId?: Id<"financialTransactions">;
  items: Array<{
    productId: Id<"products">;
    productName: string;
    quantityReturned: number;
    creditAmount: number;
  }>;
};

type EditLine = {
  productId: Id<"products">;
  productName: string;
  quantity: number;
  unitCredit: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function SalesReturnEditDialog({
  note,
  onClose,
  onSaved,
}: {
  note: EditableSalesReturn;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateReturn = useMutation(api.documentCorrections.editSalesReturn);
  const { formatCurrency, formatAmount } = useCurrency();
  const requestId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<EditLine[]>(() => note.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantityReturned,
    unitCredit: roundMoney(item.creditAmount / item.quantityReturned),
  })));

  const blocked = note.status !== "posted" || note.cashRefund > 0 || Boolean(note.financialTransactionId);
  const total = roundMoney(lines.reduce((sum, line) => sum + line.quantity * line.unitCredit, 0));

  const updateLine = (index: number, patch: Partial<EditLine>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const save = async () => {
    if (saving || blocked) return;
    if (!reason.trim()) return void toast.error("اكتب سبب التعديل");
    if (!lines.length) return void toast.error("يجب أن يحتوي المرتجع على صنف واحد على الأقل");
    if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) return void toast.error("راجع كميات المرتجع");
    if (lines.some((line) => !Number.isFinite(line.unitCredit) || line.unitCredit <= 0)) return void toast.error("راجع قيمة وحدة المرتجع");
    setSaving(true);
    try {
      await updateReturn({
        salesReturnId: note._id,
        items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCredit: line.unitCredit })),
        reason: reason.trim(),
        date,
        requestId: requestId.current,
      });
      toast.success("تم تصحيح مرتجع المبيعات وتحديث المخزون وحساب العميل");
      requestId.current = crypto.randomUUID();
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تعديل مرتجع المبيعات"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-3" dir="rtl" role="dialog" aria-modal="true" data-testid="sales-return-edit-modal">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[var(--erp-navy)] px-5 py-4 text-white">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><Pencil className="h-5 w-5" /></span><div><p className="text-xs font-bold text-emerald-200">تصحيح مرتجع مبيعات</p><h2 className="mt-1 text-xl font-black">{note.creditNoteNumber}</h2></div></div>
          <button type="button" onClick={onClose} disabled={saving} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </header>
        <div className="overflow-y-auto p-5">
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">يمكن تصحيح الكمية وقيمة وحدة المرتجع ما دام الإشعار لم ينتج عنه رد نقدي. إذا سبق تحريك الخزينة، يجب عكس الإشعار وإنشاء مرتجع صحيح جديد حتى يظل الأثر المالي قابلاً للمراجعة.</div>
          {blocked && <div data-testid="sales-return-edit-finance-lock" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">هذا المرتجع تمت تسويته ماليًا أو عكسه، لذلك لا يقبل التعديل المباشر. استخدم العكس ثم أنشئ المرتجع الصحيح.</div>}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="data-table min-w-[700px]"><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>قيمة وحدة المرتجع</th><th>الإجمالي</th><th>حذف</th></tr></thead><tbody>
              {lines.map((line, index) => <tr key={`${String(line.productId)}-${index}`}><td>{formatAmount(index + 1)}</td><td className="font-black">{line.productName}</td><td><input data-testid={`sales-return-edit-quantity-${index}`} className="form-input w-24 text-center" type="number" min="1" step="1" value={line.quantity} disabled={saving || blocked} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td><td><input data-testid={`sales-return-edit-price-${index}`} className="form-input w-32 text-center" type="number" min="0.01" step="0.01" value={line.unitCredit} disabled={saving || blocked} onChange={(event) => updateLine(index, { unitCredit: Number(event.target.value) })} /></td><td className="font-black text-[var(--erp-accent-strong)]">{formatCurrency(line.quantity * line.unitCredit)}</td><td><button type="button" disabled={saving || blocked || lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></td></tr>)}
            </tbody></table>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><label><span className="form-label">سبب التعديل *</span><textarea data-testid="sales-return-edit-reason" className="form-input" rows={3} value={reason} disabled={saving || blocked} onChange={(event) => setReason(event.target.value)} /></label><label><span className="form-label">تاريخ التصحيح</span><input className="form-input" type="date" value={date} disabled={saving || blocked} onChange={(event) => setDate(event.target.value)} /></label></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">إجمالي المرتجع بعد التصحيح</p><p className="mt-2 text-2xl font-black text-[var(--erp-accent-strong)]">{formatCurrency(total)}</p></div>
          </div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>إلغاء</button><button data-testid="sales-return-edit-save" type="button" className="btn-primary flex items-center gap-2" onClick={() => void save()} disabled={saving || blocked || !reason.trim()}><Save className="h-4 w-4" />{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button></footer>
      </div>
    </div>
  );
}
