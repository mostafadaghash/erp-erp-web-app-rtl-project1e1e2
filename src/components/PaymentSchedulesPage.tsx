import { useCurrency } from "../lib/utils";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, CheckCircle2, Plus, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";
import { usePermission } from "../lib/access";

const today = new Date().toISOString().slice(0, 10);

export function PaymentSchedulesPage({ createRequestToken }: { createRequestToken?: number }) {
  const { formatCurrency } = useCurrency();
  const canViewBranches = usePermission("view_branches");
  const canCancel = usePermission("reverse_financial_transactions");
  const me = useQuery(api.employees.me);
  const branches = useQuery(api.branches.list, canViewBranches ? {} : "skip") ?? [];
  const [branchId, setBranchId] = useState("");
  const effectiveBranch = (me?.branchId ?? (branchId || undefined)) as Id<"branches"> | undefined;
  const rows = useQuery(api.paymentSchedules.list, effectiveBranch ? { branchId: effectiveBranch } : me && !me.branchId ? "skip" : {}) ?? [];
  const customers = useQuery(api.customers.list, effectiveBranch ? { branchId: effectiveBranch } : "skip") ?? [];
  const suppliers = useQuery(api.suppliers.list) ?? [];
  const accounts = useQuery(api.finance.accounts, effectiveBranch ? { branchId: effectiveBranch } : {}) ?? [];
  const createSchedule = useMutation(api.paymentSchedules.create);
  const settleSchedule = useMutation(api.paymentSchedules.settle);
  const cancelSchedule = useMutation(api.paymentSchedules.cancel);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"check" | "installment">("check");
  const [direction, setDirection] = useState<"receivable" | "payable">("receivable");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [settlementTarget, setSettlementTarget] = useState<Id<"paymentSchedules"> | null>(null);
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Id<"paymentSchedules"> | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  useEffect(() => { if (me?.branchId) setBranchId(String(me.branchId)); }, [me?.branchId]);
  useEffect(() => { if (createRequestToken) setOpen(true); }, [createRequestToken]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveBranch) return toast.error("اختر الفرع");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error("أدخل مبلغًا صحيحًا");
    if (!counterpartyId && !counterpartyName.trim()) return toast.error("اختر الطرف أو اكتب اسمه");
    setBusy(true);
    try {
      await createSchedule({ kind, direction, branchId: effectiveBranch, customerId: direction === "receivable" && counterpartyId ? counterpartyId as Id<"customers"> : undefined, supplierId: direction === "payable" && counterpartyId ? counterpartyId as Id<"suppliers"> : undefined, counterpartyName: counterpartyName || undefined, amount: value, dueDate, referenceNumber: referenceNumber || undefined, notes: notes || undefined });
      toast.success("تم حفظ الاستحقاق"); setOpen(false); setAmount(""); setCounterpartyId(""); setCounterpartyName(""); setNotes(""); setReferenceNumber("");
    } catch (error) { toast.error(getErrorMessage(error, "تعذر حفظ الاستحقاق")); } finally { setBusy(false); }
  };
  const settle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settlementTarget || !settlementAccountId || actionBusy) return;
    setActionBusy(true);
    try {
      await settleSchedule({ scheduleId: settlementTarget, accountId: settlementAccountId as Id<"financialAccounts">, date: today, requestId: crypto.randomUUID() });
      toast.success("تمت تسوية الاستحقاق وربط الحركة بالحساب");
      setSettlementTarget(null);
      setSettlementAccountId("");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تسوية الاستحقاق"));
    } finally {
      setActionBusy(false);
    }
  };
  const cancel = async (event: React.FormEvent) => {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (!cancelTarget || !reason || actionBusy) return;
    setActionBusy(true);
    try {
      await cancelSchedule({ scheduleId: cancelTarget, reason });
      toast.success("تم إلغاء الاستحقاق");
      setCancelTarget(null);
      setCancelReason("");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر الإلغاء"));
    } finally {
      setActionBusy(false);
    }
  };

  return <div className="erp-page space-y-5" data-testid="payment-schedules-page"><header className="erp-page-header"><div><p className="erp-kicker">الحسابات</p><h1 className="erp-page-title">الشيكات والأقساط</h1><p className="erp-page-subtitle">استحقاقات القبض والسداد مع تنبيه الحالة وربط التسوية بالخزنة.</p></div><button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />استحقاق جديد</button></header>{!me?.branchId && branches.length > 0 && <section className="professional-panel p-4"><select className="form-input max-w-sm" value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">اختر الفرع</option>{branches.filter(row => row.isActive).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></section>}<section className="erp-section"><div className="overflow-x-auto"><table className="data-table min-w-[880px]"><thead><tr><th>الرقم</th><th>النوع</th><th>الاتجاه</th><th>الطرف</th><th>الاستحقاق</th><th>المبلغ</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{rows.map(row => { const overdue = row.status === "pending" && row.dueDate < today; return <tr key={row._id}><td className="font-mono font-bold">{row.scheduleNumber}</td><td>{row.kind === "check" ? "شيك" : "قسط"}</td><td>{row.direction === "receivable" ? "لنا" : "علينا"}</td><td>{row.counterpartyName}</td><td className={overdue ? "font-bold text-rose-700" : ""}>{row.dueDate}{overdue ? " — متأخر" : ""}</td><td className="font-black">{formatCurrency(row.amount)}</td><td><span className={`badge ${row.status === "settled" ? "badge-success" : row.status === "cancelled" ? "badge-danger" : overdue ? "badge-danger" : "badge-warning"}`}>{row.status === "settled" ? "تمت التسوية" : row.status === "cancelled" ? "ملغي" : "قيد الاستحقاق"}</span></td><td className="flex gap-2">{row.status === "pending" && <button className="erp-action" onClick={() => { setSettlementTarget(row._id); setSettlementAccountId(""); }}><CheckCircle2 className="h-4 w-4" />تسوية</button>}{canCancel && row.status === "pending" && <button className="erp-action erp-action-danger" onClick={() => { setCancelTarget(row._id); setCancelReason(""); }}><XCircle className="h-4 w-4" />إلغاء</button>}</td></tr>; })}</tbody></table>{rows.length === 0 && <div className="erp-empty-state"><CalendarClock className="mx-auto mb-2 h-8 w-8" />لا توجد استحقاقات مسجلة.</div>}</div></section>{open && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/45 p-4"><form onSubmit={submit} className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-xl font-black">استحقاق جديد</h2><button type="button" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div><div className="grid gap-3 sm:grid-cols-2"><div><label className="form-label">النوع</label><select className="form-input" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="check">شيك</option><option value="installment">قسط</option></select></div><div><label className="form-label">الاتجاه</label><select className="form-input" value={direction} onChange={event => { setDirection(event.target.value as typeof direction); setCounterpartyId(""); }}><option value="receivable">مستحق لنا</option><option value="payable">مستحق علينا</option></select></div></div><div><label className="form-label">{direction === "receivable" ? "العميل" : "المورد"}</label><select className="form-input" value={counterpartyId} onChange={event => setCounterpartyId(event.target.value)}><option value="">طرف عام</option>{(direction === "receivable" ? customers : suppliers).filter(row => row.isActive !== false).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></div>{!counterpartyId && <div><label className="form-label">اسم الطرف *</label><input className="form-input" value={counterpartyName} onChange={event => setCounterpartyName(event.target.value)} /></div>}<div className="grid gap-3 sm:grid-cols-2"><div><label className="form-label">المبلغ *</label><input required type="number" min="0.01" step="0.01" className="form-input" value={amount} onChange={event => setAmount(event.target.value)} /></div><div><label className="form-label">تاريخ الاستحقاق *</label><input required type="date" className="form-input" value={dueDate} onChange={event => setDueDate(event.target.value)} /></div></div><div><label className="form-label">رقم مرجعي</label><input className="form-input" value={referenceNumber} onChange={event => setReferenceNumber(event.target.value)} /></div><div><label className="form-label">ملاحظات</label><textarea className="form-input" rows={2} value={notes} onChange={event => setNotes(event.target.value)} /></div><button disabled={busy} className="btn-primary w-full">{busy ? "جارٍ الحفظ…" : "حفظ الاستحقاق"}</button></form></div>}{settlementTarget && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/45 p-4"><form onSubmit={settle} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-xl font-black">تسوية الاستحقاق</h2><button type="button" onClick={() => setSettlementTarget(null)}><X className="h-5 w-5" /></button></div><div><label className="form-label">الخزنة أو الحساب *</label><select autoFocus required className="form-input" value={settlementAccountId} onChange={event => setSettlementAccountId(event.target.value)}><option value="">اختر الحساب</option>{accounts.filter(account => account.isActive).map(account => <option key={account._id} value={account._id}>{account.name} — {formatCurrency(account.currentBalance)}</option>)}</select></div><div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setSettlementTarget(null)}>إلغاء</button><button disabled={actionBusy || !settlementAccountId} className="btn-primary">{actionBusy ? "جارٍ التسوية…" : "تأكيد التسوية"}</button></div></form></div>}{cancelTarget && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/45 p-4"><form onSubmit={cancel} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-xl font-black">إلغاء الاستحقاق</h2><button type="button" onClick={() => setCancelTarget(null)}><X className="h-5 w-5" /></button></div><div><label className="form-label">سبب الإلغاء *</label><textarea autoFocus required className="form-input" rows={3} maxLength={300} value={cancelReason} onChange={event => setCancelReason(event.target.value)} /></div><div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setCancelTarget(null)}>تراجع</button><button disabled={actionBusy || !cancelReason.trim()} className="btn-danger">{actionBusy ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}</button></div></form></div>}</div>;
}
