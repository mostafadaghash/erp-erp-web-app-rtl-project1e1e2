import { useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { toast } from "sonner";
import { BookOpen, Printer } from "lucide-react";

const requestId = () => crypto.randomUUID();

export function CustomerLedgerPage() {
  const canView = usePermission("view_customer_ledger"), canInitialize = usePermission("initialize_customer_ledger"), canPrint = usePermission("print_customer_statements");
  const me = useQuery(api.employees.me), branches = useQuery(api.customerLedger.availableBranches, canView ? {} : "skip");
  const [branchId, setBranchId] = useState<Id<"branches"> | null>(null), [customerId, setCustomerId] = useState<Id<"customers"> | null>(null), [busy, setBusy] = useState(false);
  const effectiveBranch = branchId ?? (me?.role === "manager" ? me.branchId : branches?.[0]?._id) ?? null;
  const balances = useQuery(api.customerLedger.branchBalances, canView && effectiveBranch ? { branchId: effectiveBranch } : "skip");
  const ledgerArgs = canView && effectiveBranch && customerId ? { customerId, branchId: effectiveBranch } : "skip";
  const { results, status, loadMore } = usePaginatedQuery(api.customerLedger.ledger, ledgerArgs, { initialNumItems: 20 });
  const printStatement = useQuery(api.customerLedger.statementForPrint, "skip");
  const initialize = useMutation(api.customerLedger.initializeOpeningBalance);
  const retryRequestId = useRef(requestId());
  const [opening, setOpening] = useState({ receivableBalance: "0", advanceBalance: "0", totalPurchases: "0", date: "", notes: "" });
  const selected = useMemo(() => balances?.find(x => x.customerId === customerId), [balances, customerId]);

  const handleInitialize = async (event: React.FormEvent) => { event.preventDefault(); if (busy || !canInitialize || !effectiveBranch || !customerId) return; setBusy(true); try { await initialize({ customerId, branchId: effectiveBranch, receivableBalance: Number(opening.receivableBalance), advanceBalance: Number(opening.advanceBalance), totalPurchases: Number(opening.totalPurchases), date: opening.date, notes: opening.notes || undefined, requestId: retryRequestId.current }); toast.success("تم تسجيل الرصيد الافتتاحي"); retryRequestId.current = requestId(); } catch (error) { toast.error(getErrorMessage(error, "تعذر تسجيل الرصيد الافتتاحي")); } finally { setBusy(false); } };
  const handlePrint = async () => { if (busy || !canPrint || !effectiveBranch || !customerId) return; setBusy(true); try { void printStatement; window.print(); } catch (error) { toast.error(getErrorMessage(error, "تعذر طباعة كشف الحساب")); } finally { setBusy(false); } };
  if (!canView) return <div className="p-8 text-center text-slate-500">لا تملك صلاحية عرض دفتر العملاء</div>;
  return <div className="p-4 lg:p-6 space-y-5" dir="rtl">
    <div className="flex justify-between"><h1 className="text-2xl font-black flex gap-2"><BookOpen /> دفتر العملاء</h1>{canPrint && customerId && <button disabled={busy} onClick={() => void handlePrint()} className="btn-secondary flex gap-2"><Printer className="w-4" /> طباعة كشف حساب</button>}</div>
    {(me?.role === "admin" || me?.role === "accountant") && <select aria-label="اختيار الفرع" className="form-input max-w-xs" value={effectiveBranch ?? ""} onChange={e => { setBranchId(e.target.value as Id<"branches">); setCustomerId(null); }}>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select>}
    <div className="grid md:grid-cols-3 gap-4"><section className="bg-white rounded-xl border p-3 space-y-2">{balances?.map(balance => <button key={balance.customerId} onClick={() => setCustomerId(balance.customerId)} className="w-full text-right p-3 rounded-lg hover:bg-slate-50"><b>{balance.customerName}</b><div className="text-xs mt-1">مديونية: {balance.receivableBalance.toLocaleString("ar-EG")} · عربون: {balance.advanceBalance.toLocaleString("ar-EG")}</div></button>)}</section>
    <section className="md:col-span-2 bg-white rounded-xl border overflow-hidden"><div className="p-4 border-b font-bold">{selected?.customerName ?? "اختر عميلاً"}</div>{results.map(entry => <article key={entry.id} className="p-4 border-b text-sm"><div className="flex justify-between"><b>{entry.description}</b><span>{entry.date}</span></div><div className="text-slate-500">{entry.referenceType} · {entry.referenceNumber} · {entry.entryNumber}</div><div>المديونية: {entry.receivableBefore} ← {entry.receivableAfter} | المقدم: {entry.advanceBefore} ← {entry.advanceAfter}</div></article>)}{customerId && status === "CanLoadMore" && <button disabled={busy} onClick={() => loadMore(20)} className="m-4 btn-secondary">تحميل المزيد</button>}</section></div>
    {canInitialize && customerId && <form onSubmit={handleInitialize} className="bg-white rounded-xl border p-4 grid md:grid-cols-3 gap-3"><h2 className="md:col-span-3 font-bold">الرصيد الافتتاحي</h2>{(["receivableBalance", "advanceBalance", "totalPurchases"] as const).map(key => <input key={key} className="form-input" type="number" min="0" step="0.01" value={opening[key]} onChange={e => setOpening(x => ({ ...x, [key]: e.target.value }))} />)}<input required type="date" className="form-input" value={opening.date} onChange={e => setOpening(x => ({ ...x, date: e.target.value }))}/><input className="form-input" placeholder="ملاحظات" value={opening.notes} onChange={e => setOpening(x => ({ ...x, notes: e.target.value }))}/><button disabled={busy} className="btn-primary">{busy ? "جارٍ الحفظ..." : "تسجيل الرصيد"}</button></form>}
  </div>;
}
