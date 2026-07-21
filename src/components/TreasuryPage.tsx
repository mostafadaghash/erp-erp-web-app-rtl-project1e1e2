import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { toast } from "sonner";

const labels: Record<string, string> = { cash: "نقدي", instapay: "Instapay", vodafone_cash: "Vodafone Cash", fawry_clearing: "Fawry (معلق)", paymob_clearing: "Paymob (معلق)", card_clearing: "بطاقات (معلق)", bank: "بنك", other: "أخرى" };

export function TreasuryPage() {
  const accounts = useQuery(api.finance.accounts, {});
  const canManage = usePermission("manage_financial_accounts");
  const canInitialize = usePermission("initialize_finance");
  const createAccount = useMutation(api.finance.createAccount);
  const configure = useMutation(api.finance.configureInitialization);
  const confirm = useMutation(api.finance.confirmInitialization);
  const branches = useQuery(api.branches.list, canManage ? {} : "skip");
  const [branchId, setBranchId] = useState(""); const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [cutoverDate, setCutoverDate] = useState(new Date().toISOString().slice(0, 10));
  const selectedBranch = useMemo(() => branchId as Id<"branches">, [branchId]);
  const { results, status, loadMore } = usePaginatedQuery(api.finance.ledger, branchId ? { branchId: selectedBranch } : "skip", { initialNumItems: 25 });
  const add = async () => { try { await createAccount({ branchId: selectedBranch, name, code, type: "cash" }); setName(""); setCode(""); toast.success("تم إنشاء الحساب برصيد صفر"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر إنشاء الحساب"); } };
  return <div className="p-6 space-y-6" dir="rtl">
    <div><h1 className="text-2xl font-bold text-slate-900">الخزائن والحسابات</h1><p className="text-sm text-slate-500">دفتر مالي غير قابل للحذف، والأرصدة محسوبة من الحركات الذرية.</p></div>
    {canInitialize && <section className="card p-5"><h2 className="font-bold mb-3">تهيئة النظام المالي</h2><div className="flex flex-wrap gap-2"><input type="date" className="input" value={cutoverDate} onChange={e => setCutoverDate(e.target.value)} /><button className="btn-secondary" onClick={() => void configure({ cutoverDate, defaultClearingDelayDays: 1 })}>حفظ تاريخ القطع</button><button className="btn-primary" onClick={() => void confirm()}>تأكيد التشغيل نهائياً</button></div><p className="text-xs text-amber-700 mt-2">أنشئ خزينة نقدية لكل فرع وسجّل الأرصدة الافتتاحية قبل التأكيد. لا تُرحّل المستندات القديمة تلقائياً.</p></section>}
    {canManage && <section className="card p-5"><h2 className="font-bold mb-3">إنشاء حساب</h2><div className="grid md:grid-cols-4 gap-2"><select className="input" value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">اختر الفرع</option>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select><input className="input" placeholder="اسم الحساب" value={name} onChange={e => setName(e.target.value)} /><input className="input" placeholder="الكود" value={code} onChange={e => setCode(e.target.value)} /><button className="btn-primary" disabled={!branchId || !name || !code} onClick={() => void add()}>إنشاء خزينة نقدية</button></div></section>}
    <section className="card overflow-hidden"><div className="p-4 font-bold">الحسابات</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3">الحساب</th><th>النوع</th><th>الرصيد الحالي</th><th>المتاح</th><th>المعلق</th><th>الحالة</th></tr></thead><tbody>{accounts?.map(a => <tr key={a._id} className="border-t"><td className="p-3 font-medium">{a.name}</td><td>{labels[a.type]}</td><td>{a.currentBalance.toFixed(2)}</td><td>{a.availableBalance.toFixed(2)}</td><td>{a.pendingBalance.toFixed(2)}</td><td>{a.isActive ? "نشط" : "معطل"}</td></tr>)}</tbody></table></div></section>
    <section className="card overflow-hidden"><div className="p-4 flex justify-between"><span className="font-bold">دفتر الحركة</span><span className="text-xs text-slate-500">اختر فرعاً لعرض السجل المفهرس</span></div><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3">التاريخ</th><th>الحساب</th><th>الداخل</th><th>الخارج</th><th>الرصيد بعد</th></tr></thead><tbody>{results.map(m => <tr key={m._id} className="border-t"><td className="p-3">{m.date}</td><td>{String(m.accountId)}</td><td className="text-emerald-600">{m.signedAmount > 0 ? m.signedAmount.toFixed(2) : "—"}</td><td className="text-red-600">{m.signedAmount < 0 ? (-m.signedAmount).toFixed(2) : "—"}</td><td>{m.balanceAfter.toFixed(2)}</td></tr>)}</tbody></table>{status === "CanLoadMore" && <button className="m-4 btn-secondary" onClick={() => loadMore(25)}>تحميل المزيد</button>}</section>
  </div>;
}
