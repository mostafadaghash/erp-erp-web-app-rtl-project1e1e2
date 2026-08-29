import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";
import { useCurrency } from "../lib/utils";

type EditableLine = {
  productId: Id<"products">;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

interface InvoiceEditDialogProps {
  invoice: Doc<"invoices">;
  onClose: () => void;
  onSaved: () => void;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function InvoiceEditDialog({ invoice, onClose, onSaved }: InvoiceEditDialogProps) {
  const updateItems = useMutation(api.invoiceEditor.updateItems);
  const { formatCurrency, formatAmount } = useCurrency();
  const requestId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<EditableLine[]>(() =>
    invoice.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
    })),
  );

  const taxRate = useMemo(() => {
    const taxableBase = invoice.subtotal - invoice.discount;
    if (taxableBase <= 0) return 0;
    return (invoice.tax / taxableBase) * 100;
  }, [invoice.discount, invoice.subtotal, invoice.tax]);

  const summary = useMemo(() => {
    const subtotal = roundMoney(lines.reduce((sum, line) => {
      const lineTotal = line.quantity * line.unitPrice * (1 - line.discount / 100);
      return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
    }, 0));
    const taxable = roundMoney(subtotal - invoice.discount);
    const tax = taxable > 0 ? roundMoney(taxable * taxRate / 100) : 0;
    const total = roundMoney(taxable + tax);
    const remaining = roundMoney(total - invoice.paid);
    return { subtotal, tax, total, remaining };
  }, [invoice.discount, invoice.paid, lines, taxRate]);

  const hasReturn = (invoice.creditedTotal ?? 0) > 0 || ["partial_return", "paid_returned_partial", "returned"].includes(invoice.status);
  const blockedReason = invoice.status === "cancelled"
    ? "لا يمكن تعديل فاتورة ملغاة."
    : hasReturn
      ? "هذه الفاتورة لها مرتجع/إشعار دائن؛ لا يمكن تغيير أصل الفاتورة بعد تسجيل المرتجع."
      : summary.total < invoice.paid
        ? "الإجمالي الجديد أقل من المبلغ المحصل. استرد فرق التحصيل أولاً."
        : lines.length === 0
          ? "يجب أن تحتوي الفاتورة على صنف واحد على الأقل."
          : null;

  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  };

  const save = async () => {
    if (saving || blockedReason) return;
    if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) {
      return toast.error("راجع الكميات؛ يجب أن تكون أرقاماً صحيحة أكبر من صفر");
    }
    if (lines.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice <= 0)) {
      return toast.error("راجع أسعار الوحدات");
    }

    setSaving(true);
    try {
      await updateItems({
        invoiceId: invoice._id,
        items: lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
        })),
        date: new Date().toISOString().slice(0, 10),
        requestId: requestId.current,
      });
      toast.success("تم تعديل الفاتورة وتحديث المخزون والحسابات");
      requestId.current = crypto.randomUUID();
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تعديل الفاتورة"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-3" dir="rtl" role="dialog" aria-modal="true" data-testid="invoice-edit-modal">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 bg-[var(--erp-navy)] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><Pencil className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-bold text-emerald-200">تعديل فاتورة محفوظة</p>
              <h2 className="mt-1 text-xl font-black">{invoice.invoiceNumber}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 hover:bg-white/15" aria-label="إغلاق تعديل الفاتورة"><X className="h-5 w-5" /></button>
        </header>

        <div className="overflow-y-auto p-5">
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            يمكنك تغيير <strong>الكمية</strong> و<strong>سعر الوحدة</strong> أو حذف صنف. عند الحفظ يتم تصحيح المخزون ورصيد العميل تلقائياً مع تسجيل التعديل في سجل المراجعة.
          </div>

          {hasReturn && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700" data-testid="invoice-edit-return-lock">
              هذه الفاتورة مرتبطة بمرتجع؛ تعديل أصل الفاتورة بعد المرتجع غير مسموح محاسبياً.
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الإجمالي</th><th>حذف</th></tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const lineTotal = roundMoney(line.quantity * line.unitPrice * (1 - line.discount / 100));
                  return (
                    <tr key={`${String(line.productId)}-${index}`}>
                      <td>{formatAmount(index + 1)}</td>
                      <td className="font-black text-slate-800">{line.productName}</td>
                      <td>
                        <input
                          data-testid={`invoice-edit-quantity-${index}`}
                          className="form-input w-24 text-center font-black"
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          disabled={saving || hasReturn}
                          onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          data-testid={`invoice-edit-price-${index}`}
                          className="form-input w-32 text-center font-black"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.unitPrice}
                          disabled={saving || hasReturn}
                          onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) })}
                        />
                      </td>
                      <td>{formatAmount(line.discount)}٪</td>
                      <td className="font-black text-[var(--erp-accent-strong)]">{formatCurrency(lineTotal)}</td>
                      <td>
                        <button
                          type="button"
                          data-testid={`invoice-edit-delete-${index}`}
                          onClick={() => removeLine(index)}
                          disabled={saving || hasReturn}
                          className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          title="حذف الصنف من الفاتورة"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p><strong>المدفوع يظل كما هو:</strong> {formatCurrency(invoice.paid)}</p>
              <p className="mt-2">الخصم العام المسجل يظل كما هو: {formatCurrency(invoice.discount)}</p>
              <p className="mt-2">إذا أصبح الإجمالي الجديد أقل من المبلغ المحصل، سيطلب النظام استرداد الفرق أولاً.</p>
            </div>
            <dl className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex justify-between"><dt>المجموع الفرعي الجديد</dt><dd className="font-bold">{formatCurrency(summary.subtotal)}</dd></div>
              <div className="flex justify-between"><dt>الخصم</dt><dd className="font-bold text-red-600">{formatCurrency(invoice.discount)}</dd></div>
              <div className="flex justify-between"><dt>الضريبة</dt><dd className="font-bold">{formatCurrency(summary.tax)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2"><dt className="font-black">الإجمالي الجديد</dt><dd className="font-black text-[var(--erp-accent-strong)]">{formatCurrency(summary.total)}</dd></div>
              <div className="flex justify-between"><dt>المتبقي الجديد</dt><dd className="font-black text-amber-700">{formatCurrency(summary.remaining)}</dd></div>
            </dl>
          </div>

          {blockedReason && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{blockedReason}</div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>إلغاء</button>
          <button type="button" data-testid="invoice-edit-save" className="btn-primary flex items-center gap-2" onClick={() => void save()} disabled={saving || Boolean(blockedReason)}>
            <Save className="h-4 w-4" />
            {saving ? "جارٍ حفظ التعديل..." : "حفظ التعديلات"}
          </button>
        </footer>
      </div>
    </div>
  );
}
