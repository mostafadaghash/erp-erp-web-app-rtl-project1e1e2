import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";
import { toast } from "sonner";

const newRequestId=()=>crypto.randomUUID();
export function GeneralLedgerPage(){
 const status=useQuery(api.generalLedger.status),accounts=useQuery(api.generalLedger.accountPicker),periods=useQuery(api.generalLedger.periods);
 const initialize=useMutation(api.generalLedger.initialize),post=useMutation(api.generalLedger.postManualJournal);
 const request=useRef(newRequestId()); const [busy,setBusy]=useState(false),[branchId,setBranchId]=useState(""),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[memo,setMemo]=useState(""),[debit,setDebit]=useState(0),[credit,setCredit]=useState(0),[debitAccount,setDebitAccount]=useState(""),[creditAccount,setCreditAccount]=useState("");
 const difference=useMemo(()=>Math.round((debit-credit)*100)/100,[debit,credit]);
 const run=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);try{await action();toast.success("تمت العملية بنجاح");request.current=newRequestId();}catch(error){toast.error(getErrorMessage(error));}finally{setBusy(false);}};
 return <div className="p-6 space-y-6" dir="rtl">
  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900"><strong>وضع التأسيس Foundation</strong><p className="text-sm">الربط التلقائي للمبيعات والمخزون والمستندات التشغيلية غير مفعّل بعد.</p></div>
  <header><h1 className="text-2xl font-black text-slate-900">الأستاذ العام</h1><p className="text-sm text-slate-500">دليل موحد، قيود مزدوجة، وفترات مالية منضبطة — العملة الأساسية EGP.</p></header>
  <section className="card p-5"><h2 className="font-bold mb-3">حالة التهيئة</h2>{status?.initialized?<div className="text-emerald-700">جاهز للتأسيس · إصدار {status.chartVersion} · التشغيل الآلي: غير مفعّل</div>:<button disabled={busy} className="btn-primary" onClick={()=>void run(()=>initialize({cutoverDate:date,requestId:request.current}))}>تهيئة دليل الحسابات</button>}</section>
  <section className="card p-5"><h2 className="font-bold mb-3">قيد يدوي متعدد السطور</h2><div className="grid md:grid-cols-3 gap-3"><input className="input" value={branchId} onChange={e=>setBranchId(e.target.value)} placeholder="معرف الفرع"/><input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)}/><input className="input" value={memo} onChange={e=>setMemo(e.target.value)} placeholder="البيان"/><select className="input" value={debitAccount} onChange={e=>setDebitAccount(e.target.value)}><option value="">الحساب المدين</option>{accounts?.map(a=><option key={a._id} value={a._id}>{a.code} — {a.nameAr}</option>)}</select><input className="input" type="number" step="0.01" min="0" value={debit} onChange={e=>setDebit(Number(e.target.value))}/><select className="input" value={creditAccount} onChange={e=>setCreditAccount(e.target.value)}><option value="">الحساب الدائن</option>{accounts?.map(a=><option key={a._id} value={a._id}>{a.code} — {a.nameAr}</option>)}</select><input className="input" type="number" step="0.01" min="0" value={credit} onChange={e=>setCredit(Number(e.target.value))}/></div><div className="mt-4 flex gap-5 text-sm"><span>المدين: {debit.toFixed(2)}</span><span>الدائن: {credit.toFixed(2)}</span><span className={difference===0?"text-emerald-700":"text-red-700"}>الفرق: {difference.toFixed(2)}</span></div><button className="btn-primary mt-4" disabled={busy||difference!==0||debit<=0||!branchId||!debitAccount||!creditAccount} onClick={()=>void run(()=>post({branchId:branchId as Id<"branches">,date,memo,requestId:request.current,lines:[{accountId:debitAccount as Id<"chartOfAccounts">,debit,credit:0},{accountId:creditAccount as Id<"chartOfAccounts">,debit:0,credit}]}))}>ترحيل القيد</button></section>
  <section className="card p-5"><h2 className="font-bold mb-3">الفترات المالية</h2><div className="flex flex-wrap gap-2">{periods?.map(p=><span className="rounded-lg border px-3 py-2 text-sm" key={p.periodKey}>{p.periodKey} · {p.status==="open"?"مفتوحة":"مغلقة"}</span>)}</div></section>
  <section className="card p-5"><h2 className="font-bold">دليل الحسابات ودفتر الحساب وميزان المراجعة</h2><p className="text-sm text-slate-500 mt-2">تتوفر البيانات من واجهات Convex المحمية والمحدودة، مع الطباعة العربية RTL والعزل حسب الفرع.</p></section>
 </div>;
}
