import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2, Wrench, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";

type WorkPartRow = {
  productId: string;
  quantity: string;
  unitPrice: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;

export function RepairWorkEditDialog({
  repair,
  onClose,
  onSaved,
}: {
  repair: Doc<"repairs">;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const partOptions = useQuery(
    api.repairWorkCorrections.partPicker,
    repair.branchId ? { branchId: repair.branchId } : "skip",
  ) ?? [];
  const updateWork = useMutation(api.repairWorkCorrections.updateWork);
  const [laborCost, setLaborCost] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [qualityCheckNotes, setQualityCheckNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<WorkPartRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    setLaborCost(String(repair.laborCost));
    setDiagnosis(repair.diagnosis ?? "");
    setQualityCheckNotes(repair.qualityCheckNotes ?? "");
    setNotes(repair.notes ?? "");
    setReason("");
    setDate(today());
    setRequestId(crypto.randomUUID());
    setRows(
      repair.parts
        .filter((part) => part.productId)
        .map((part) => ({
          productId: String(part.productId),
          quantity: String(part.quantity),
          unitPrice: String(part.unitPrice ?? part.cost),
        })),
    );
  }, [repair]);

  const currentQuantity = useMemo(() => {
    const map = new Map<string, number>();
    for (const part of repair.parts) {
      if (part.productId) map.set(String(part.productId), part.quantity);
    }
    return map;
  }, [repair]);

  const partsTotal = rows.reduce((sum, row) => {
    const quantity = Number(row.quantity || 0);
    const unitPrice = Number(row.unitPrice || 0);
    return sum + (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0);
  }, 0);
  const labor = Number(laborCost || 0);
  const nextTotal = (Number.isFinite(labor) ? labor : 0) + partsTotal;
  const difference = nextTotal - repair.totalCost;

  const validationReason = (() => {
    if (!repair.branchId) return "أمر الصيانة غير مربوط بفرع";
    if (!Number.isFinite(labor) || labor < 0 || Math.round(labor * 100) !== labor * 100) return "أجرة الصيانة غير صالحة";
    if (!reason.trim()) return "اكتب سبب التعديل";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "اختر تاريخ تعديل صالحًا";
    if (rows.length > 100) return "الحد الأقصى 100 قطعة غيار";
    if (rows.some((row) => !row.productId)) return "اختر قطعة الغيار أو احذف السطر غير المكتمل";
    if (new Set(rows.map((row) => row.productId)).size !== rows.length) return "لا يمكن تكرار قطعة الغيار";
    for (const row of rows) {
      const quantity = Number(row.quantity);
      const unitPrice = Number(row.unitPrice);
      if (!Number.isInteger(quantity) || quantity <= 0) return "كمية القطعة يجب أن تكون عددًا صحيحًا أكبر من صفر";
      if (!Number.isFinite(unitPrice) || unitPrice < 0 || Math.round(unitPrice * 100) !== unitPrice * 100) return "سعر قطعة الغيار غير صالح";
      const product = partOptions.find((option) => String(option._id) === row.productId);
      if (!product) return "اختر قطعة غيار صحيحة";
      const availableAfterRestore = product.stock + (currentQuantity.get(row.productId) ?? 0);
      if (quantity > availableAfterRestore) return `كمية ${product.name} تتجاوز المتاح بعد استرجاع القطع الحالية (${availableAfterRestore})`;
    }
    if (nextTotal + 0.001 < repair.deposit) return `الإجمالي الجديد أقل من المبلغ المحصل (${money(repair.deposit)}). استرد الفرق أولاً`;
    return null;
  })();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || validationReason) {
      if (validationReason) toast.error(validationReason);
      return;
    }
    setSaving(true);
    try {
      await updateWork({
        repairId: repair._id,
        laborCost: labor,
        parts: rows.map((row) => ({
          productId: row.productId as Id<"products">,
          quantity: Number(row.quantity),
          unitPrice: Number(row.unitPrice),
        })),
        diagnosis: diagnosis.trim() || undefined,
        qualityCheckNotes: qualityCheckNotes.trim() || undefined,
        notes: notes.trim() || undefined,
        date,
        reason: reason.trim(),
        requestId,
      });
      toast.success("تم تحديث أعمال الصيانة والقطع وإعادة احتساب المخزون والحسابات");
      setRequestId(crypto.randomUUID());
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تعديل أعمال الصيانة"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-3" dir="rtl" data-testid="repair-work-edit-dialog">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div>
            <div className="flex items-center gap-2 text-lg font-black"><Wrench className="h-5 w-5" /> تعديل أعمال الصيانة والقطع</div>
            <p className="mt-1 text-xs text-slate-300">{repair.repairNumber} — {repair.customerName} — {repair.deviceBrand} {repair.deviceModel}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </header>

        <form onSubmit={submit} className="max-h-[calc(94vh-72px)] overflow-y-auto p-5">
          {repair.status === "ready" && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="repair-ready-edit-notice">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div><strong>الفني أنهى العمل.</strong> ما زال بإمكانك تسجيل القطع الفعلية وأجرة الصيانة والتشخيص قبل التسليم النهائي للعميل.</div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
            <label className="block">
              <span className="form-label">أجرة الصيانة</span>
              <input data-testid="repair-work-labor" type="number" min="0" step="0.01" className="form-input" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} />
            </label>
            <label className="block">
              <span className="form-label">تاريخ التعديل</span>
              <input data-testid="repair-work-date" type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">المحصل سابقًا</p>
              <p className="mt-1 font-black text-slate-900">{money(repair.deposit)}</p>
            </div>
          </div>

          <section className="mt-5 rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
              <div>
                <h3 className="font-black text-slate-800">القطع المستخدمة فعليًا</h3>
                <p className="text-xs text-slate-500">يتم رد أثر القطع القديمة ثم صرف القائمة الجديدة آليًا عند الحفظ.</p>
              </div>
              <button type="button" data-testid="repair-work-add-part" className="btn-secondary flex items-center gap-1 text-xs" onClick={() => setRows((current) => [...current, { productId: "", quantity: "1", unitPrice: "0" }])}>
                <Plus className="h-4 w-4" /> إضافة قطعة
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y border-slate-200 bg-white text-xs text-slate-500">
                  <tr><th className="px-3 py-2 text-right">قطعة الغيار</th><th className="px-3 py-2">المتاح</th><th className="px-3 py-2">الكمية</th><th className="px-3 py-2">سعر البيع</th><th className="px-3 py-2">الإجمالي</th><th className="w-12"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, index) => {
                    const product = partOptions.find((option) => String(option._id) === row.productId);
                    const available = product ? product.stock + (currentQuantity.get(row.productId) ?? 0) : 0;
                    const lineTotal = Number(row.quantity || 0) * Number(row.unitPrice || 0);
                    return (
                      <tr key={`${index}-${row.productId}`} data-testid={`repair-work-part-${index}`}>
                        <td className="p-2">
                          <select className="form-input" value={row.productId} onChange={(e) => {
                            const option = partOptions.find((candidate) => String(candidate._id) === e.target.value);
                            setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, productId: e.target.value, unitPrice: option ? String(option.sellPrice) : "0" } : item));
                          }}>
                            <option value="">اختر القطعة</option>
                            {partOptions.map((option) => <option key={option._id} value={option._id}>{option.name} — {option.sku}</option>)}
                          </select>
                        </td>
                        <td className="px-3 text-center font-semibold text-slate-600">{product ? available : "—"}</td>
                        <td className="p-2"><input type="number" min="1" step="1" className="form-input text-center" value={row.quantity} onChange={(e) => setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, quantity: e.target.value } : item))} /></td>
                        <td className="p-2"><input type="number" min="0" step="0.01" className="form-input text-center" value={row.unitPrice} onChange={(e) => setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, unitPrice: e.target.value } : item))} /></td>
                        <td className="px-3 text-center font-black text-slate-800">{money(Number.isFinite(lineTotal) ? lineTotal : 0)}</td>
                        <td className="p-2"><button type="button" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد قطع مستخدمة. أضف القطع الفعلية إن وجدت.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label><span className="form-label">التشخيص النهائي</span><textarea rows={3} className="form-input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></label>
            <label><span className="form-label">ملاحظات اختبار الجودة</span><textarea rows={3} className="form-input" value={qualityCheckNotes} onChange={(e) => setQualityCheckNotes(e.target.value)} /></label>
            <label><span className="form-label">ملاحظات داخلية</span><textarea rows={2} className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <label><span className="form-label">سبب التعديل *</span><textarea data-testid="repair-work-reason" required rows={2} className="form-input" placeholder="مثال: إضافة القطع التي استخدمها الفني بعد انتهاء الإصلاح" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
            <div><p className="text-xs text-slate-500">الإجمالي القديم</p><p className="font-bold">{money(repair.totalCost)}</p></div>
            <div><p className="text-xs text-slate-500">إجمالي القطع</p><p className="font-bold">{money(partsTotal)}</p></div>
            <div><p className="text-xs text-slate-500">الإجمالي الجديد</p><p className="text-lg font-black text-indigo-700">{money(nextTotal)}</p></div>
            <div><p className="text-xs text-slate-500">فرق القيمة</p><p className={`font-black ${difference > 0 ? "text-amber-700" : difference < 0 ? "text-emerald-700" : "text-slate-700"}`}>{difference > 0 ? "+" : ""}{money(difference)}</p></div>
          </div>

          {validationReason && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{validationReason}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>إلغاء</button>
            <button data-testid="repair-work-save" className="btn-primary min-w-40" disabled={saving || Boolean(validationReason)} title={validationReason ?? undefined}>{saving ? "جارٍ الحفظ..." : "حفظ أعمال الصيانة"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
