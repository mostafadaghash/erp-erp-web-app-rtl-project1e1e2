import { useCurrency } from "../lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { PackageOpen, Pencil, Printer, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  canonicalPurchaseReturnItems,
  incrementalGoodsCredit,
  splitPurchaseCredit,
  totalPurchaseCredit,
} from "../../shared/purchaseReturnRules";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { PurchaseReturnEditDialog } from "./PurchaseReturnEditDialog";

const newRequestId = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

export function PurchaseReturnsPage() {
  const { formatCurrency } = useCurrency();
  const money = formatCurrency;
  const canView = usePermission("view_purchase_returns");
  const canCreate = usePermission("create_purchase_returns");
  const canReverse = usePermission("reverse_purchase_returns");
  const canReverseFinance = usePermission("reverse_financial_transactions");
  const canPrint = usePermission("print_purchase_returns");
  const canViewRefundAccounts = usePermission("view_purchase_return_refund_accounts");
  const canRecordRefund = usePermission("record_supplier_refunds");
  const me = useQuery(api.employees.me);
  const branches = useQuery(api.branches.list, me?.role === "admin" ? {} : "skip") ?? [];
  const suppliers = useQuery(api.purchaseReturns.supplierOptions, canCreate ? {} : "skip") ?? [];
  const [selectedBranchId, setSelectedBranchId] = useState<Id<"branches"> | "">("");
  const effectiveBranchId = me?.role === "admin" ? selectedBranchId : (me?.branchId ?? "");
  const [supplierId, setSupplierId] = useState<Id<"suppliers"> | "">("");
  const [receiptId, setReceiptId] = useState<Id<"purchaseReceipts"> | "">("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [externalCreditNoteNumber, setExternalCreditNoteNumber] = useState("");
  const [freight, setFreight] = useState(0);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [accountId, setAccountId] = useState<Id<"financialAccounts"> | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const createRequestId = useRef(newRequestId());
  const reversalRequestId = useRef(newRequestId());

  const receipts = useQuery(
    api.purchaseReturns.eligibleReceipts,
    canCreate && supplierId && effectiveBranchId ? { supplierId, branchId: effectiveBranchId } : "skip",
  ) ?? [];
  const receipt = receipts.find((row) => row._id === receiptId);
  const rawItems = receipt?.items
    .map((item) => ({
      receiptItemIndex: item.receiptItemIndex,
      quantity: quantities[item.receiptItemIndex] ?? 0,
    }))
    .filter((item) => item.quantity > 0) ?? [];

  const preview = useMemo(() => {
    try {
      const items = canonicalPurchaseReturnItems(rawItems, freight);
      const goods = items.reduce((sum, input) => {
        const item = receipt?.items.find((row) => row.receiptItemIndex === input.receiptItemIndex);
        return sum + (item
          ? incrementalGoodsCredit(
              item.historicalLineTotal,
              item.originalQuantity,
              item.returnedQuantity,
              input.quantity,
            )
          : 0);
      }, 0);
      const total = totalPurchaseCredit(goods, freight);
      return { goods, total, ...splitPurchaseCredit(receipt?.remainingAmount ?? 0, total) };
    } catch {
      return { goods: 0, total: 0, debtReduction: 0, cashRefund: 0 };
    }
  }, [rawItems, receipt, freight]);

  const accounts = useQuery(
    api.purchaseReturns.supplierRefundAccountPicker,
    canViewRefundAccounts && canRecordRefund && preview.cashRefund > 0 && effectiveBranchId
      ? { branchId: effectiveBranchId }
      : "skip",
  ) ?? [];
  const returns = usePaginatedQuery(
    api.purchaseReturns.list,
    canView && effectiveBranchId ? { branchId: effectiveBranchId } : "skip",
    { initialNumItems: 20 },
  );
  const create = useMutation(api.purchaseReturns.create);
  const reverse = useMutation(api.purchaseReturns.reverse);
  const [reverseRow, setReverseRow] = useState<(typeof returns.results)[number] | null>(null);
  const [editRow, setEditRow] = useState<(typeof returns.results)[number] | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalDate, setReversalDate] = useState(today());
  const [printId, setPrintId] = useState<Id<"purchaseReturns"> | null>(null);
  const printDto = useQuery(
    api.purchaseReturns.getForPrint,
    canPrint && printId ? { purchaseReturnId: printId } : "skip",
  );

  const resetForm = () => {
    setSupplierId("");
    setReceiptId("");
    setQuantities({});
    setFreight(0);
    setAccountId("");
    setReason("");
    setExternalCreditNoteNumber("");
    setError("");
    createRequestId.current = newRequestId();
  };
  const changeSupplier = (id: Id<"suppliers"> | "") => {
    setSupplierId(id);
    setReceiptId("");
    setQuantities({});
    setFreight(0);
    setAccountId("");
    setError("");
    createRequestId.current = newRequestId();
  };
  const changeReceipt = (id: Id<"purchaseReceipts"> | "") => {
    setReceiptId(id);
    setQuantities({});
    setFreight(0);
    setAccountId("");
    setError("");
    createRequestId.current = newRequestId();
  };
  const submit = async () => {
    if (busy || !receiptId || !effectiveBranchId || (!rawItems.length && freight <= 0)) return;
    setBusy(true);
    setError("");
    try {
      await create({
        purchaseReceiptId: receiptId,
        branchId: effectiveBranchId,
        date,
        reason,
        externalCreditNoteNumber: externalCreditNoteNumber || undefined,
        freightCreditAmount: freight,
        refundAccountId: accountId || undefined,
        requestId: createRequestId.current,
        items: rawItems,
      });
      toast.success("تم ترحيل مرتجع المشتريات");
      resetForm();
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };
  const openReverse = (row: (typeof returns.results)[number]) => {
    setReverseRow(row);
    setReversalReason("");
    setReversalDate(today());
    reversalRequestId.current = newRequestId();
  };
  const submitReverse = async () => {
    if (busy || !reverseRow || !reversalReason.trim()) return;
    setBusy(true);
    try {
      await reverse({
        purchaseReturnId: reverseRow._id,
        date: reversalDate,
        reason: reversalReason.trim(),
        requestId: reversalRequestId.current,
      });
      toast.success("تم إلغاء المرتجع");
      setReverseRow(null);
      reversalRequestId.current = newRequestId();
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };
  const handlePrint = (id: Id<"purchaseReturns">) => {
    if (!canPrint) {
      toast.error("ليس لديك صلاحية طباعة إشعار الخصم");
      return;
    }
    setPrintId(id);
  };

  useEffect(() => {
    if (!canPrint || !printId || !printDto) return;
    const esc = (value: string | number | undefined) => String(value ?? "—").replace(
      /[&<>"']/g,
      (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character,
    );
    const items = printDto.items.map((item) =>
      `<tr><td>${esc(item.productName)}</td><td>${item.quantityReturned}</td><td>${item.historicalUnitCost.toFixed(2)}</td><td>${item.goodsCreditAmount.toFixed(2)}</td></tr>`,
    ).join("");
    const reversed = printDto.status === "reversed"
      ? `<p><b>سبب الإلغاء:</b> ${esc(printDto.reversalDate)} — ${esc(printDto.reversalReason)}</p>`
      : "";
    const popup = window.open("", "_blank");
    if (!popup) {
      toast.error("تعذر فتح نافذة الطباعة");
      return;
    }
    popup.document.body.innerHTML = `<!doctype html><html dir="rtl" lang="ar"><head><title>${esc(printDto.returnNumber)}</title><style>body{font-family:Tahoma;padding:32px}h1{text-align:center}table{width:100%;border-collapse:collapse}td,th{border:1px solid;padding:8px}.sign{display:flex;justify-content:space-between;margin-top:70px}</style></head><body><h1>إشعار خصم مورد</h1><p>رقم PRN: ${esc(printDto.returnNumber)} | إشعار المورد: ${esc(printDto.externalCreditNoteNumber)}</p><p>المورد: ${esc(printDto.supplierName)} | الفرع: ${esc(printDto.branchName)} | التاريخ: ${esc(printDto.date)} | الحالة: ${printDto.status === "posted" ? "مرحل" : "ملغي"}</p><p>مستند الشراء: ${esc(printDto.receiptNumber)} | فاتورة المورد: ${esc(printDto.externalInvoiceNumber)}</p><table><thead><tr><th>البند</th><th>الكمية</th><th>التكلفة</th><th>الخصم</th></tr></thead><tbody>${items}</tbody></table><p>خصم الشحن: ${printDto.freightCredit.toFixed(2)} | إجمالي الخصم: ${printDto.totalCredit.toFixed(2)} | خفض المديونية: ${printDto.debtReduction.toFixed(2)} | الرد النقدي: ${printDto.cashRefund.toFixed(2)}</p><p>حساب الرد: ${esc(printDto.refundAccountName)}</p>${reversed}<div class="sign"><span>المُعد: ${esc(printDto.createdBy)}</span><span>المراجع: ............</span><span>المستلم: ............</span></div></body></html>`;
    popup.document.close();
    popup.print();
    setPrintId(null);
  }, [canPrint, printDto, printId]);

  return (
    <div className="erp-page space-y-4" dir="rtl" data-testid="purchase-returns-page">
      <header className="erp-page-header">
        <div>
          <p className="erp-kicker"><Undo2 className="h-4 w-4" />المشتريات والموردون</p>
          <h1 className="erp-page-title"><PackageOpen className="h-6 w-6 text-[var(--erp-accent)]" />مرتجعات المشتريات</h1>
          <p className="erp-page-subtitle">إصدار إشعار خصم مورد واسترجاع الكميات مع تحديث المديونية والخزينة.</p>
        </div>
        <span className="erp-status">{returns.results.length.toLocaleString("ar-EG")} مستند ظاهر</span>
      </header>

      {canCreate && (
        <section className="erp-section" data-testid="purchase-return-form">
          <div className="erp-section-header">
            <div><p className="erp-section-title">بيانات إشعار الخصم</p><p className="mt-1 text-xs text-slate-500">اختر مستند الشراء ثم حدّد الكميات المطلوب إرجاعها.</p></div>
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-800">الإجمالي {money(preview.total)}</span>
              <span className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-800">رد نقدي {money(preview.cashRefund)}</span>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {me?.role === "admin" && <label><span className="form-label">الفرع</span><select aria-label="اختيار الفرع" className="form-input" value={selectedBranchId} onChange={(event) => { setSelectedBranchId(event.target.value as Id<"branches">); resetForm(); }}><option value="">اختر الفرع</option>{branches.filter((branch) => branch.isActive).map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></label>}
              <label><span className="form-label">المورد</span><select data-testid="purchase-return-supplier" className="form-input" value={supplierId} onChange={(event) => changeSupplier(event.target.value as Id<"suppliers">)}><option value="">اختر المورد</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label>
              <label><span className="form-label">مستند الشراء</span><select data-testid="purchase-return-receipt" className="form-input" value={receiptId} onChange={(event) => changeReceipt(event.target.value as Id<"purchaseReceipts">)}><option value="">اختر المستند</option>{receipts.map((row) => <option key={row._id} value={row._id}>{row.receiptNumber}</option>)}</select></label>
              <label><span className="form-label">تاريخ المرتجع</span><input className="form-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            </div>
            <label><span className="form-label">رقم إشعار المورد الخارجي</span><input className="form-input" aria-label="رقم إشعار المورد الخارجي" placeholder="اختياري" maxLength={100} value={externalCreditNoteNumber} onChange={(event) => setExternalCreditNoteNumber(event.target.value)} /></label>

            {receipt ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>الصنف</th><th>الكمية الأصلية</th><th>مرتجع سابق</th><th>المتاح</th><th>كمية المرتجع</th></tr></thead>
                  <tbody>{receipt.items.map((item) => <tr key={item.receiptItemIndex} data-testid="purchase-return-item"><td className="font-bold">{item.productName}</td><td>{item.originalQuantity}</td><td>{item.returnedQuantity}</td><td>{item.availableQuantity}</td><td className="w-40"><input data-testid="purchase-return-quantity" className="form-input text-center" type="number" min="0" max={item.availableQuantity} step="1" value={quantities[item.receiptItemIndex] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.receiptItemIndex]: Number(event.target.value) }))} /></td></tr>)}</tbody>
                </table>
              </div>
            ) : <div className="erp-info-state py-8">اختر المورد ومستند الشراء لعرض الأصناف والكميات المتاحة للمرتجع.</div>}

            <div className="grid gap-3 lg:grid-cols-3">
              <label><span className="form-label">سبب المرتجع *</span><input data-testid="purchase-return-reason" className="form-input" placeholder="مثال: عيب أو اختلاف صنف" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <label><span className="form-label">خصم شحن المورد</span><input className="form-input" aria-label="خصم شحن المورد" type="number" min="0" max={receipt?.availableFreight ?? 0} step="0.01" value={freight} onChange={(event) => setFreight(Number(event.target.value))} /></label>
              {preview.cashRefund > 0 && <label><span className="form-label">حساب استلام الرد</span><select className="form-input" value={accountId} onChange={(event) => setAccountId(event.target.value as Id<"financialAccounts">)}><option value="">اختر الحساب</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select></label>}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2"><p className="text-xs font-bold text-slate-500">خصم البضاعة</p><p className="mt-1 font-black text-slate-900">{money(preview.goods)}</p></div>
              <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2"><p className="text-xs font-bold text-slate-500">خفض المديونية</p><p className="mt-1 font-black text-slate-900">{money(preview.debtReduction)}</p></div>
              <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2"><p className="text-xs font-bold text-slate-500">الرد النقدي</p><p className="mt-1 font-black text-slate-900">{money(preview.cashRefund)}</p></div>
            </div>
            {error && <p role="alert" className="border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
            <div className="flex justify-end border-t border-slate-300 pt-3"><button data-testid="purchase-return-submit" className="btn-primary" disabled={busy || !receiptId || !reason.trim() || (!rawItems.length && freight <= 0) || (preview.cashRefund > 0 && !accountId)} onClick={() => void submit()}>{busy ? "جاري الحفظ..." : "ترحيل المرتجع"}</button></div>
          </div>
        </section>
      )}

      <section className="erp-section">
        <div className="erp-section-header"><h2 className="erp-section-title">سجل مرتجعات المشتريات</h2><span className="text-xs text-slate-500">يمكن طباعة المستند أو تصحيحه أو إلغاؤه حسب الصلاحيات.</span></div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>رقم الإشعار</th><th>المورد</th><th>الفرع</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
            <tbody>
              {returns.results.map((row) => <tr key={row._id}><td className="font-mono font-black text-blue-700">{row.returnNumber}</td><td>{row.supplierName}</td><td>{branches.find((branch) => branch._id === row.branchId)?.name ?? "الفرع الحالي"}</td><td>{row.date}</td><td className="font-black">{money(row.totalCredit)}</td><td><span className={`badge ${row.status === "posted" ? "badge-success" : "badge-danger"}`}>{row.status === "posted" ? "مرحل" : "ملغي"}</span></td><td><div className="flex gap-1">{canPrint && <button className="erp-action" onClick={() => handlePrint(row._id)}><Printer className="h-4 w-4" />طباعة</button>}{canCreate && row.status === "posted" && <button data-testid="purchase-return-edit-open" className="erp-action erp-action-primary" onClick={() => setEditRow(row)}><Pencil className="h-4 w-4" />تعديل</button>}{row.status === "posted" && canReverse && canReverseFinance && <button className="erp-action erp-action-danger" disabled={busy} onClick={() => openReverse(row)}><RotateCcw className="h-4 w-4" />إلغاء</button>}</div></td></tr>)}
              {returns.results.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-500">لا توجد مرتجعات مشتريات في الفرع المحدد.</td></tr>}
            </tbody>
          </table>
        </div>
        {returns.status === "CanLoadMore" && <div className="border-t border-slate-300 p-3 text-center"><button className="erp-action" onClick={() => returns.loadMore(20)}>تحميل المزيد</button></div>}
      </section>

      {editRow && (
        <PurchaseReturnEditDialog
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => setEditRow(null)}
        />
      )}

      {reverseRow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-4 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true">
            <div className="border-b border-slate-300 pb-3"><h2 className="text-lg font-black text-slate-900">إلغاء إشعار الخصم {reverseRow.returnNumber}</h2><p className="mt-1 text-sm text-slate-600">سيتم إلغاء أثر المرتجع على المخزون والخزينة ورصيد المورد ومستند الشراء مع الاحتفاظ بالسجل.</p></div>
            <label><span className="form-label">سبب الإلغاء *</span><input className="form-input" placeholder="اكتب سبب الإلغاء الإلزامي" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} /></label>
            <label><span className="form-label">تاريخ الإلغاء</span><input className="form-input" type="date" value={reversalDate} onChange={(event) => setReversalDate(event.target.value)} /></label>
            <div className="flex justify-end gap-2 border-t border-slate-300 pt-3"><button className="btn-secondary" disabled={busy} onClick={() => setReverseRow(null)}>إلغاء</button><button className="btn-danger" disabled={busy || !reversalReason.trim()} onClick={() => void submitReverse()}>{busy ? "جاري الإلغاء..." : "تأكيد الإلغاء"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
