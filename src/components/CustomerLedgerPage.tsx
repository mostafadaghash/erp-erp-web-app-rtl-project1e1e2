import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { toast } from "sonner";
import { BookOpen, Printer } from "lucide-react";

const requestId = () => crypto.randomUUID();

export function CustomerLedgerPage() {
  const canView = usePermission("view_customer_ledger"), canInitialize = usePermission("initialize_customer_ledger"), canPrint = usePermission("print_customer_statements");
  const me = useQuery(api.employees.me), branches = useQuery(api.customerLedger.availableBranches, canView ? {} : "skip");
  const [branchId, setBranchId] = useState<Id<"branches"> | null>(null), [customerId, setCustomerId] = useState<Id<"customers"> | null>(null), [busy, setBusy] = useState(false), [printTarget, setPrintTarget] = useState(false);
  const effectiveBranch = branchId ?? (me?.role === "manager" ? me.branchId : branches?.[0]?._id) ?? null;
  const options = useQuery(api.customerLedger.customerOptions, canView && effectiveBranch ? { branchId: effectiveBranch } : "skip");
  const ledgerArgs = canView && effectiveBranch && customerId ? { customerId, branchId: effectiveBranch } : "skip";
  const { results, status, loadMore } = usePaginatedQuery(api.customerLedger.ledger, ledgerArgs, { initialNumItems: 20 });
  const printStatement = useQuery(api.customerLedger.statementForPrint, printTarget && canPrint && effectiveBranch && customerId ? { branchId: effectiveBranch, customerId } : "skip");
  const initialize = useMutation(api.customerLedger.initializeOpeningBalance);
  const retryRequestId = useRef(requestId());
  const [opening, setOpening] = useState({ receivableBalance: "0", advanceBalance: "0", totalPurchases: "0", notes: "" });
  const selected = useMemo(() => options?.customers.find(x => x.customerId === customerId), [options, customerId]);

  useEffect(() => { if (!printTarget || !printStatement) return; const timer = window.setTimeout(() => { window.print(); setPrintTarget(false); setBusy(false); }, 0); return () => window.clearTimeout(timer); }, [printTarget, printStatement]);

  const handleInitialize = async (event: React.FormEvent) => { event.preventDefault(); if (busy || !canInitialize || !effectiveBranch || !customerId || selected?.openingState !== "not_started" || !options?.cutoverDate) return; setBusy(true); try { await initialize({ customerId, branchId: effectiveBranch, receivableBalance: Number(opening.receivableBalance), advanceBalance: Number(opening.advanceBalance), totalPurchases: Number(opening.totalPurchases), date: options.cutoverDate, notes: opening.notes || undefined, requestId: retryRequestId.current }); toast.success("تم تسجيل الرصيد الافتتاحي"); retryRequestId.current = requestId(); } catch (error) { toast.error(getErrorMessage(error, "تعذر تسجيل الرصيد الافتتاحي")); } finally { setBusy(false); } };
  const handlePrint = () => { if (busy || printTarget || !canPrint || !effectiveBranch || !customerId) return; setBusy(true); setPrintTarget(true); };
  const selectCustomer = (id: Id<"customers">) => { setCustomerId(id); retryRequestId.current = requestId(); };
  if (!canView) return <div className="p-8 text-center text-slate-500">لا تملك صلاحية عرض دفتر العملاء</div>;
  return <div className="p-4 lg:p-6 space-y-5" dir="rtl">
    <div className="print:hidden flex justify-between"><h1 className="text-2xl font-black flex gap-2"><BookOpen /> دفتر العملاء</h1>{canPrint && customerId && <button disabled={busy} onClick={handlePrint} className="btn-secondary flex gap-2"><Printer className="w-4" /> {printTarget ? "جارٍ تجهيز الكشف..." : "طباعة كشف حساب"}</button>}</div>
    {(me?.role === "admin" || me?.role === "accountant") && <select aria-label="اختيار الفرع" className="print:hidden form-input max-w-xs" value={effectiveBranch ?? ""} onChange={e => { setBranchId(e.target.value as Id<"branches">); setCustomerId(null); retryRequestId.current = requestId(); }}>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select>}
    <div className="print:hidden grid md:grid-cols-3 gap-4"><section className="bg-white rounded-xl border p-3 space-y-2">{options?.customers.map(customer => <button key={customer.customerId} onClick={() => selectCustomer(customer.customerId)} className="w-full text-right p-3 rounded-lg hover:bg-slate-50"><b>{customer.customerName}</b><div className="text-xs mt-1">مديونية: {customer.receivableBalance.toLocaleString("ar-EG")} · عربون: {customer.advanceBalance.toLocaleString("ar-EG")}</div></button>)}</section>
    <section className="md:col-span-2 bg-white rounded-xl border overflow-hidden"><div className="p-4 border-b font-bold">{selected?.customerName ?? "اختر عميلاً"}</div>{results.map(entry => <article key={entry.id} className="p-4 border-b text-sm"><div className="flex justify-between"><b>{entry.description}</b><span>{entry.date}</span></div><div className="text-slate-500">{entry.referenceType} · {entry.referenceNumber} · {entry.entryNumber}</div><div>المديونية: {entry.receivableBefore} ← {entry.receivableAfter} | المقدم: {entry.advanceBefore} ← {entry.advanceAfter}</div></article>)}{customerId && status === "CanLoadMore" && <button disabled={busy} onClick={() => loadMore(20)} className="m-4 btn-secondary">تحميل المزيد</button>}</section></div>
    {canInitialize && selected?.openingState === "not_started" && <form onSubmit={handleInitialize} className="print:hidden bg-white rounded-xl border p-4 grid md:grid-cols-3 gap-3"><h2 className="md:col-span-3 font-bold">الرصيد الافتتاحي — تاريخ القطع {options?.cutoverDate ?? "غير محدد"}</h2>{(["receivableBalance", "advanceBalance", "totalPurchases"] as const).map(key => <input key={key} className="form-input" type="number" min="0" step="0.01" value={opening[key]} onChange={e => setOpening(x => ({ ...x, [key]: e.target.value }))} />)}<input className="form-input" placeholder="ملاحظات" value={opening.notes} onChange={e => setOpening(x => ({ ...x, notes: e.target.value }))}/><button disabled={busy || !options?.cutoverDate} className="btn-primary">{busy ? "جارٍ الحفظ..." : "تسجيل الرصيد"}</button></form>}
    {selected?.openingState === "posted" && <p className="print:hidden rounded-lg bg-emerald-50 p-3">تم تسجيل الرصيد الافتتاحي لهذا العميل.</p>}
    {selected?.openingState === "blocked_by_activity" && <p className="print:hidden rounded-lg bg-amber-50 p-3">بدأت حركة أو توجد بيانات قديمة لهذا العميل؛ يجب مراجعته قبل تسجيل الرصيد الافتتاحي.</p>}
    {printTarget && printStatement && <CustomerStatement statement={printStatement} />}
  </div>;
}

function CustomerStatement({ statement }: { statement: FunctionReturnType<typeof api.customerLedger.statementForPrint> }) {
  return <main className="hidden print:block text-black bg-white p-6" dir="rtl"><header className="text-center border-b pb-3"><h1 className="text-2xl font-bold">كشف حساب عميل</h1><h2>{statement.branch.name}</h2><p>{statement.branch.address} {statement.branch.phone}</p></header><section className="my-4 grid grid-cols-2"><p>العميل: {statement.customer.name}</p><p>الهاتف: {statement.customer.phone}</p><p>العنوان: {statement.customer.address ?? "—"}</p><p>وقت الطباعة: {new Date().toLocaleString("ar-EG")}</p></section><p>الرصيد الافتتاحي: مديونية {statement.openingBalance.receivable} · مقدم {statement.openingBalance.advance} · مشتريات {statement.openingBalance.totalPurchases}</p><table className="w-full text-xs border-collapse my-4"><thead><tr>{["القيد", "التاريخ", "النوع والحالة", "المرجع", "الوصف", "المديونية", "المقدم", "المشتريات", "الأرصدة بعد القيد", "المستخدم"].map(label => <th className="border p-1" key={label}>{label}</th>)}</tr></thead><tbody>{statement.entries.map(entry => <tr key={entry.entryNumber}><td className="border p-1">{entry.entryNumber}</td><td className="border p-1">{entry.date}</td><td className="border p-1">{entry.type} / {entry.status}</td><td className="border p-1">{entry.referenceType} {entry.referenceNumber}</td><td className="border p-1">{entry.description}</td><td className="border p-1">{entry.receivableDelta}</td><td className="border p-1">{entry.advanceDelta}</td><td className="border p-1">{entry.purchasesDelta}</td><td className="border p-1">{entry.receivableAfter} / {entry.advanceAfter} / {entry.totalPurchasesAfter}</td><td className="border p-1">{entry.createdByName}</td></tr>)}</tbody></table><section><p>الأرصدة النهائية: مديونية {statement.balances.receivable} · مقدم {statement.balances.advance} · مشتريات {statement.balances.totalPurchases}</p><p>إجماليات الحركة: مدين {statement.totals.receivableDebit} · دائن {statement.totals.receivableCredit} · مقدم داخل {statement.totals.advanceIn} · مقدم خارج {statement.totals.advanceOut} · مشتريات {statement.totals.purchasesIn} · عكس مشتريات {statement.totals.purchasesOut}</p></section><footer className="grid grid-cols-3 gap-8 mt-16 text-center"><span>توقيع العميل</span><span>توقيع المحاسب</span><span>اعتماد الإدارة</span></footer></main>;
}
