import { useCurrency } from "../lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowDownToLine, ArrowUpFromLine, Plus, ReceiptText, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";

type VoucherKind = "receipt" | "disbursement";
const today = new Date().toISOString().slice(0, 10);

export function VouchersPage({ initialKind = "receipt", createRequestToken }: { initialKind?: VoucherKind; createRequestToken?: number }) {
  const { formatCurrency } = useCurrency();
  const canReverse = usePermission("reverse_financial_transactions");
  const canViewBranches = usePermission("view_branches");
  const me = useQuery(api.employees.me);
  const branches = useQuery(api.branches.list, canViewBranches ? {} : "skip") ?? [];
  const [branchId, setBranchId] = useState("");
  const effectiveBranch = (me?.branchId ?? (branchId || undefined)) as Id<"branches"> | undefined;
  const accounts = useQuery(api.finance.accounts, effectiveBranch ? { branchId: effectiveBranch } : {}) ?? [];
  const vouchers = useQuery(api.finance.vouchers, effectiveBranch ? { branchId: effectiveBranch } : me && !me.branchId ? "skip" : {}) ?? [];
  const customers = useQuery(api.customers.list, effectiveBranch ? { branchId: effectiveBranch } : "skip") ?? [];
  const suppliers = useQuery(api.suppliers.list) ?? [];
  const createReceipt = useMutation(api.finance.createReceiptVoucher);
  const createDisbursement = useMutation(api.finance.createDisbursementVoucher);
  const reverseVoucher = useMutation(api.finance.reverseVoucher);
  const [kind, setKind] = useState<VoucherKind>(initialKind);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [reverseTarget, setReverseTarget] = useState<{ id: Id<"financialTransactions">; number: string } | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);

  useEffect(() => { if (createRequestToken) { setKind(initialKind); setOpen(true); } }, [createRequestToken, initialKind]);
  useEffect(() => { if (me?.branchId) setBranchId(String(me.branchId)); }, [me?.branchId]);
  const activeAccounts = useMemo(() => accounts.filter(account => account.isActive), [accounts]);

  const reset = () => { setAccountId(""); setCounterpartyId(""); setCounterpartyName(""); setAmount(""); setNotes(""); setDate(today); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!accountId || !Number.isFinite(numericAmount) || numericAmount <= 0) return toast.error("اختر الخزنة وأدخل مبلغًا صحيحًا");
    if (!counterpartyId && !counterpartyName.trim()) return toast.error("اختر الطرف أو اكتب اسمه");
    setBusy(true);
    try {
      if (kind === "receipt") await createReceipt({ accountId: accountId as Id<"financialAccounts">, customerId: counterpartyId ? counterpartyId as Id<"customers"> : undefined, payerName: counterpartyName || undefined, amount: numericAmount, date, requestId: crypto.randomUUID(), notes: notes || undefined });
      else await createDisbursement({ accountId: accountId as Id<"financialAccounts">, supplierId: counterpartyId ? counterpartyId as Id<"suppliers"> : undefined, payeeName: counterpartyName || undefined, amount: numericAmount, date, requestId: crypto.randomUUID(), notes: notes || undefined });
      toast.success(kind === "receipt" ? "تم إنشاء سند القبض" : "تم إنشاء سند الصرف");
      reset(); setOpen(false);
    } catch (error) { toast.error(getErrorMessage(error, "تعذر حفظ السند")); } finally { setBusy(false); }
  };
  const remove = async (event: React.FormEvent) => {
    event.preventDefault();
    const reason = reverseReason.trim();
    if (!reverseTarget || !reason || reversing) return;
    setReversing(true);
    try {
      await reverseVoucher({ transactionId: reverseTarget.id, reason, date: today, requestId: crypto.randomUUID() });
      toast.success("تم حذف السند وإلغاء تأثيره تلقائيًا");
      setReverseTarget(null);
      setReverseReason("");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر حذف السند"));
    } finally {
      setReversing(false);
    }
  };

  return <div className="erp-page space-y-5" data-testid="vouchers-page">
    <header className="erp-page-header"><div><p className="erp-kicker">الحسابات</p><h1 className="erp-page-title">سندات القبض والصرف</h1><p className="erp-page-subtitle">تسجيل الحركة على الخزنة وحساب العميل أو المورد في عملية واحدة موثقة.</p></div><div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => { setKind("receipt"); reset(); setOpen(true); }}><ArrowDownToLine className="h-4 w-4" />سند قبض</button><button className="btn-secondary" onClick={() => { setKind("disbursement"); reset(); setOpen(true); }}><ArrowUpFromLine className="h-4 w-4" />سند صرف</button></div></header>
    {!me?.branchId && branches.length > 0 && <section className="professional-panel p-4"><label className="form-label">الفرع</label><select className="form-input max-w-sm" value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">اختر الفرع</option>{branches.filter(branch => branch.isActive).map(branch => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></section>}
    <section className="erp-section"><div className="erp-section-header"><div><h2 className="erp-section-title">تقارير السندات والحركة</h2><p className="mt-1 text-xs text-slate-500">يظهر الحذف فقط لصاحب الصلاحية، وتبقى العملية محفوظة في سجل المراجعة.</p></div></div><div className="overflow-x-auto"><table className="data-table min-w-[820px]"><thead><tr><th>الرقم</th><th>التاريخ</th><th>النوع</th><th>الطرف</th><th>الخزنة</th><th>المبلغ</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{vouchers.map(row => <tr key={row._id}><td className="font-mono font-bold">{row.transactionNumber}</td><td>{row.date}</td><td><span className={`badge ${row.type === "receipt_voucher" ? "badge-success" : "badge-warning"}`}>{row.type === "receipt_voucher" ? "سند قبض" : "سند صرف"}</span></td><td>{row.counterpartyName}</td><td>{row.accountName}</td><td className="font-black">{formatCurrency(row.amount)}</td><td>{row.status === "posted" ? "نشط" : "محذوف"}</td><td>{canReverse && row.status === "posted" && <button className="erp-action erp-action-danger" onClick={() => { setReverseTarget({ id: row._id, number: row.transactionNumber }); setReverseReason(""); }}><Trash2 className="h-4 w-4" />حذف</button>}</td></tr>)}</tbody></table>{vouchers.length === 0 && <div className="erp-empty-state"><ReceiptText className="mx-auto mb-2 h-8 w-8" />لا توجد سندات في هذا الفرع.</div>}</div></section>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/45 p-4"><form onSubmit={submit} className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="erp-kicker">عملية مالية جديدة</p><h2 className="text-xl font-black">{kind === "receipt" ? "سند قبض" : "سند صرف"}</h2></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div><div><label className="form-label">الخزنة أو الحساب *</label><select required className="form-input" value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">اختر الحساب</option>{activeAccounts.map(account => <option key={account._id} value={account._id}>{account.name} — {formatCurrency(account.currentBalance)}</option>)}</select></div><div><label className="form-label">{kind === "receipt" ? "العميل" : "المورد"} (اختياري)</label><select className="form-input" value={counterpartyId} onChange={event => setCounterpartyId(event.target.value)}><option value="">طرف عام</option>{(kind === "receipt" ? customers : suppliers).filter(row => row.isActive !== false).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></div>{!counterpartyId && <div><label className="form-label">اسم الطرف *</label><input className="form-input" value={counterpartyName} onChange={event => setCounterpartyName(event.target.value)} /></div>}<div className="grid gap-3 sm:grid-cols-2"><div><label className="form-label">المبلغ *</label><input required min="0.01" step="0.01" type="number" className="form-input" value={amount} onChange={event => setAmount(event.target.value)} /></div><div><label className="form-label">التاريخ *</label><input required type="date" className="form-input" value={date} onChange={event => setDate(event.target.value)} /></div></div><div><label className="form-label">البيان</label><textarea className="form-input" rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></div><div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>إلغاء</button><button disabled={busy} className="btn-primary"><Plus className="h-4 w-4" />{busy ? "جارٍ الحفظ…" : "حفظ السند"}</button></div></form></div>}
    {reverseTarget && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/45 p-4"><form onSubmit={remove} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="erp-kicker">إلغاء آمن للحركة</p><h2 className="text-xl font-black">حذف السند {reverseTarget.number}</h2></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setReverseTarget(null)}><X className="h-5 w-5" /></button></div><p className="text-sm text-slate-600">سيُلغي النظام تأثير السند على الخزنة والحسابات مع الاحتفاظ بسجل المراجعة.</p><div><label className="form-label">سبب الحذف *</label><textarea autoFocus required className="form-input" rows={3} maxLength={300} value={reverseReason} onChange={event => setReverseReason(event.target.value)} /></div><div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setReverseTarget(null)}>تراجع</button><button disabled={reversing || !reverseReason.trim()} className="btn-danger">{reversing ? "جارٍ الإلغاء…" : "تأكيد الحذف"}</button></div></form></div>}
  </div>;
}
