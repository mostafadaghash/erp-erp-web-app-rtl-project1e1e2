import { useEffect, useMemo, useRef, useState } from "react";
import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { toast } from "sonner";
import {
  BookOpen,
  LockKeyhole,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

const newRequestId = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);
const money = (value: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  }).format(value);
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const isCentAmount = (value: number) =>
  Number.isFinite(value) &&
  value >= 0 &&
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

type Tab =
  | "overview"
  | "chart"
  | "opening"
  | "journal"
  | "entries"
  | "periods"
  | "ledger"
  | "trial";
type Modal = "account" | "deactivate" | "reverse" | "period" | null;
type RequestRef = { current: string };
type BranchOption = { _id: Id<"branches">; name: string };
type PostingAccount = {
  _id: Id<"chartOfAccounts">;
  code: string;
  nameAr: string;
  normalSide: "debit" | "credit";
};
type ChartAccount = PostingAccount & {
  nameEn?: string;
  parentId?: Id<"chartOfAccounts">;
  accountClass: "asset" | "liability" | "equity" | "revenue" | "expense";
  isContra: boolean;
  isPosting: boolean;
  isSystem: boolean;
  systemKey?: string;
  isActive: boolean;
};
type EntrySummary = {
  _id: Id<"journalEntries">;
  entryNumber: string;
  date: string;
  memo: string;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  status: "posted" | "reversed";
  sourceType:
    | "opening"
    | "manual"
    | "reversal"
    | "financial"
    | "financial_reversal";
};
type EntryLine = {
  lineNumber: number;
  accountCode: string;
  accountName: string;
  normalSide: "debit" | "credit";
  debit: number;
  credit: number;
  description: string;
};
type EntryDetails = {
  entryNumber: string;
  date: string;
  memo: string;
  branchName: string;
  employeeName: string;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  status: "posted" | "reversed";
  sourceType:
    | "opening"
    | "manual"
    | "reversal"
    | "financial"
    | "financial_reversal";
  originalEntryNumber?: string;
  reversalEntryNumber?: string;
  reversalReason?: string;
  reversalDate?: string;
  lines: EntryLine[];
};
type LedgerRow = {
  entryNumber: string;
  date: string;
  lineNumber: number;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
  sourceType: string;
};
type TrialRow = {
  code: string;
  nameAr: string;
  normalSide: "debit" | "credit";
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
};
type LineDraft = {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
};

const newLine = (): LineDraft => ({
  key: newRequestId(),
  accountId: "",
  debit: "",
  credit: "",
  description: "",
});
const initialLines = () => [newLine(), newLine()];
const accountClassLabel: Record<ChartAccount["accountClass"], string> = {
  asset: "أصول",
  liability: "التزامات",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};
const sourceLabel: Record<EntrySummary["sourceType"], string> = {
  opening: "افتتاحي",
  manual: "يدوي",
  reversal: "عكس",
  financial: "تشغيلي مالي",
  financial_reversal: "عكس تشغيلي مالي",
};

function lineNumbers(lines: LineDraft[]) {
  return lines.map((line) => ({
    ...line,
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
  }));
}

function lineValidation(lines: LineDraft[]) {
  const parsed = lineNumbers(lines);
  const debit = roundMoney(parsed.reduce((sum, line) => sum + line.debit, 0));
  const credit = roundMoney(parsed.reduce((sum, line) => sum + line.credit, 0));
  const accountIds = parsed.map((line) => line.accountId).filter(Boolean);
  const duplicateAccounts = new Set(accountIds).size !== accountIds.length;
  const validSides = parsed.every(
    (line) =>
      Boolean(line.accountId) &&
      isCentAmount(line.debit) &&
      isCentAmount(line.credit) &&
      ((line.debit > 0 && line.credit === 0) ||
        (line.credit > 0 && line.debit === 0)),
  );
  return {
    debit,
    credit,
    difference: roundMoney(debit - credit),
    valid:
      parsed.length >= 2 &&
      validSides &&
      !duplicateAccounts &&
      debit > 0 &&
      debit === credit,
    duplicateAccounts,
  };
}

function journalArgs(lines: LineDraft[]) {
  return lineNumbers(lines).map((line) => ({
    accountId: line.accountId as Id<"chartOfAccounts">,
    debit: line.debit,
    credit: line.credit,
    description: line.description.trim() || undefined,
  }));
}

function ModalShell({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100"
            onClick={close}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function JournalLinesEditor({
  lines,
  accounts,
  disabled,
  onChange,
}: {
  lines: LineDraft[];
  accounts: PostingAccount[];
  disabled: boolean;
  onChange: (lines: LineDraft[]) => void;
}) {
  const update = (key: string, patch: Partial<LineDraft>) =>
    onChange(
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <div
          className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[2fr_1fr_1fr_2fr_auto]"
          key={line.key}
        >
          <select
            className="form-input"
            value={line.accountId}
            disabled={disabled}
            onChange={(event) =>
              update(line.key, { accountId: event.target.value })
            }
            aria-label={`حساب السطر ${index + 1}`}
          >
            <option value="">اختر الحساب</option>
            {accounts.map((account) => (
              <option key={account._id} value={account._id}>
                {account.code} — {account.nameAr}
              </option>
            ))}
          </select>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={line.debit}
            disabled={disabled}
            placeholder="مدين"
            onChange={(event) =>
              update(line.key, {
                debit: event.target.value,
                credit: Number(event.target.value) > 0 ? "" : line.credit,
              })
            }
          />
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={line.credit}
            disabled={disabled}
            placeholder="دائن"
            onChange={(event) =>
              update(line.key, {
                credit: event.target.value,
                debit: Number(event.target.value) > 0 ? "" : line.debit,
              })
            }
          />
          <input
            className="form-input"
            value={line.description}
            disabled={disabled}
            placeholder="وصف السطر"
            onChange={(event) =>
              update(line.key, { description: event.target.value })
            }
          />
          <button
            type="button"
            className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
            disabled={disabled || lines.length <= 2}
            onClick={() =>
              onChange(lines.filter((item) => item.key !== line.key))
            }
            aria-label={`حذف السطر ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-bold text-indigo-700 disabled:opacity-50"
        disabled={disabled}
        onClick={() => onChange([...lines, newLine()])}
      >
        <Plus className="h-4 w-4" /> إضافة سطر
      </button>
    </div>
  );
}

function Totals({ totals }: { totals: ReturnType<typeof lineValidation> }) {
  return (
    <div className="mt-4 grid gap-3 rounded-xl bg-slate-900 p-4 text-sm text-white sm:grid-cols-3">
      <span>إجمالي المدين: {money(totals.debit)}</span>
      <span>إجمالي الدائن: {money(totals.credit)}</span>
      <span
        className={
          totals.difference === 0 ? "text-emerald-300" : "text-red-300"
        }
      >
        الفرق: {money(totals.difference)}
      </span>
      {totals.duplicateAccounts && (
        <span className="text-red-300 sm:col-span-3">
          لا يمكن تكرار الحساب داخل القيد نفسه.
        </span>
      )}
    </div>
  );
}

export function GeneralLedgerPage() {
  const convex = useConvex();
  const canView = usePermission("view_general_ledger");
  const canInitialize = usePermission("initialize_general_ledger");
  const canManageChart = usePermission("manage_chart_of_accounts");
  const canPost = usePermission("post_manual_journals");
  const canReverse = usePermission("reverse_journal_entries");
  const canClose = usePermission("close_accounting_periods");
  const canReopen = usePermission("reopen_accounting_periods");
  const canPrint = usePermission("print_general_ledger");

  const me = useQuery(api.employees.me);
  const branchesQuery = useQuery(
    api.generalLedger.availableBranches,
    canView ? {} : "skip",
  );
  const status = useQuery(api.generalLedger.status, canView ? {} : "skip");
  const chartQuery = useQuery(
    api.generalLedger.chart,
    canView ? { activeOnly: false } : "skip",
  );
  const accountQuery = useQuery(
    api.generalLedger.accountPicker,
    canView ? {} : "skip",
  );
  const periods = useQuery(api.generalLedger.periods, canView ? {} : "skip");

  const branches = (branchesQuery ?? []) as BranchOption[];
  const chart = (chartQuery ?? []) as ChartAccount[];
  const accounts = (accountQuery ?? []) as PostingAccount[];
  const canSelectBranch = me?.role === "admin" || me?.role === "accountant";
  const [branchId, setBranchId] = useState<Id<"branches"> | null>(null);
  const effectiveBranch = branchId ?? me?.branchId ?? branches[0]?._id ?? null;

  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [cutoverDate, setCutoverDate] = useState(today());
  const [financialCutoverDate, setFinancialCutoverDate] = useState(today());
  const [openingDate, setOpeningDate] = useState(today());
  const [zeroOpening, setZeroOpening] = useState(true);
  const [openingLines, setOpeningLines] = useState<LineDraft[]>(initialLines);
  const [journalDate, setJournalDate] = useState(today());
  const [journalMemo, setJournalMemo] = useState("");
  const [journalLines, setJournalLines] = useState<LineDraft[]>(initialLines);
  const [periodKey, setPeriodKey] = useState(currentMonth());
  const [periodTarget, setPeriodTarget] = useState("");
  const [periodAction, setPeriodAction] = useState<"close" | "reopen">("close");
  const [periodReason, setPeriodReason] = useState("");
  const [entriesFrom, setEntriesFrom] = useState(
    `${today().slice(0, 4)}-01-01`,
  );
  const [entriesTo, setEntriesTo] = useState(today());
  const [selectedEntryId, setSelectedEntryId] =
    useState<Id<"journalEntries"> | null>(null);
  const [reversalDate, setReversalDate] = useState(today());
  const [reversalReason, setReversalReason] = useState("");
  const [ledgerAccountId, setLedgerAccountId] =
    useState<Id<"chartOfAccounts"> | null>(null);
  const [ledgerFrom, setLedgerFrom] = useState(`${today().slice(0, 4)}-01-01`);
  const [ledgerTo, setLedgerTo] = useState(today());
  const [trialPeriod, setTrialPeriod] = useState(currentMonth());
  const [newAccount, setNewAccount] = useState({
    code: "",
    nameAr: "",
    nameEn: "",
    parentId: "",
    isContra: false,
  });
  const [deactivateTarget, setDeactivateTarget] = useState<ChartAccount | null>(
    null,
  );

  const initializeRequestId = useRef(newRequestId());
  const financialPostingRequestId = useRef(newRequestId());
  const openingRequestId = useRef(newRequestId());
  const journalRequestId = useRef(newRequestId());
  const reversalRequestId = useRef(newRequestId());

  const openingStatus = useQuery(
    api.generalLedger.openingStatus,
    canView && effectiveBranch ? { branchId: effectiveBranch } : "skip",
  );
  const financialReadiness = useQuery(
    api.generalLedger.financialPostingReadinessStatus,
    canInitialize &&
      status?.initialized &&
      !status.financialPostingEnabled &&
      financialCutoverDate
      ? { cutoverDate: financialCutoverDate }
      : "skip",
  );
  const entries = usePaginatedQuery(
    api.generalLedger.entriesPaginated,
    canView && effectiveBranch
      ? { branchId: effectiveBranch, from: entriesFrom, to: entriesTo }
      : "skip",
    { initialNumItems: 15 },
  );
  const entryDetailsQuery = useQuery(
    api.generalLedger.entryDetails,
    canView && selectedEntryId ? { entryId: selectedEntryId } : "skip",
  );
  const entryDetails = entryDetailsQuery as EntryDetails | undefined;
  const ledgerArgs =
    canView && effectiveBranch && ledgerAccountId
      ? {
          branchId: effectiveBranch,
          accountId: ledgerAccountId,
          from: ledgerFrom,
          to: ledgerTo,
        }
      : "skip";
  const ledger = usePaginatedQuery(
    api.generalLedger.accountLedgerPaginated,
    ledgerArgs,
    { initialNumItems: 20 },
  );
  const ledgerOpeningPage = useQuery(
    api.generalLedger.accountLedgerPaginated,
    ledgerArgs === "skip"
      ? "skip"
      : {
          ...ledgerArgs,
          paginationOpts: { numItems: 1, cursor: null },
        },
  );
  const trialQuery = useQuery(
    api.generalLedger.trialBalance,
    canView && effectiveBranch && trialPeriod
      ? { branchId: effectiveBranch, periodKey: trialPeriod }
      : "skip",
  );
  const trialRows = (trialQuery ?? []) as TrialRow[];

  const initialize = useMutation(api.generalLedger.initialize);
  const enableFinancialPosting = useMutation(
    api.generalLedger.enableFinancialPosting,
  );
  const createAccount = useMutation(api.generalLedger.createAccount);
  const deactivateAccount = useMutation(api.generalLedger.deactivateAccount);
  const confirmOpening = useMutation(api.generalLedger.confirmOpening);
  const postManualJournal = useMutation(api.generalLedger.postManualJournal);
  const reverseJournal = useMutation(api.generalLedger.reverseJournal);
  const createOrOpenPeriod = useMutation(api.generalLedger.createOrOpenPeriod);
  const closePeriod = useMutation(api.generalLedger.closePeriod);
  const reopenPeriod = useMutation(api.generalLedger.reopenPeriod);

  const openingTotals = useMemo(
    () => lineValidation(openingLines),
    [openingLines],
  );
  const journalTotals = useMemo(
    () => lineValidation(journalLines),
    [journalLines],
  );
  const trialTotals = useMemo(
    () =>
      trialRows.reduce(
        (totals, row) => ({
          openingDebit: totals.openingDebit + row.openingDebit,
          openingCredit: totals.openingCredit + row.openingCredit,
          periodDebit: totals.periodDebit + row.periodDebit,
          periodCredit: totals.periodCredit + row.periodCredit,
          closingDebit: totals.closingDebit + row.closingDebit,
          closingCredit: totals.closingCredit + row.closingCredit,
        }),
        {
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: 0,
          periodCredit: 0,
          closingDebit: 0,
          closingCredit: 0,
        },
      ),
    [trialRows],
  );
  const chartChildren = useMemo(() => {
    const groups = new Map<string, ChartAccount[]>();
    for (const account of chart) {
      const key = account.parentId ? String(account.parentId) : "root";
      groups.set(key, [...(groups.get(key) ?? []), account]);
    }
    for (const rows of groups.values()) {
      rows.sort((left, right) => left.code.localeCompare(right.code));
    }
    return groups;
  }, [chart]);
  const selectedParent = chart.find(
    (account) => String(account._id) === newAccount.parentId,
  );
  const parentNormalSide =
    selectedParent?.accountClass === "asset" ||
    selectedParent?.accountClass === "expense"
      ? "debit"
      : "credit";
  const newAccountNormalSide = newAccount.isContra
    ? parentNormalSide === "debit"
      ? "credit"
      : "debit"
    : parentNormalSide;

  useEffect(() => {
    if (!status?.initialized || !status.cutoverDate) return;
    setCutoverDate(status.cutoverDate);
    setOpeningDate(status.cutoverDate);
    setFinancialCutoverDate(
      status.financialPostingCutoverDate ?? status.cutoverDate,
    );
  }, [status]);

  useEffect(() => {
    openingRequestId.current = newRequestId();
    journalRequestId.current = newRequestId();
    reversalRequestId.current = newRequestId();
    financialPostingRequestId.current = newRequestId();
    setSelectedEntryId(null);
    setLedgerAccountId(null);
  }, [effectiveBranch]);

  const run = async (
    action: () => Promise<unknown>,
    success: string,
    requestRef?: RequestRef,
    afterSuccess?: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(success);
      if (requestRef) requestRef.current = newRequestId();
      afterSuccess?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تنفيذ العملية"));
    } finally {
      setBusy(false);
    }
  };

  const openPrintWindow = (title: string, body: string) => {
    const popup = window.open("", "_blank");
    if (!popup) throw new Error("تعذر فتح نافذة الطباعة");
    popup.document.write(
      `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#0f172a}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #94a3b8;padding:8px;text-align:right}.summary{display:flex;justify-content:space-between;margin:18px 0}.signatures{display:flex;justify-content:space-between;margin-top:56px}.muted{color:#64748b;font-size:12px}</style></head><body><h1>${escapeHtml(title)}</h1>${body}<div class="signatures"><span>إعداد: __________</span><span>مراجعة: __________</span><span>اعتماد: __________</span></div></body></html>`,
    );
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handlePrintEntry = async (entryId: Id<"journalEntries">) => {
    if (busy || !canPrint) return;
    setBusy(true);
    try {
      const dto = (await convex.query(api.generalLedger.entryForPrint, {
        entryId,
      })) as EntryDetails;
      openPrintWindow(
        `قيد يومية ${dto.entryNumber}`,
        `<p>الفرع: ${escapeHtml(dto.branchName)} | التاريخ: ${escapeHtml(dto.date)}</p><p>البيان: ${escapeHtml(dto.memo)} | المُنشئ: ${escapeHtml(dto.employeeName)}</p><table><thead><tr><th>#</th><th>الحساب</th><th>الوصف</th><th>مدين</th><th>دائن</th></tr></thead><tbody>${dto.lines
          .map(
            (line) =>
              `<tr><td>${line.lineNumber}</td><td>${escapeHtml(line.accountCode)} — ${escapeHtml(line.accountName)}</td><td>${escapeHtml(line.description)}</td><td>${money(line.debit)}</td><td>${money(line.credit)}</td></tr>`,
          )
          .join(
            "",
          )}</tbody><tfoot><tr><th colspan="3">الإجمالي</th><th>${money(dto.totalDebit)}</th><th>${money(dto.totalCredit)}</th></tr></tfoot></table>${dto.reversalReason ? `<p>سبب العكس: ${escapeHtml(dto.reversalReason)} — ${escapeHtml(dto.reversalDate)}</p>` : ""}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذرت طباعة القيد"));
    } finally {
      setBusy(false);
    }
  };

  const handlePrintTrialBalance = async () => {
    if (busy || !canPrint || !effectiveBranch || !trialPeriod) return;
    setBusy(true);
    try {
      const rows = (await convex.query(api.generalLedger.trialBalanceForPrint, {
        branchId: effectiveBranch,
        periodKey: trialPeriod,
      })) as TrialRow[];
      const totals = rows.reduce(
        (sum, row) => ({
          openingDebit: sum.openingDebit + row.openingDebit,
          openingCredit: sum.openingCredit + row.openingCredit,
          periodDebit: sum.periodDebit + row.periodDebit,
          periodCredit: sum.periodCredit + row.periodCredit,
          closingDebit: sum.closingDebit + row.closingDebit,
          closingCredit: sum.closingCredit + row.closingCredit,
        }),
        {
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: 0,
          periodCredit: 0,
          closingDebit: 0,
          closingCredit: 0,
        },
      );
      openPrintWindow(
        `ميزان المراجعة — ${trialPeriod}`,
        `<p class="muted">العملة الأساسية: EGP</p><table><thead><tr><th>الكود</th><th>الحساب</th><th>افتتاح مدين</th><th>افتتاح دائن</th><th>حركة مدين</th><th>حركة دائن</th><th>ختام مدين</th><th>ختام دائن</th></tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.nameAr)}</td><td>${money(row.openingDebit)}</td><td>${money(row.openingCredit)}</td><td>${money(row.periodDebit)}</td><td>${money(row.periodCredit)}</td><td>${money(row.closingDebit)}</td><td>${money(row.closingCredit)}</td></tr>`,
          )
          .join(
            "",
          )}</tbody><tfoot><tr><th colspan="2">الإجمالي</th><th>${money(totals.openingDebit)}</th><th>${money(totals.openingCredit)}</th><th>${money(totals.periodDebit)}</th><th>${money(totals.periodCredit)}</th><th>${money(totals.closingDebit)}</th><th>${money(totals.closingCredit)}</th></tr></tfoot></table>`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذرت طباعة ميزان المراجعة"));
    } finally {
      setBusy(false);
    }
  };

  const changeBranch = (value: string) => {
    setBranchId(value ? (value as Id<"branches">) : null);
    openingRequestId.current = newRequestId();
    journalRequestId.current = newRequestId();
    reversalRequestId.current = newRequestId();
  };

  const renderChart = (
    parentId?: Id<"chartOfAccounts">,
    depth = 0,
  ): React.ReactNode =>
    (chartChildren.get(parentId ? String(parentId) : "root") ?? []).map(
      (account) => (
        <div key={account._id}>
          <div
            className={`flex items-center gap-3 border-b border-slate-100 py-2 ${
              !account.isActive ? "opacity-50" : ""
            }`}
            style={{ paddingRight: `${depth * 22}px` }}
          >
            <span className="w-20 font-mono text-sm">{account.code}</span>
            <span className="flex-1 font-medium">{account.nameAr}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
              {accountClassLabel[account.accountClass]}
            </span>
            <span className="text-xs text-slate-500">
              {account.isPosting ? "ترحيلي" : "تجميعي"}
              {account.isContra ? " · مقابل" : ""}
            </span>
            {canManageChart &&
              account.isPosting &&
              !account.isSystem &&
              account.isActive && (
                <button
                  type="button"
                  className="text-xs font-bold text-red-600"
                  onClick={() => {
                    setDeactivateTarget(account);
                    setModal("deactivate");
                  }}
                >
                  تعطيل
                </button>
              )}
          </div>
          {renderChart(account._id, depth + 1)}
        </div>
      ),
    );

  if (!canView) {
    return (
      <div className="p-8 text-center text-slate-500">
        لا تملك صلاحية عرض الأستاذ العام
      </div>
    );
  }

  const tabLabels: Array<[Tab, string]> = [
    ["overview", "الملخص"],
    ["chart", "دليل الحسابات"],
    ["opening", "الأرصدة الافتتاحية"],
    ["journal", "قيد يدوي"],
    ["entries", "القيود"],
    ["periods", "الفترات"],
    ["ledger", "دفتر الحساب"],
    ["trial", "ميزان المراجعة"],
  ];
  const entryRows = entries.results as EntrySummary[];
  const ledgerRows = ledger.results as LedgerRow[];

  return (
    <div className="space-y-5 p-4 lg:p-6" dir="rtl">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <strong className="flex items-center gap-2">
          <LockKeyhole className="h-4 w-4" /> وضع التأسيس Foundation
        </strong>
        <p className="mt-1 text-sm">
          {status?.financialPostingEnabled
            ? "ربط الخزائن والبنوك والمحافظ وCOD بالأستاذ العام مفعّل. ربط المبيعات والمخزون والمشتريات غير النقدية ما زال معطلًا."
            : "الربط التلقائي للمبيعات والمخزون والمشتريات وCOD غير مفعّل بعد. القيود هنا افتتاحية أو يدوية فقط."}
        </p>
      </div>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <BookOpen className="h-6 w-6" /> الأستاذ العام
          </h1>
          <p className="text-sm text-slate-500">
            دليل حسابات، قيود مزدوجة، فترات مالية وتقارير مراجعة — EGP.
          </p>
        </div>
        <div className="min-w-64">
          <label className="mb-1 block text-xs font-bold text-slate-600">
            الفرع النشط
          </label>
          {canSelectBranch ? (
            <select
              className="form-input"
              value={effectiveBranch ?? ""}
              onChange={(event) => changeBranch(event.target.value)}
            >
              <option value="">اختر الفرع</option>
              {branches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
              {branches.find((branch) => branch._id === effectiveBranch)
                ?.name ?? "فرع المستخدم"}
            </div>
          )}
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto rounded-xl bg-white p-2 shadow-sm">
        {tabLabels.map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${
              tab === id
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card p-5 lg:col-span-2">
            <h2 className="mb-3 font-bold">حالة الأساس المحاسبي</h2>
            {status?.initialized ? (
              <div className="space-y-2 text-sm">
                <p className="font-bold text-emerald-700">تمت التهيئة بنجاح</p>
                <p>إصدار الدليل: {status.chartVersion}</p>
                <p>تاريخ القطع: {status.cutoverDate}</p>
                <p>
                  الترحيل التشغيلي:{" "}
                  <strong className="text-amber-700">
                    {status.operationalPostingEnabled ? "مفعّل" : "غير مفعّل"}
                  </strong>
                </p>
                <p>
                  ربط الخزائن بالأستاذ العام:{" "}
                  <strong
                    className={
                      status.financialPostingEnabled
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }
                  >
                    {status.financialPostingEnabled ? "مفعّل" : "غير مفعّل"}
                  </strong>
                </p>
                {status.financialPostingCutoverDate && (
                  <p>تاريخ ربط الخزائن: {status.financialPostingCutoverDate}</p>
                )}
              </div>
            ) : canInitialize ? (
              <div className="space-y-3">
                <input
                  className="form-input max-w-xs"
                  type="date"
                  value={cutoverDate}
                  onChange={(event) => {
                    setCutoverDate(event.target.value);
                    initializeRequestId.current = newRequestId();
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !cutoverDate}
                  className="btn-primary disabled:opacity-50"
                  onClick={() =>
                    void run(
                      () =>
                        initialize({
                          cutoverDate,
                          requestId: initializeRequestId.current,
                        }),
                      "تمت تهيئة دليل الحسابات",
                      initializeRequestId,
                    )
                  }
                >
                  تهيئة دليل الحسابات
                </button>
              </div>
            ) : (
              <p className="text-slate-500">
                التهيئة لم تبدأ، ولا تملك صلاحية تنفيذها.
              </p>
            )}
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-bold">افتتاح الفرع</h2>
            {!effectiveBranch ? (
              <p className="text-slate-500">اختر فرعًا.</p>
            ) : openingStatus?.confirmed ? (
              <div className="text-sm">
                <p className="font-bold text-emerald-700">افتتاح معتمد</p>
                <p>التاريخ: {openingStatus.openingDate}</p>
                <p>النوع: {openingStatus.isZeroOpening ? "صفري" : "بأرصدة"}</p>
                {openingStatus.entryNumber && (
                  <p>القيد: {openingStatus.entryNumber}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="font-bold text-indigo-700"
                onClick={() => setTab("opening")}
              >
                استكمال افتتاح الفرع
              </button>
            )}
          </section>
          {status?.initialized && (
            <section className="card p-5 lg:col-span-3">
              <h2 className="mb-2 font-bold">
                الربط الذري للخزائن والبنوك والمحافظ وCOD
              </h2>
              {status.financialPostingEnabled ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  كل حركة مالية جديدة من تاريخ{" "}
                  <strong>{status.financialPostingCutoverDate}</strong> تُنشئ
                  قيدًا مزدوجًا داخل Mutation نفسها. عكس الحركة المالية يعكس
                  القيد المرتبط بها.
                </div>
              ) : canInitialize ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    التفعيل نهائي لهذه الشريحة. يلزم افتتاح كل فرع في التاريخ
                    نفسه، ومطابقة أرصدة الحسابات المالية مع حسابات GL، وفتح
                    الفترة المالية.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-600">
                        تاريخ بدء الربط
                      </span>
                      <input
                        className="form-input"
                        type="date"
                        value={financialCutoverDate}
                        onChange={(event) => {
                          setFinancialCutoverDate(event.target.value);
                          financialPostingRequestId.current = newRequestId();
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-primary disabled:opacity-50"
                      disabled={
                        busy ||
                        !financialCutoverDate ||
                        !financialReadiness?.ready
                      }
                      onClick={() =>
                        void run(
                          () =>
                            enableFinancialPosting({
                              cutoverDate: financialCutoverDate,
                              requestId: financialPostingRequestId.current,
                            }),
                          "تم تفعيل ربط الحركات المالية بالأستاذ العام",
                          financialPostingRequestId,
                        )
                      }
                    >
                      تفعيل ربط الخزائن
                    </button>
                  </div>
                  {financialReadiness &&
                    (financialReadiness.ready ? (
                      <p className="text-sm font-bold text-emerald-700">
                        المطابقة ناجحة وجاهزة للتفعيل.
                      </p>
                    ) : (
                      <ul className="list-disc space-y-1 pr-5 text-sm text-red-700">
                        {financialReadiness.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  لا تملك صلاحية تفعيل الربط المالي.
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {tab === "chart" && (
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">دليل الحسابات الشجري</h2>
              <p className="text-sm text-slate-500">
                الحسابات النظامية ثابتة، ويمكن إضافة حسابات ترحيلية فرعية.
              </p>
            </div>
            {canManageChart && (
              <button
                type="button"
                className="btn-primary flex items-center gap-1"
                onClick={() => {
                  setNewAccount({
                    code: "",
                    nameAr: "",
                    nameEn: "",
                    parentId: "",
                    isContra: false,
                  });
                  setModal("account");
                }}
              >
                <Plus className="h-4 w-4" /> حساب جديد
              </button>
            )}
          </div>
          <div className="rounded-xl border">{renderChart()}</div>
        </section>
      )}

      {tab === "opening" && (
        <section className="card p-5">
          <h2 className="font-bold">اعتماد الأرصدة الافتتاحية</h2>
          <p className="mb-4 text-sm text-slate-500">
            عملية مستقلة لكل فرع، ولا يمكن تعديلها بعد بدء الحركة اليدوية.
          </p>
          {openingStatus?.confirmed ? (
            <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
              تم اعتماد افتتاح هذا الفرع بتاريخ {openingStatus.openingDate}.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-bold">
                    تاريخ الافتتاح
                  </span>
                  <input
                    className="form-input"
                    type="date"
                    value={openingDate}
                    disabled={busy || !canInitialize}
                    onChange={(event) => {
                      setOpeningDate(event.target.value);
                      openingRequestId.current = newRequestId();
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 rounded-xl border p-3">
                  <input
                    type="checkbox"
                    checked={zeroOpening}
                    disabled={busy || !canInitialize}
                    onChange={(event) => {
                      setZeroOpening(event.target.checked);
                      openingRequestId.current = newRequestId();
                    }}
                  />
                  اعتماد رصيد افتتاحي صفري
                </label>
              </div>
              {!zeroOpening && (
                <>
                  <JournalLinesEditor
                    lines={openingLines}
                    accounts={accounts}
                    disabled={busy || !canInitialize}
                    onChange={(lines) => {
                      setOpeningLines(lines);
                      openingRequestId.current = newRequestId();
                    }}
                  />
                  <Totals totals={openingTotals} />
                </>
              )}
              <button
                type="button"
                className="btn-primary disabled:opacity-50"
                disabled={
                  busy ||
                  !canInitialize ||
                  !effectiveBranch ||
                  !openingDate ||
                  (!zeroOpening && !openingTotals.valid)
                }
                onClick={() =>
                  effectiveBranch &&
                  void run(
                    () =>
                      confirmOpening({
                        branchId: effectiveBranch,
                        openingDate,
                        isZeroOpening: zeroOpening,
                        lines: zeroOpening ? [] : journalArgs(openingLines),
                        requestId: openingRequestId.current,
                      }),
                    "تم اعتماد افتتاح الفرع",
                    openingRequestId,
                  )
                }
              >
                اعتماد الافتتاح
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "journal" && (
        <section className="card p-5">
          <h2 className="font-bold">قيد يومية يدوي متعدد السطور</h2>
          <p className="mb-4 text-sm text-slate-500">
            لا يمكن تعديل القيد المرحّل؛ التصحيح يتم بقيد عكس موثق.
          </p>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <input
              className="form-input"
              type="date"
              value={journalDate}
              disabled={busy || !canPost}
              onChange={(event) => {
                setJournalDate(event.target.value);
                journalRequestId.current = newRequestId();
              }}
            />
            <input
              className="form-input"
              value={journalMemo}
              disabled={busy || !canPost}
              placeholder="بيان القيد الإلزامي"
              onChange={(event) => {
                setJournalMemo(event.target.value);
                journalRequestId.current = newRequestId();
              }}
            />
          </div>
          <JournalLinesEditor
            lines={journalLines}
            accounts={accounts}
            disabled={busy || !canPost}
            onChange={(lines) => {
              setJournalLines(lines);
              journalRequestId.current = newRequestId();
            }}
          />
          <Totals totals={journalTotals} />
          <button
            type="button"
            className="btn-primary mt-4 disabled:opacity-50"
            disabled={
              busy ||
              !canPost ||
              !effectiveBranch ||
              !journalMemo.trim() ||
              !journalDate ||
              !journalTotals.valid ||
              !openingStatus?.confirmed
            }
            onClick={() =>
              effectiveBranch &&
              void run(
                () =>
                  postManualJournal({
                    branchId: effectiveBranch,
                    date: journalDate,
                    memo: journalMemo.trim(),
                    lines: journalArgs(journalLines),
                    requestId: journalRequestId.current,
                  }),
                "تم ترحيل القيد",
                journalRequestId,
                () => {
                  setJournalMemo("");
                  setJournalLines(initialLines());
                },
              )
            }
          >
            ترحيل القيد
          </button>
          {!openingStatus?.confirmed && (
            <p className="mt-2 text-sm text-amber-700">
              يجب اعتماد افتتاح الفرع قبل ترحيل قيود يدوية.
            </p>
          )}
        </section>
      )}

      {tab === "entries" && (
        <section className="space-y-4">
          <div className="card p-5">
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <label>
                <span className="text-xs font-bold">من</span>
                <input
                  className="form-input"
                  type="date"
                  value={entriesFrom}
                  onChange={(event) => setEntriesFrom(event.target.value)}
                />
              </label>
              <label>
                <span className="text-xs font-bold">إلى</span>
                <input
                  className="form-input"
                  type="date"
                  value={entriesTo}
                  onChange={(event) => setEntriesTo(event.target.value)}
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th>رقم القيد</th>
                    <th>التاريخ</th>
                    <th>البيان</th>
                    <th>النوع</th>
                    <th>الحالة</th>
                    <th>الإجمالي</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {entryRows.map((entry) => (
                    <tr key={entry._id}>
                      <td>{entry.entryNumber}</td>
                      <td>{entry.date}</td>
                      <td>{entry.memo}</td>
                      <td>{sourceLabel[entry.sourceType]}</td>
                      <td>{entry.status === "posted" ? "مرحّل" : "معكوس"}</td>
                      <td>{money(entry.totalDebit)}</td>
                      <td className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="font-bold text-indigo-700"
                          onClick={() => setSelectedEntryId(entry._id)}
                        >
                          التفاصيل
                        </button>
                        {canPrint && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handlePrintEntry(entry._id)}
                            aria-label={`طباعة ${entry.entryNumber}`}
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        )}
                        {canReverse &&
                          entry.status === "posted" &&
                          entry.sourceType !== "reversal" && (
                            <button
                              type="button"
                              className="font-bold text-red-600"
                              onClick={() => {
                                setSelectedEntryId(entry._id);
                                setReversalReason("");
                                setReversalDate(today());
                                reversalRequestId.current = newRequestId();
                                setModal("reverse");
                              }}
                            >
                              عكس
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {entries.status === "CanLoadMore" && (
              <button
                type="button"
                className="mt-4 font-bold text-indigo-700"
                onClick={() => entries.loadMore(15)}
              >
                تحميل المزيد
              </button>
            )}
          </div>
          {selectedEntryId && entryDetails && (
            <div className="card p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="font-black">
                    تفاصيل {entryDetails.entryNumber}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {entryDetails.branchName} · {entryDetails.date} ·{" "}
                    {entryDetails.employeeName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEntryId(null)}
                  aria-label="إغلاق تفاصيل القيد"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3">{entryDetails.memo}</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>الحساب</th>
                      <th>الوصف</th>
                      <th>مدين</th>
                      <th>دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entryDetails.lines.map((line) => (
                      <tr key={line.lineNumber}>
                        <td>{line.lineNumber}</td>
                        <td>
                          {line.accountCode} — {line.accountName}
                        </td>
                        <td>{line.description || "—"}</td>
                        <td>{money(line.debit)}</td>
                        <td>{money(line.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "periods" && (
        <section className="card p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-sm font-bold">فترة جديدة</span>
              <input
                className="form-input"
                type="month"
                value={periodKey}
                disabled={busy || !canClose}
                onChange={(event) => setPeriodKey(event.target.value)}
              />
            </label>
            {canClose && (
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)}
                onClick={() =>
                  void run(
                    () => createOrOpenPeriod({ periodKey }),
                    "تم فتح الفترة المالية",
                  )
                }
              >
                فتح الفترة
              </button>
            )}
          </div>
          <div className="space-y-2">
            {periods?.map((period) => (
              <div
                className="flex flex-col justify-between gap-2 rounded-xl border p-3 sm:flex-row sm:items-center"
                key={period.periodKey}
              >
                <div>
                  <strong>{period.periodKey}</strong>
                  <span className="mr-3 text-sm text-slate-500">
                    {period.startDate} — {period.endDate}
                  </span>
                  <span
                    className={`mr-3 rounded-full px-2 py-1 text-xs ${
                      period.status === "open"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {period.status === "open" ? "مفتوحة" : "مغلقة"}
                  </span>
                </div>
                <div>
                  {period.status === "open" && canClose && (
                    <button
                      type="button"
                      className="font-bold text-red-600"
                      onClick={() => {
                        setPeriodTarget(period.periodKey);
                        setPeriodAction("close");
                        setPeriodReason("");
                        setModal("period");
                      }}
                    >
                      إغلاق
                    </button>
                  )}
                  {period.status === "closed" && canReopen && (
                    <button
                      type="button"
                      className="flex items-center gap-1 font-bold text-indigo-700"
                      onClick={() => {
                        setPeriodTarget(period.periodKey);
                        setPeriodAction("reopen");
                        setPeriodReason("");
                        setModal("period");
                      }}
                    >
                      <RotateCcw className="h-4 w-4" /> إعادة فتح
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "ledger" && (
        <section className="card p-5">
          <h2 className="mb-4 font-bold">دفتر الحساب</h2>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <select
              className="form-input"
              value={ledgerAccountId ?? ""}
              onChange={(event) =>
                setLedgerAccountId(
                  event.target.value
                    ? (event.target.value as Id<"chartOfAccounts">)
                    : null,
                )
              }
            >
              <option value="">اختر الحساب</option>
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.code} — {account.nameAr}
                </option>
              ))}
            </select>
            <input
              className="form-input"
              type="date"
              value={ledgerFrom}
              onChange={(event) => setLedgerFrom(event.target.value)}
            />
            <input
              className="form-input"
              type="date"
              value={ledgerTo}
              onChange={(event) => setLedgerTo(event.target.value)}
            />
          </div>
          {ledgerAccountId && (
            <>
              <div className="mb-3 rounded-xl bg-indigo-50 p-3 text-sm font-bold text-indigo-800">
                الرصيد الافتتاحي قبل الفترة:{" "}
                {money(ledgerOpeningPage?.openingBalance ?? 0)}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>القيد</th>
                      <th>الوصف</th>
                      <th>مدين</th>
                      <th>دائن</th>
                      <th>الرصيد الجاري</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((row) => (
                      <tr
                        key={`${row.entryNumber}-${row.lineNumber}-${row.date}`}
                      >
                        <td>{row.date}</td>
                        <td>{row.entryNumber}</td>
                        <td>{row.description || "—"}</td>
                        <td>{money(row.debit)}</td>
                        <td>{money(row.credit)}</td>
                        <td>{money(row.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ledger.status === "CanLoadMore" && (
                <button
                  type="button"
                  className="mt-4 font-bold text-indigo-700"
                  onClick={() => ledger.loadMore(20)}
                >
                  تحميل المزيد
                </button>
              )}
            </>
          )}
        </section>
      )}

      {tab === "trial" && (
        <section className="card p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label>
              <span className="mb-1 block text-sm font-bold">الفترة</span>
              <input
                className="form-input"
                type="month"
                value={trialPeriod}
                onChange={(event) => setTrialPeriod(event.target.value)}
              />
            </label>
            {canPrint && (
              <button
                type="button"
                className="btn-primary flex items-center gap-1"
                disabled={busy || !effectiveBranch || !trialPeriod}
                onClick={() => void handlePrintTrialBalance()}
              >
                <Printer className="h-4 w-4" /> طباعة ميزان المراجعة
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th rowSpan={2}>الحساب</th>
                  <th colSpan={2}>الافتتاح</th>
                  <th colSpan={2}>حركة الفترة</th>
                  <th colSpan={2}>الختام</th>
                </tr>
                <tr>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>مدين</th>
                  <th>دائن</th>
                </tr>
              </thead>
              <tbody>
                {trialRows.map((row) => (
                  <tr key={row.code}>
                    <td>
                      {row.code} — {row.nameAr}
                    </td>
                    <td>{money(row.openingDebit)}</td>
                    <td>{money(row.openingCredit)}</td>
                    <td>{money(row.periodDebit)}</td>
                    <td>{money(row.periodCredit)}</td>
                    <td>{money(row.closingDebit)}</td>
                    <td>{money(row.closingCredit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>الإجمالي</th>
                  <th>{money(trialTotals.openingDebit)}</th>
                  <th>{money(trialTotals.openingCredit)}</th>
                  <th>{money(trialTotals.periodDebit)}</th>
                  <th>{money(trialTotals.periodCredit)}</th>
                  <th>{money(trialTotals.closingDebit)}</th>
                  <th>{money(trialTotals.closingCredit)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {modal === "account" && (
        <ModalShell
          title="إضافة حساب ترحيلي"
          close={() => !busy && setModal(null)}
        >
          <div className="space-y-3">
            <input
              className="form-input"
              value={newAccount.code}
              placeholder="كود الحساب"
              onChange={(event) =>
                setNewAccount((old) => ({ ...old, code: event.target.value }))
              }
            />
            <input
              className="form-input"
              value={newAccount.nameAr}
              placeholder="اسم الحساب بالعربية"
              onChange={(event) =>
                setNewAccount((old) => ({
                  ...old,
                  nameAr: event.target.value,
                }))
              }
            />
            <input
              className="form-input"
              value={newAccount.nameEn}
              placeholder="الاسم بالإنجليزية — اختياري"
              onChange={(event) =>
                setNewAccount((old) => ({
                  ...old,
                  nameEn: event.target.value,
                }))
              }
            />
            <select
              className="form-input"
              value={newAccount.parentId}
              onChange={(event) =>
                setNewAccount((old) => ({
                  ...old,
                  parentId: event.target.value,
                }))
              }
            >
              <option value="">اختر الحساب التجميعي الأب</option>
              {chart
                .filter((account) => !account.isPosting && account.isActive)
                .map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.code} — {account.nameAr}
                  </option>
                ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border p-3">
              <input
                type="checkbox"
                checked={newAccount.isContra}
                onChange={(event) =>
                  setNewAccount((old) => ({
                    ...old,
                    isContra: event.target.checked,
                  }))
                }
              />
              حساب مقابل Contra
            </label>
            <p className="text-sm text-slate-600">
              الطبيعة المحاسبية:{" "}
              {newAccountNormalSide === "debit" ? "مدينة" : "دائنة"}
            </p>
            <button
              type="button"
              className="btn-primary disabled:opacity-50"
              disabled={
                busy ||
                !canManageChart ||
                !newAccount.code.trim() ||
                !newAccount.nameAr.trim() ||
                !selectedParent
              }
              onClick={() =>
                selectedParent &&
                void run(
                  () =>
                    createAccount({
                      code: newAccount.code,
                      nameAr: newAccount.nameAr,
                      nameEn: newAccount.nameEn.trim() || undefined,
                      parentId: selectedParent._id,
                      normalSide: newAccountNormalSide,
                      isContra: newAccount.isContra,
                    }),
                  "تم إنشاء الحساب",
                  undefined,
                  () => setModal(null),
                )
              }
            >
              حفظ الحساب
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "deactivate" && deactivateTarget && (
        <ModalShell title="تعطيل حساب" close={() => !busy && setModal(null)}>
          <p className="mb-4">
            هل تريد تعطيل {deactivateTarget.code} — {deactivateTarget.nameAr}؟
            ستظل القيود التاريخية محفوظة.
          </p>
          <button
            type="button"
            className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            disabled={busy || !canManageChart}
            onClick={() =>
              void run(
                () => deactivateAccount({ accountId: deactivateTarget._id }),
                "تم تعطيل الحساب",
                undefined,
                () => {
                  setDeactivateTarget(null);
                  setModal(null);
                },
              )
            }
          >
            تأكيد التعطيل
          </button>
        </ModalShell>
      )}

      {modal === "reverse" && selectedEntryId && (
        <ModalShell title="عكس قيد يومية" close={() => !busy && setModal(null)}>
          <div className="space-y-3">
            <input
              className="form-input"
              type="date"
              value={reversalDate}
              onChange={(event) => {
                setReversalDate(event.target.value);
                reversalRequestId.current = newRequestId();
              }}
            />
            <textarea
              className="form-input"
              value={reversalReason}
              placeholder="سبب العكس الإلزامي"
              onChange={(event) => {
                setReversalReason(event.target.value);
                reversalRequestId.current = newRequestId();
              }}
            />
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50"
              disabled={
                busy || !canReverse || !reversalDate || !reversalReason.trim()
              }
              onClick={() =>
                void run(
                  () =>
                    reverseJournal({
                      entryId: selectedEntryId,
                      reversalDate,
                      reason: reversalReason.trim(),
                      requestId: reversalRequestId.current,
                    }),
                  "تم عكس القيد",
                  reversalRequestId,
                  () => setModal(null),
                )
              }
            >
              ترحيل قيد العكس
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "period" && periodTarget && (
        <ModalShell
          title={
            periodAction === "close"
              ? `إغلاق الفترة ${periodTarget}`
              : `إعادة فتح الفترة ${periodTarget}`
          }
          close={() => !busy && setModal(null)}
        >
          <textarea
            className="form-input"
            value={periodReason}
            placeholder="السبب الإلزامي"
            onChange={(event) => setPeriodReason(event.target.value)}
          />
          <button
            type="button"
            className="btn-primary mt-3 disabled:opacity-50"
            disabled={
              busy ||
              !periodReason.trim() ||
              (periodAction === "close" ? !canClose : !canReopen)
            }
            onClick={() =>
              void run(
                () =>
                  periodAction === "close"
                    ? closePeriod({
                        periodKey: periodTarget,
                        reason: periodReason.trim(),
                      })
                    : reopenPeriod({
                        periodKey: periodTarget,
                        reason: periodReason.trim(),
                      }),
                periodAction === "close"
                  ? "تم إغلاق الفترة"
                  : "تمت إعادة فتح الفترة",
                undefined,
                () => setModal(null),
              )
            }
          >
            تأكيد
          </button>
        </ModalShell>
      )}
    </div>
  );
}
