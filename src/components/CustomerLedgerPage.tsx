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
const emptyOpening = {
  receivableBalance: "0",
  advanceBalance: "0",
  totalPurchases: "0",
  notes: "",
};

const isPreciseNonNegativeMoney = (value: string) => {
  if (!value.trim()) return false;
  const amount = Number(value);
  return (
    Number.isFinite(amount) &&
    amount >= 0 &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7
  );
};

export function CustomerLedgerPage({
  initialCustomerId,
  initialBranchId,
}: {
  initialCustomerId?: Id<"customers">;
  initialBranchId?: Id<"branches">;
}) {
  const canView = usePermission("view_customer_ledger");
  const canInitialize = usePermission("initialize_customer_ledger");
  const canPrint = usePermission("print_customer_statements");
  const me = useQuery(api.employees.me);
  const branches = useQuery(
    api.customerLedger.availableBranches,
    canView ? {} : "skip",
  );

  const [branchId, setBranchId] = useState<Id<"branches"> | null>(
    initialBranchId ?? null,
  );
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(
    initialCustomerId ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [printTarget, setPrintTarget] = useState(false);
  const [opening, setOpening] = useState(emptyOpening);
  const retryRequestId = useRef(requestId());

  const effectiveBranch = branchId ?? me?.branchId ?? null;
  const options = useQuery(
    api.customerLedger.customerOptions,
    canView && effectiveBranch ? { branchId: effectiveBranch } : "skip",
  );
  const ledgerArgs = canView && effectiveBranch && customerId
    ? { customerId, branchId: effectiveBranch }
    : "skip";
  const { results, status, loadMore } = usePaginatedQuery(
    api.customerLedger.ledger,
    ledgerArgs,
    { initialNumItems: 20 },
  );
  const printStatement = useQuery(
    api.customerLedger.statementForPrint,
    printTarget && canPrint && effectiveBranch && customerId
      ? { branchId: effectiveBranch, customerId }
      : "skip",
  );
  const initialize = useMutation(api.customerLedger.initializeOpeningBalance);

  const selected = useMemo(
    () => options?.customers.find((customer) => customer.customerId === customerId),
    [options, customerId],
  );
  const canChooseBranch = me?.role === "admin" || me?.role === "accountant";
  const branchContextLoading = me === undefined || branches === undefined;

  const openingValidationReason = (() => {
    const values = [
      opening.receivableBalance,
      opening.advanceBalance,
      opening.totalPurchases,
    ];
    if (values.some((value) => !isPreciseNonNegativeMoney(value))) {
      return "الأرصدة الافتتاحية يجب أن تكون غير سالبة ومقربة إلى قرشين";
    }
    return null;
  })();

  const resetLedgerContext = () => {
    setCustomerId(null);
    setPrintTarget(false);
    setOpening(emptyOpening);
    retryRequestId.current = requestId();
  };

  const handleBranchChange = (value: string) => {
    if (busy || printTarget) return;
    setBranchId(value ? value as Id<"branches"> : null);
    resetLedgerContext();
  };

  const selectCustomer = (id: Id<"customers">) => {
    if (busy || printTarget) return;
    setCustomerId(id);
    setPrintTarget(false);
    setOpening(emptyOpening);
    retryRequestId.current = requestId();
  };

  useEffect(() => {
    if (!initialCustomerId || !initialBranchId) return;
    setBranchId(initialBranchId);
    setCustomerId(initialCustomerId);
    setPrintTarget(false);
    setOpening(emptyOpening);
    retryRequestId.current = requestId();
  }, [initialBranchId, initialCustomerId]);

  useEffect(() => {
    if (!customerId || !options) return;
    const belongsToCurrentBranch = options.customers.some(
      (customer) => customer.customerId === customerId,
    );
    if (belongsToCurrentBranch) return;
    resetLedgerContext();
  }, [customerId, options]);

  useEffect(() => {
    if (!printTarget || !printStatement) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintTarget(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [printTarget, printStatement]);

  const handleInitialize = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      busy ||
      !canInitialize ||
      !effectiveBranch ||
      !customerId ||
      selected?.openingState !== "not_started" ||
      !options?.cutoverDate
    ) return;
    if (openingValidationReason) {
      toast.error(openingValidationReason);
      return;
    }

    setBusy(true);
    try {
      await initialize({
        customerId,
        branchId: effectiveBranch,
        receivableBalance: Number(opening.receivableBalance),
        advanceBalance: Number(opening.advanceBalance),
        totalPurchases: Number(opening.totalPurchases),
        date: options.cutoverDate,
        notes: opening.notes.trim() || undefined,
        requestId: retryRequestId.current,
      });
      toast.success(`تم تسجيل الرصيد الافتتاحي للعميل ${selected.customerName}`);
      retryRequestId.current = requestId();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تسجيل الرصيد الافتتاحي"));
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
    if (printTarget || !canPrint || !effectiveBranch || !customerId) return;
    setPrintTarget(true);
  };

  if (!canView) {
    return (
      <div className="p-8 text-center text-slate-500">
        لا تملك صلاحية عرض دفتر العملاء
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5" dir="rtl">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black flex gap-2">
          <BookOpen /> دفتر العملاء
        </h1>
        {canPrint && customerId && (
          <button
            disabled={!effectiveBranch}
            onClick={printTarget ? () => setPrintTarget(false) : handlePrint}
            className="btn-secondary flex gap-2"
          >
            <Printer className="w-4" />
            {printTarget ? "إلغاء تجهيز الكشف" : "طباعة كشف حساب"}
          </button>
        )}
      </div>

      {canChooseBranch && (
        <select
          aria-label="اختيار الفرع"
          className="print:hidden form-input max-w-xs"
          value={effectiveBranch ?? ""}
          disabled={busy || printTarget || branchContextLoading}
          onChange={(event) => handleBranchChange(event.target.value)}
        >
          <option value="">اختر الفرع</option>
          {(branches ?? []).map((branch) => (
            <option key={branch._id} value={branch._id}>{branch.name}</option>
          ))}
        </select>
      )}

      {branchContextLoading && (
        <p role="status" className="print:hidden rounded-xl bg-slate-100 p-4 text-sm text-slate-600">
          جارٍ تحميل فروع دفتر العملاء
        </p>
      )}
      {!branchContextLoading && !effectiveBranch && (branches?.length ?? 0) > 0 && (
        <p role="status" className="print:hidden rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
          اختر الفرع لعرض دفتر العملاء
        </p>
      )}
      {!branchContextLoading && !effectiveBranch && (branches?.length ?? 0) === 0 && (
        <p role="status" className="print:hidden rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
          لا توجد فروع نشطة متاحة لدفتر العملاء
        </p>
      )}

      <div className="print:hidden grid md:grid-cols-3 gap-4">
        <section className="bg-white rounded-xl border p-3 space-y-2">
          {!effectiveBranch && (
            <p className="p-5 text-center text-sm text-slate-400">
              اختر الفرع أولًا
            </p>
          )}
          {effectiveBranch && options === undefined && (
            <p className="p-5 text-center text-sm text-slate-400">
              جارٍ تحميل عملاء الفرع
            </p>
          )}
          {options && options.customers.length === 0 && (
            <p className="p-5 text-center text-sm text-slate-400">
              لا يوجد عملاء في هذا الفرع
            </p>
          )}
          {options?.customers.map((customer) => (
            <button
              key={customer.customerId}
              disabled={busy || printTarget}
              onClick={() => selectCustomer(customer.customerId)}
              className={`w-full text-right p-3 rounded-lg hover:bg-slate-50 disabled:opacity-50 ${
                customer.customerId === customerId ? "bg-indigo-50 ring-1 ring-indigo-200" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <b>{customer.customerName}</b>
                {customer.isActive === false && (
                  <span className="badge badge-danger text-[10px]">معطل</span>
                )}
              </div>
              <div className="text-xs mt-1">
                مديونية: {customer.receivableBalance.toLocaleString("ar-EG")} · عربون: {customer.advanceBalance.toLocaleString("ar-EG")}
              </div>
            </button>
          ))}
        </section>

        <section className="md:col-span-2 bg-white rounded-xl border overflow-hidden">
          <div className="p-4 border-b font-bold">
            {selected?.customerName ?? "اختر عميلاً"}
          </div>
          {!customerId && (
            <p className="p-8 text-center text-sm text-slate-400">
              اختر عميلاً لعرض حركات الدفتر
            </p>
          )}
          {customerId && status === "LoadingFirstPage" && (
            <p className="p-8 text-center text-sm text-slate-400">
              جارٍ تحميل حركات العميل
            </p>
          )}
          {results.map((entry) => (
            <article key={entry.id} className="p-4 border-b text-sm">
              <div className="flex justify-between gap-3">
                <b>{entry.description}</b>
                <span>{entry.date}</span>
              </div>
              <div className="text-slate-500">
                {entry.referenceType} · {entry.referenceNumber} · {entry.entryNumber}
              </div>
              <div>
                المديونية: {entry.receivableBefore} ← {entry.receivableAfter} | المقدم: {entry.advanceBefore} ← {entry.advanceAfter}
              </div>
            </article>
          ))}
          {customerId && status === "Exhausted" && results.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-400">
              لا توجد حركات لهذا العميل في الفرع المحدد
            </p>
          )}
          {customerId && status === "CanLoadMore" && (
            <button
              disabled={busy || printTarget}
              onClick={() => loadMore(20)}
              className="m-4 btn-secondary"
            >
              تحميل المزيد
            </button>
          )}
          {customerId && status === "LoadingMore" && (
            <p className="p-4 text-center text-sm text-slate-400">
              جارٍ تحميل المزيد
            </p>
          )}
        </section>
      </div>

      {canInitialize && selected?.openingState === "not_started" && (
        <form
          onSubmit={handleInitialize}
          className="print:hidden bg-white rounded-xl border p-4 grid md:grid-cols-3 gap-3"
        >
          <h2 className="md:col-span-3 font-bold">
            الرصيد الافتتاحي — تاريخ القطع {options?.cutoverDate ?? "غير محدد"}
          </h2>
          <label className="space-y-1">
            <span className="form-label">مديونية افتتاحية</span>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={opening.receivableBalance}
              onChange={(event) => setOpening((current) => ({
                ...current,
                receivableBalance: event.target.value,
              }))}
            />
          </label>
          <label className="space-y-1">
            <span className="form-label">مقدم افتتاحي</span>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={opening.advanceBalance}
              onChange={(event) => setOpening((current) => ({
                ...current,
                advanceBalance: event.target.value,
              }))}
            />
          </label>
          <label className="space-y-1">
            <span className="form-label">إجمالي مشتريات افتتاحي</span>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={opening.totalPurchases}
              onChange={(event) => setOpening((current) => ({
                ...current,
                totalPurchases: event.target.value,
              }))}
            />
          </label>
          <input
            className="form-input md:col-span-2"
            placeholder="ملاحظات"
            value={opening.notes}
            onChange={(event) => setOpening((current) => ({
              ...current,
              notes: event.target.value,
            }))}
          />
          {openingValidationReason && (
            <p role="alert" className="md:col-span-3 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">
              {openingValidationReason}
            </p>
          )}
          <button
            disabled={busy || Boolean(openingValidationReason) || !options?.cutoverDate}
            className="btn-primary"
          >
            {busy ? "جارٍ الحفظ..." : "تسجيل الرصيد"}
          </button>
        </form>
      )}

      {selected?.openingState === "posted" && (
        <p className="print:hidden rounded-lg bg-emerald-50 p-3">
          تم تسجيل الرصيد الافتتاحي لهذا العميل.
        </p>
      )}
      {selected?.openingState === "blocked_by_activity" && (
        <p className="print:hidden rounded-lg bg-amber-50 p-3">
          بدأت حركة أو توجد بيانات قديمة لهذا العميل؛ يجب مراجعته قبل تسجيل الرصيد الافتتاحي.
        </p>
      )}
      {printTarget && printStatement && (
        <CustomerStatement statement={printStatement} />
      )}
    </div>
  );
}

function CustomerStatement({
  statement,
}: {
  statement: FunctionReturnType<typeof api.customerLedger.statementForPrint>;
}) {
  return (
    <main className="hidden print:block text-black bg-white p-6" dir="rtl">
      <header className="text-center border-b pb-3">
        <h1 className="text-2xl font-bold">كشف حساب عميل</h1>
        <h2>{statement.branch.name}</h2>
        <p>{statement.branch.address} {statement.branch.phone}</p>
      </header>
      <section className="my-4 grid grid-cols-2">
        <p>العميل: {statement.customer.name}</p>
        <p>الهاتف: {statement.customer.phone}</p>
        <p>العنوان: {statement.customer.address ?? "—"}</p>
        <p>وقت الطباعة: {new Date().toLocaleString("ar-EG")}</p>
      </section>
      <p>
        الرصيد الافتتاحي: مديونية {statement.openingBalance.receivable} · مقدم {statement.openingBalance.advance} · مشتريات {statement.openingBalance.totalPurchases}
      </p>
      <table className="w-full text-xs border-collapse my-4">
        <thead>
          <tr>
            {["القيد", "التاريخ", "النوع والحالة", "المرجع", "الوصف", "المديونية", "المقدم", "المشتريات", "الأرصدة بعد القيد", "المستخدم"].map((label) => (
              <th className="border p-1" key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statement.entries.map((entry) => (
            <tr key={entry.entryNumber}>
              <td className="border p-1">{entry.entryNumber}</td>
              <td className="border p-1">{entry.date}</td>
              <td className="border p-1">{entry.type} / {entry.status}</td>
              <td className="border p-1">{entry.referenceType} {entry.referenceNumber}</td>
              <td className="border p-1">{entry.description}</td>
              <td className="border p-1">{entry.receivableDelta}</td>
              <td className="border p-1">{entry.advanceDelta}</td>
              <td className="border p-1">{entry.purchasesDelta}</td>
              <td className="border p-1">
                {entry.receivableAfter} / {entry.advanceAfter} / {entry.totalPurchasesAfter}
              </td>
              <td className="border p-1">{entry.createdByName}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section>
        <p>
          الأرصدة النهائية: مديونية {statement.balances.receivable} · مقدم {statement.balances.advance} · مشتريات {statement.balances.totalPurchases}
        </p>
        <p>
          إجماليات الحركة: مدين {statement.totals.receivableDebit} · دائن {statement.totals.receivableCredit} · مقدم داخل {statement.totals.advanceIn} · مقدم خارج {statement.totals.advanceOut} · مشتريات {statement.totals.purchasesIn} · عكس مشتريات {statement.totals.purchasesOut}
        </p>
      </section>
      <footer className="grid grid-cols-3 gap-8 mt-16 text-center">
        <span>توقيع العميل</span>
        <span>توقيع المحاسب</span>
        <span>اعتماد الإدارة</span>
      </footer>
    </main>
  );
}
