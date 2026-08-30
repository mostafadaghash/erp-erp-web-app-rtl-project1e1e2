import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Plus,
  RotateCcw,
  WalletCards,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";

const accountTypeLabels: Record<string, string> = {
  cash: "خزينة نقدية",
  instapay: "InstaPay",
  vodafone_cash: "Vodafone Cash",
  fawry_clearing: "فوري - مبالغ قيد التسوية",
  paymob_clearing: "Paymob - مبالغ قيد التسوية",
  card_clearing: "بطاقات - مبالغ قيد التسوية",
  cod_clearing: "شركات الشحن - مبالغ قيد التحصيل",
  bank: "حساب بنكي",
  other: "حساب آخر",
};

const transactionLabels: Record<string, string> = {
  opening_balance: "رصيد افتتاحي",
  account_transfer: "تحويل بين الحسابات",
  paymob_settlement: "تسوية مدفوعات إلكترونية",
  clearing_settlement: "تسوية حساب وسيط",
  invoice_payment: "تحصيل فاتورة",
  invoice_refund: "استرداد عميل",
  expense_payment: "سداد مصروف",
  supplier_payment: "سداد مورد",
  delivery_cod_collection: "تحصيل شحنة",
  cod_settlement: "تسوية تحصيل شحن",
  receipt_voucher: "سند قبض",
  disbursement_voucher: "سند صرف",
};

const money = new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Dialog = "opening" | "transfer" | "settlement" | "reverse" | "initialize" | null;

export function TreasuryPage() {
  const accounts = useQuery(api.finance.accounts, {});
  const canManage = usePermission("manage_financial_accounts");
  const canInitialize = usePermission("initialize_finance");
  const createAccount = useMutation(api.finance.createAccount);
  const configure = useMutation(api.finance.configureInitialization);
  const confirmInitialization = useMutation(api.finance.confirmInitialization);
  const postOpeningBalance = useMutation(api.finance.postOpeningBalance);
  const transferFunds = useMutation(api.finance.transferFunds);
  const settleClearingAccount = useMutation(api.finance.settleClearingAccount);
  const reverseTransaction = useMutation(api.finance.reverseTransaction);
  const initialization = useQuery(api.finance.initializationStatus, {});
  const branches = useQuery(api.branches.list, canManage ? {} : "skip");

  const today = new Date().toISOString().slice(0, 10);
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<keyof typeof accountTypeLabels>("cash");
  const [cutoverDate, setCutoverDate] = useState(today);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<Id<"financialAccounts"> | null>(null);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [transferSourceId, setTransferSourceId] = useState("");
  const [transferDestinationId, setTransferDestinationId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [settlementSourceId, setSettlementSourceId] = useState("");
  const [settlementDestinationId, setSettlementDestinationId] = useState("");
  const [settlementGross, setSettlementGross] = useState("");
  const [settlementFee, setSettlementFee] = useState("0");
  const [reverseTransactionId, setReverseTransactionId] = useState<Id<"financialTransactions"> | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedBranch = useMemo(() => branchId as Id<"branches">, [branchId]);
  const dailySummary = useQuery(api.finance.dailySummary, branchId ? { branchId: selectedBranch, date: today } : "skip");
  const collectionSummary = useQuery(api.finance.collectionSummary, branchId ? { branchId: selectedBranch, date: today } : "skip");
  const { results, status, loadMore } = usePaginatedQuery(api.finance.ledger, branchId ? { branchId: selectedBranch } : "skip", { initialNumItems: 25 });

  const branchAccounts = useMemo(() => (accounts ?? []).filter(account => !branchId || String(account.branchId) === branchId), [accounts, branchId]);
  const activeAccounts = branchAccounts.filter(account => account.isActive);
  const cashAndBankAccounts = activeAccounts.filter(account => ["cash", "bank"].includes(account.type));
  const clearingAccounts = activeAccounts.filter(account => ["paymob_clearing", "fawry_clearing", "card_clearing"].includes(account.type));
  const totalBalance = branchAccounts.reduce((sum, account) => sum + account.currentBalance, 0);
  const totalAvailable = branchAccounts.reduce((sum, account) => sum + account.availableBalance, 0);
  const totalPending = branchAccounts.reduce((sum, account) => sum + account.pendingBalance, 0);

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setDialog(null);
      setReverseReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إتمام العملية");
    } finally {
      setBusy(false);
    }
  };

  const addAccount = async () => {
    if (!branchId || !name.trim() || !code.trim()) return;
    await run(
      () => createAccount({ branchId: selectedBranch, name: name.trim(), code: code.trim(), type }),
      "تم إنشاء الحساب بنجاح",
    );
    setName("");
    setCode("");
  };

  const openOpeningBalance = (accountId: Id<"financialAccounts">) => {
    setSelectedAccountId(accountId);
    setOpeningAmount("0");
    setDialog("opening");
  };

  const openTransfer = () => {
    const first = cashAndBankAccounts[0];
    const second = cashAndBankAccounts.find(account => account._id !== first?._id);
    setTransferSourceId(first?._id ?? "");
    setTransferDestinationId(second?._id ?? "");
    setTransferAmount("");
    setDialog("transfer");
  };

  const openSettlement = () => {
    setSettlementSourceId(clearingAccounts[0]?._id ?? "");
    setSettlementDestinationId(cashAndBankAccounts[0]?._id ?? "");
    setSettlementGross("");
    setSettlementFee("0");
    setDialog("settlement");
  };

  const openReverse = (transactionId: Id<"financialTransactions">) => {
    setReverseTransactionId(transactionId);
    setReverseReason("");
    setDialog("reverse");
  };

  const canReverseType = (typeName: string) => ["opening_balance", "account_transfer", "paymob_settlement", "clearing_settlement"].includes(typeName);

  return (
    <div data-testid="treasury-page" className="space-y-6 p-4 lg:p-6" dir="rtl">
      <header className="erp-page-header">
        <div>
          <h1 className="erp-page-title"><Landmark className="h-6 w-6 text-emerald-600" />الخزينة والبنوك</h1>
          <p className="erp-page-subtitle">إدارة الحسابات النقدية والبنكية والأرصدة والتحويلات بطريقة واضحة ومباشرة</p>
        </div>
        {canManage && branches && (
          <select className="form-input min-w-56" value={branchId} onChange={event => setBranchId(event.target.value)} aria-label="الفرع">
            <option value="">جميع الفروع</option>
            {branches.filter(branch => branch.isActive).map(branch => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
          </select>
        )}
      </header>

      <section className="erp-metric-grid">
        <div className="erp-metric-card"><div className="flex items-start justify-between"><div><p className="erp-metric-label">إجمالي الأرصدة</p><p className="erp-metric-value text-emerald-700">{money.format(totalBalance)}</p></div><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><CircleDollarSign className="h-5 w-5" /></div></div></div>
        <div className="erp-metric-card"><div className="flex items-start justify-between"><div><p className="erp-metric-label">المتاح للاستخدام</p><p className="erp-metric-value">{money.format(totalAvailable)}</p></div><div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Banknote className="h-5 w-5" /></div></div></div>
        <div className="erp-metric-card"><div className="flex items-start justify-between"><div><p className="erp-metric-label">مبالغ قيد التسوية</p><p className="erp-metric-value">{money.format(totalPending)}</p></div><div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><WalletCards className="h-5 w-5" /></div></div></div>
        <div className="erp-metric-card"><div className="flex items-start justify-between"><div><p className="erp-metric-label">الحسابات النشطة</p><p className="erp-metric-value">{activeAccounts.length.toLocaleString("ar-EG")}</p></div><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><Building2 className="h-5 w-5" /></div></div></div>
      </section>

      {canInitialize && initialization?.state !== "initialized" && (
        <section data-testid="finance-initialization" data-state={initialization?.state ?? "loading"} className="erp-section">
          <div className="erp-section-header">
            <div>
              <h2 className="erp-section-title">إعداد الأرصدة الافتتاحية</h2>
              <p className="mt-1 text-xs text-slate-500">أكمل أرصدة البداية لكل حساب قبل اعتماد التشغيل المالي.</p>
            </div>
            <span className="badge badge-warning">متبقي {initialization?.openingBalancesRemaining ?? 0}</span>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-[220px_1fr_auto] md:items-end">
            <div><label className="form-label">تاريخ بدء التسجيل المالي</label><input data-testid="finance-cutover-date" type="date" disabled={initialization?.state === "initialized"} className="form-input" value={cutoverDate} onChange={event => setCutoverDate(event.target.value)} /></div>
            <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">بعد الاعتماد يبدأ النظام في اعتبار الحركات التالية لهذا التاريخ ضمن الدورة المالية الرسمية. راجع الأرصدة الافتتاحية أولًا.</p>
            <div className="flex flex-wrap gap-2"><button data-testid="finance-configure" className="erp-action" onClick={() => void run(() => configure({ cutoverDate, defaultClearingDelayDays: 1 }), "تم حفظ تاريخ بدء التسجيل المالي")}>حفظ التاريخ</button><button data-testid="finance-confirm" className="btn-primary" disabled={(initialization?.openingBalancesRemaining ?? 1) > 0 || busy} onClick={() => setDialog("initialize")}>اعتماد التشغيل المالي</button></div>
          </div>
        </section>
      )}

      {canManage && (
        <section className="erp-section">
          <div className="erp-section-header"><div><h2 className="erp-section-title">الحسابات المالية</h2><p className="mt-1 text-xs text-slate-500">أضف خزينة أو حسابًا بنكيًا أو حسابًا وسيطًا، ثم تابع رصيده من مكان واحد.</p></div><div className="erp-actions"><button className="erp-action" onClick={openTransfer} disabled={cashAndBankAccounts.length < 2}><ArrowLeftRight className="h-4 w-4" />تحويل بين الحسابات</button><button className="erp-action" onClick={openSettlement} disabled={clearingAccounts.length === 0 || cashAndBankAccounts.length === 0}><CheckCircle2 className="h-4 w-4" />تسوية حساب وسيط</button></div></div>
          <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-5">
            <select data-testid="finance-account-branch" className="form-input" value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">اختر الفرع</option>{branches?.filter(branch => branch.isActive).map(branch => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select>
            <input data-testid="finance-account-name" className="form-input" placeholder="اسم الحساب" value={name} onChange={event => setName(event.target.value)} />
            <input data-testid="finance-account-code" className="form-input" placeholder="رقم أو كود الحساب" value={code} onChange={event => setCode(event.target.value)} />
            <select data-testid="finance-account-type" className="form-input" value={type} onChange={event => setType(event.target.value as keyof typeof accountTypeLabels)}>{Object.entries(accountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button data-testid="finance-account-create" className="btn-primary" disabled={!branchId || !name.trim() || !code.trim() || busy} onClick={() => void addAccount()}><Plus className="h-4 w-4" />حساب جديد</button>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table min-w-[920px]">
              <thead><tr><th>اسم الحساب</th><th>النوع</th><th>الرصيد الحالي</th><th>المتاح</th><th>قيد التسوية</th><th>الحالة</th><th>الرصيد الافتتاحي</th></tr></thead>
              <tbody>{branchAccounts.map(account => <tr key={account._id} data-testid="finance-account-row" data-account-name={account.name} data-account-branch-id={account.branchId} data-account-type={account.type} data-account-active={String(account.isActive)} data-account-balance={String(account.currentBalance)} data-opening-posted={String(Boolean(account.openingBalancePostedAt))}>
                <td className="font-bold text-slate-800">{account.name}<div className="mt-0.5 text-[11px] text-slate-400">{account.code}</div></td>
                <td>{accountTypeLabels[account.type] ?? "حساب مالي"}</td>
                <td className="font-black">{money.format(account.currentBalance)}</td>
                <td className="text-emerald-700">{money.format(account.availableBalance)}</td>
                <td className={account.pendingBalance ? "text-amber-700" : "text-slate-400"}>{money.format(account.pendingBalance)}</td>
                <td><span className={`badge ${account.isActive ? "badge-success" : "badge-danger"}`}>{account.isActive ? "نشط" : "غير نشط"}</span></td>
                <td>{account.openingBalancePostedAt ? <span className="badge badge-success">مسجل</span> : <button data-testid="finance-opening-balance" className="erp-action" onClick={() => openOpeningBalance(account._id)}>تسجيل الرصيد</button>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {dailySummary && collectionSummary && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="erp-section p-5"><h2 className="mb-4 font-black text-slate-800">حركة اليوم</h2><div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">رصيد بداية اليوم</span><strong className="mt-1 block text-lg">{money.format(dailySummary.openingBalance)}</strong></div><div className="rounded-xl bg-emerald-50 p-3"><span className="text-slate-500">إجمالي الداخل</span><strong className="mt-1 block text-lg text-emerald-700">{money.format(dailySummary.incoming)}</strong></div><div className="rounded-xl bg-rose-50 p-3"><span className="text-slate-500">إجمالي الخارج</span><strong className="mt-1 block text-lg text-rose-700">{money.format(dailySummary.outgoing)}</strong></div><div className="rounded-xl bg-blue-50 p-3"><span className="text-slate-500">رصيد نهاية اليوم</span><strong className="mt-1 block text-lg text-blue-700">{money.format(dailySummary.closingBalance)}</strong></div></div></div>
          <div className="erp-section p-5"><h2 className="mb-4 font-black text-slate-800">تحصيلات اليوم</h2><div className="space-y-3 text-sm"><div className="flex justify-between rounded-xl bg-slate-50 p-3"><span>إجمالي التحصيل</span><strong className="text-emerald-700">{money.format(collectionSummary.totalCollections)}</strong></div><div className="flex justify-between rounded-xl bg-slate-50 p-3"><span>إجمالي الاسترداد</span><strong className="text-rose-700">{money.format(collectionSummary.totalRefunds)}</strong></div><div className="flex justify-between rounded-xl bg-emerald-50 p-3"><span className="font-bold">صافي التحصيل</span><strong className="text-emerald-800">{money.format(collectionSummary.netCollections)}</strong></div></div></div>
        </section>
      )}

      <section className="erp-section">
        <div className="erp-section-header"><div><h2 className="erp-section-title">دفتر الحركة</h2><p className="mt-1 text-xs text-slate-500">سجل الحركات المالية حسب الفرع المحدد.</p></div></div>
        <div className="overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th>التاريخ</th><th>الحساب</th><th>نوع الحركة</th><th>الداخل</th><th>الخارج</th><th>الرصيد بعد الحركة</th><th>إجراء</th></tr></thead><tbody>{results.map(movement => <tr key={movement._id}><td>{movement.date}</td><td className="font-bold">{movement.accountName}</td><td>{transactionLabels[movement.transactionType] ?? "حركة مالية"}</td><td className="text-emerald-700">{movement.incoming ? money.format(movement.incoming) : "—"}</td><td className="text-rose-700">{movement.outgoing ? money.format(movement.outgoing) : "—"}</td><td className="font-bold">{money.format(movement.balanceAfter)}</td><td>{canReverseType(movement.transactionType) && <button className="erp-action erp-action-danger" onClick={() => openReverse(movement.transactionId)}><RotateCcw className="h-4 w-4" />إلغاء الحركة</button>}</td></tr>)}</tbody></table></div>
        {(status === "CanLoadMore" || status === "LoadingMore") && <div className="border-t border-slate-100 p-3 text-center"><button className="erp-action" disabled={status === "LoadingMore"} onClick={() => loadMore(25)}>{status === "LoadingMore" ? "جارٍ تحميل المزيد…" : "عرض المزيد"}</button></div>}
      </section>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-[min(96vw,560px)] space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4"><div><h2 className="text-xl font-black">{dialog === "opening" ? "تسجيل الرصيد الافتتاحي" : dialog === "transfer" ? "تحويل بين الحسابات" : dialog === "settlement" ? "تسوية حساب وسيط" : dialog === "initialize" ? "اعتماد التشغيل المالي" : "إلغاء حركة مالية"}</h2>{dialog === "reverse" && <p className="mt-1 text-sm text-slate-500">سيتم إلغاء أثر الحركة مع الاحتفاظ بالحركة الأصلية في السجل.</p>}</div><button className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setDialog(null)} aria-label="إغلاق"><X className="h-5 w-5" /></button></div>

            {dialog === "initialize" && <div data-testid="finance-confirmation-dialog" className="space-y-3"><p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">هذا الاعتماد نهائي. بعد تفعيل التشغيل المالي لن تتمكن من تعديل تاريخ بدء التسجيل أو الأرصدة الافتتاحية من شاشة الإعداد.</p><div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><span className="text-slate-500">تاريخ بدء التسجيل المالي:</span> <strong>{cutoverDate}</strong></div></div>}
            {dialog === "opening" && <div><label className="form-label">الرصيد الافتتاحي</label><input className="form-input" type="number" min="0" step="0.01" value={openingAmount} onChange={event => setOpeningAmount(event.target.value)} /></div>}
            {dialog === "transfer" && <div className="space-y-3"><div><label className="form-label">من حساب</label><select className="form-input" value={transferSourceId} onChange={event => setTransferSourceId(event.target.value)}><option value="">اختر الحساب</option>{cashAndBankAccounts.map(account => <option key={account._id} value={account._id}>{account.name} — {money.format(account.availableBalance)}</option>)}</select></div><div><label className="form-label">إلى حساب</label><select className="form-input" value={transferDestinationId} onChange={event => setTransferDestinationId(event.target.value)}><option value="">اختر الحساب</option>{cashAndBankAccounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}</select></div><div><label className="form-label">المبلغ</label><input className="form-input" type="number" min="0" step="0.01" value={transferAmount} onChange={event => setTransferAmount(event.target.value)} /></div></div>}
            {dialog === "settlement" && <div className="space-y-3"><div><label className="form-label">الحساب الوسيط</label><select className="form-input" value={settlementSourceId} onChange={event => setSettlementSourceId(event.target.value)}><option value="">اختر الحساب</option>{clearingAccounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}</select></div><div><label className="form-label">الإيداع في</label><select className="form-input" value={settlementDestinationId} onChange={event => setSettlementDestinationId(event.target.value)}><option value="">اختر الخزينة أو البنك</option>{cashAndBankAccounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="form-label">إجمالي التسوية</label><input className="form-input" type="number" min="0" step="0.01" value={settlementGross} onChange={event => setSettlementGross(event.target.value)} /></div><div><label className="form-label">الرسوم</label><input className="form-input" type="number" min="0" step="0.01" value={settlementFee} onChange={event => setSettlementFee(event.target.value)} /></div></div></div>}
            {dialog === "reverse" && <div><label className="form-label">سبب إلغاء الحركة</label><textarea className="form-input min-h-24" value={reverseReason} onChange={event => setReverseReason(event.target.value)} placeholder="اكتب السبب بوضوح" /></div>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button className="erp-action" onClick={() => setDialog(null)} disabled={busy}>إلغاء</button><button data-testid={dialog === "initialize" ? "finance-confirm-final" : undefined} className="btn-primary" disabled={busy} onClick={() => {
              if (dialog === "initialize") {
                void run(() => confirmInitialization(), "تم اعتماد التشغيل المالي");
              }
              if (dialog === "opening" && selectedAccountId) {
                const amount = Number(openingAmount); if (!Number.isFinite(amount) || amount < 0) return toast.error("أدخل رصيدًا صحيحًا");
                void run(() => postOpeningBalance({ accountId: selectedAccountId, amount, date: cutoverDate, requestId: crypto.randomUUID() }), "تم تسجيل الرصيد الافتتاحي");
              }
              if (dialog === "transfer") {
                const amount = Number(transferAmount); if (!transferSourceId || !transferDestinationId || transferSourceId === transferDestinationId || !Number.isFinite(amount) || amount <= 0) return toast.error("راجع الحسابات والمبلغ");
                void run(() => transferFunds({ sourceAccountId: transferSourceId as Id<"financialAccounts">, destinationAccountId: transferDestinationId as Id<"financialAccounts">, amount, date: today, requestId: crypto.randomUUID() }), "تم التحويل بين الحسابات");
              }
              if (dialog === "settlement") {
                const grossAmount = Number(settlementGross); const feeAmount = Number(settlementFee || 0); if (!settlementSourceId || !settlementDestinationId || !Number.isFinite(grossAmount) || grossAmount <= 0 || !Number.isFinite(feeAmount) || feeAmount < 0 || feeAmount > grossAmount) return toast.error("راجع بيانات التسوية");
                void run(() => settleClearingAccount({ sourceAccountId: settlementSourceId as Id<"financialAccounts">, destinationAccountId: settlementDestinationId as Id<"financialAccounts">, grossAmount, feeAmount, settlementDate: today, requestId: crypto.randomUUID() }), "تمت تسوية الحساب الوسيط");
              }
              if (dialog === "reverse" && reverseTransactionId) {
                if (!reverseReason.trim()) return toast.error("اكتب سبب إلغاء الحركة");
                void run(() => reverseTransaction({ transactionId: reverseTransactionId, reason: reverseReason.trim(), date: today, requestId: crypto.randomUUID() }), "تم إلغاء الحركة بنجاح");
              }
            }}>{busy ? "جارٍ الحفظ…" : dialog === "initialize" ? "اعتماد نهائي" : "حفظ"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
