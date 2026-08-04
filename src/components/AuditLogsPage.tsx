import { useMemo, useState, type ElementType } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Shield,
  Search,
  Trash2,
  Plus,
  Edit2,
  Eye,
  BarChart3,
  ChevronDown,
} from "lucide-react";

const ACTION_CONFIG: Record<
  string,
  { label: string; color: string; icon: ElementType }
> = {
  create: {
    label: "إنشاء",
    color: "bg-emerald-100 text-emerald-700",
    icon: Plus,
  },
  update: {
    label: "تعديل",
    color: "bg-blue-100 text-blue-700",
    icon: Edit2,
  },
  delete: {
    label: "حذف",
    color: "bg-red-100 text-red-700",
    icon: Trash2,
  },
  view: {
    label: "عرض",
    color: "bg-slate-100 text-slate-600",
    icon: Eye,
  },
  activate: {
    label: "تفعيل",
    color: "bg-emerald-100 text-emerald-700",
    icon: Plus,
  },
  deactivate: {
    label: "تعطيل",
    color: "bg-amber-100 text-amber-700",
    icon: Trash2,
  },
  post: { label: "ترحيل", color: "bg-indigo-100 text-indigo-700", icon: Plus },
  initialize: { label: "تهيئة", color: "bg-emerald-100 text-emerald-700", icon: Plus },
  confirm_opening: { label: "اعتماد افتتاح", color: "bg-emerald-100 text-emerald-700", icon: Plus },
  activate_financial_posting: { label: "تفعيل الربط", color: "bg-emerald-100 text-emerald-700", icon: Plus },
  reverse: {
    label: "عكس",
    color: "bg-orange-100 text-orange-700",
    icon: Trash2,
  },
  cancel: { label: "إلغاء", color: "bg-red-100 text-red-700", icon: Trash2 },
  confirm: { label: "تأكيد", color: "bg-emerald-100 text-emerald-700", icon: Plus },
  refund: { label: "استرداد", color: "bg-orange-100 text-orange-700", icon: Trash2 },
  record_payment: { label: "تحصيل", color: "bg-emerald-100 text-emerald-700", icon: Plus },
  update_status: { label: "تغيير حالة", color: "bg-blue-100 text-blue-700", icon: Edit2 },
  update_details: { label: "تعديل تفاصيل", color: "bg-blue-100 text-blue-700", icon: Edit2 },
  rotate_tracking_token: { label: "تجديد التتبع", color: "bg-amber-100 text-amber-700", icon: Edit2 },
};

const MODULE_LABELS: Record<string, string> = {
  invoices: "الفواتير",
  orders: "الأوردرات",
  deliveries: "التوصيلات",
  repairs: "الصيانة",
  expenses: "المصروفات",
  suppliers: "الموردون",
  shipments: "الشحنات",
  crm: "CRM",
  branches: "الفروع",
  employees: "الموظفون",
  products: "المنتجات",
  customers: "العملاء",
  settings: "الإعدادات",
  finance: "المالية",
  general_ledger: "الأستاذ العام",
  customer_ledger: "دفتر العملاء",
  supplier_ledger: "دفتر الموردين",
  supplier_payments: "مدفوعات الموردين",
  sales_returns: "مرتجعات المبيعات",
  purchase_returns: "مرتجعات المشتريات",
  cod_settlements: "تسويات COD",
};

const FIELD_LABELS: Record<string, string> = {
  name: "الاسم",
  role: "الدور",
  branchId: "الفرع",
  isActive: "نشط",
  permissionsCount: "عدد الصلاحيات",
  storeName: "اسم المتجر",
  storeType: "نوع المتجر",
  currency: "العملة",
  taxRate: "الضريبة",
  phoneLast4: "آخر 4 أرقام",
  hasEmail: "يوجد بريد",
  hasAddress: "يوجد عنوان",
  hasNotes: "توجد ملاحظات",
  sku: "SKU",
  categoryId: "الفئة",
  supplierId: "المورد",
  minStock: "حد المخزون",
  unit: "الوحدة",
  stock: "المخزون",
  type: "نوع الحركة",
  status: "الحالة",
  date: "التاريخ",
  amount: "المبلغ",
  amountDelta: "أثر الحركة",
  balance: "الرصيد",
  receivableBalance: "مديونية العميل",
  advanceBalance: "الرصيد المقدم",
  totalPurchases: "إجمالي المشتريات",
  allocationsCount: "عدد التوزيعات",
  accountName: "الحساب المالي",
  supplierName: "المورد",
  reversalReason: "سبب العكس",
  cancellationReason: "سبب الإلغاء",
  customerName: "العميل",
  total: "الإجمالي",
  paid: "المدفوع",
  remaining: "المتبقي",
  deposit: "العربون",
  totalAmount: "قيمة التوصيل",
  codAmount: "تحصيل COD",
  prepaidAmount: "المدفوع مقدمًا",
  expectedCarrierFee: "رسوم الناقل المتوقعة",
  attemptNumber: "رقم المحاولة",
  deliveriesCount: "عدد التوصيلات",
  grossAmount: "الإجمالي المحصل",
  feeAmount: "الرسوم",
  netAmount: "الصافي",
  sourceAccountName: "حساب المصدر",
  destinationAccountName: "حساب الوجهة",
  laborCost: "تكلفة العمالة",
  partsCount: "عدد القطع",
  technicianName: "الفني",
  warrantyDays: "أيام الضمان",
  itemsCount: "عدد البنود",
  totalCredit: "قيمة الإشعار",
  debtReduction: "تخفيض المديونية",
  cashRefund: "الرد النقدي",
  inventoryValueRemoved: "قيمة المخزون",
  publicTrackingActive: "التتبع العام فعال",
  publicTrackingRotated: "تم تجديد التتبع",
  hasDiagnosis: "يوجد تشخيص",
  hasSerialNumber: "يوجد رقم تسلسلي",
  hasQualityCheckNotes: "توجد ملاحظات فحص",
};

type SnapshotRow = { field: string; value: string };

type AuditDocumentLink = { type: string | null; id: string | null; number: string | null };

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  financial_transaction: "حركة مالية",
  journal_entry: "قيد يومية",
  chart_of_account: "حساب مالي",
  accounting_period: "فترة محاسبية",
  general_ledger_settings: "إعدادات الأستاذ",
  general_ledger_opening: "افتتاح الأستاذ",
  customer: "عميل",
  customer_ledger_entry: "حركة دفتر عميل",
  supplier: "مورد",
  supplier_ledger_entry: "حركة دفتر مورد",
  supplier_payment: "سند دفع مورد",
  supplier_payment_reversal: "عكس سند دفع مورد",
  purchase_receipt: "مستند شراء",
  purchase_return: "مرتجع شراء",
  supplier_refund: "استرداد مورد",
  invoice: "فاتورة",
  order: "طلب",
  repair: "إصلاح",
  delivery: "توصيل",
  delivery_confirmation: "تأكيد توصيل",
  cod_settlement: "تسوية COD",
  sales_return: "إشعار دائن مبيعات",
};

function DocumentLinks({
  source,
  related,
  financialTransactionId,
  journalEntryId,
  reversalOfId,
}: {
  source: AuditDocumentLink;
  related: AuditDocumentLink;
  financialTransactionId: string | null;
  journalEntryId: string | null;
  reversalOfId: string | null;
}) {
  const rows = [
    source.type || source.id || source.number
      ? { label: "المستند", type: source.type, id: source.id, number: source.number }
      : null,
    related.type || related.id || related.number
      ? { label: "مرتبط بـ", type: related.type, id: related.id, number: related.number }
      : null,
    financialTransactionId ? { label: "الحركة المالية", type: "financial_transaction", id: financialTransactionId, number: null } : null,
    journalEntryId ? { label: "القيد المحاسبي", type: "journal_entry", id: journalEntryId, number: null } : null,
    reversalOfId ? { label: "عكس لـ", type: null, id: reversalOfId, number: null } : null,
  ].filter(Boolean) as Array<{ label: string; type: string | null; id: string | null; number: string | null }>;
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((row) => (
        <span key={`${row.label}:${row.type ?? ""}:${row.id ?? ""}:${row.number ?? ""}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
          <strong className="text-slate-700">{row.label}:</strong>{" "}
          {row.type ? (DOCUMENT_TYPE_LABELS[row.type] ?? row.type) : "مرجع"}
          {row.number ? ` #${row.number}` : ""}
          {!row.number && row.id ? ` (${row.id.slice(0, 12)}…)` : ""}
        </span>
      ))}
    </div>
  );
}

function SnapshotList({ title, rows }: { title: string; rows: SnapshotRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold text-slate-700">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">لا توجد بيانات</p>
      ) : (
        <dl className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.field} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-2 text-xs">
              <dt className="font-medium text-slate-500">
                {FIELD_LABELS[row.field] ?? row.field}
              </dt>
              <dd className="break-words text-slate-700">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function startOfDay(value: string) {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined;
}

function endOfDay(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).getTime() : undefined;
}

export function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const queryArgs = useMemo(
    () => ({
      module: filterModule === "all" ? undefined : filterModule,
      action: filterAction === "all" ? undefined : filterAction,
      fromTimestamp: startOfDay(fromDate),
      toTimestamp: endOfDay(toDate),
    }),
    [filterAction, filterModule, fromDate, toDate],
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.auditLogs.listPaginated,
    queryArgs,
    { initialNumItems: 50 },
  );

  const normalizedSearch = search.trim().toLocaleLowerCase("ar-EG");
  const filtered = useMemo(
    () =>
      results.filter((log) => {
        if (!normalizedSearch) return true;
        return [
          log.recordLabel ?? "",
          log.recordId ?? "",
          log.userName,
          log.details ?? "",
          MODULE_LABELS[log.module] ?? log.module,
          ...log.beforeSnapshot.flatMap((row) => [row.field, row.value]),
          ...log.afterSnapshot.flatMap((row) => [row.field, row.value]),
          ...log.changedFields,
          log.sourceType ?? "", log.sourceNumber ?? "", log.relatedType ?? "", log.relatedNumber ?? "",
          log.financialTransactionId ?? "", log.journalEntryId ?? "", log.reversalOfId ?? "",
        ].some((value) =>
          value.toLocaleLowerCase("ar-EG").includes(normalizedSearch),
        );
      }),
    [normalizedSearch, results],
  );

  const loadedStats = useMemo(() => {
    const byAction: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    for (const log of results) {
      byAction[log.action] = (byAction[log.action] ?? 0) + 1;
      byModule[log.module] = (byModule[log.module] ?? 0) + 1;
    }
    return { byAction, byModule };
  }, [results]);

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const isLoadingFirstPage = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";
  const trueEmpty = status === "Exhausted" && results.length === 0;
  const searchEmpty = results.length > 0 && filtered.length === 0;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            سجل العمليات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            تتبع الإجراءات المسجلة على النظام بتحميل متدرج
          </p>
        </div>
        <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
          سجل محفوظ ولا توجد واجهة لحذفه
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "السجلات المحملة",
            value: results.length,
            color: "bg-slate-100 text-slate-700",
          },
          {
            label: "إنشاء",
            value: loadedStats.byAction.create ?? 0,
            color: "bg-emerald-100 text-emerald-700",
          },
          {
            label: "تعديل",
            value: loadedStats.byAction.update ?? 0,
            color: "bg-blue-100 text-blue-700",
          },
          {
            label: "حذف/تعطيل",
            value:
              (loadedStats.byAction.delete ?? 0) +
              (loadedStats.byAction.deactivate ?? 0),
            color: "bg-red-100 text-red-700",
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-xl p-4 text-center ${item.color}`}
          >
            <p className="text-2xl font-black">{item.value}</p>
            <p className="text-xs font-medium mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {Object.keys(loadedStats.byModule).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-500" />
            نشاط الأقسام في السجلات المحملة
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(loadedStats.byModule)
              .sort(([, first], [, second]) => second - first)
              .map(([moduleName, count]) => {
                const maxCount = Math.max(
                  ...Object.values(loadedStats.byModule),
                );
                const percentage = Math.round((count / maxCount) * 100);
                return (
                  <div key={moduleName} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-700">
                        {MODULE_LABELS[moduleName] ?? moduleName}
                      </span>
                      <span className="text-xs font-black text-indigo-600">
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="relative xl:col-span-2">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-9"
            placeholder="بحث داخل السجلات المحملة..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={isLoadingFirstPage}
          />
        </div>
        <select
          className="form-input"
          value={filterAction}
          onChange={(event) => setFilterAction(event.target.value)}
        >
          <option value="all">كل العمليات</option>
          {Object.entries(ACTION_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>
              {config.label}
            </option>
          ))}
        </select>
        <select
          className="form-input"
          value={filterModule}
          onChange={(event) => setFilterModule(event.target.value)}
        >
          <option value="all">كل الأقسام</option>
          {Object.entries(MODULE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            className="form-input"
            aria-label="من تاريخ"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <input
            type="date"
            className="form-input"
            aria-label="إلى تاريخ"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
      </div>

      {search && results.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          البحث النصي يطابق السجلات المحملة فقط. استخدم القسم والعملية والتاريخ
          لتضييق النتائج على الخادم.
        </p>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoadingFirstPage ? (
          <div className="text-center py-16 text-slate-500 font-medium">
            جارٍ تحميل سجل العمليات...
          </div>
        ) : trueEmpty ? (
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              لا توجد سجلات تطابق الفلاتر المحددة
            </p>
          </div>
        ) : searchEmpty ? (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              لا توجد نتائج بحث داخل السجلات المحملة
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-b from-slate-50 to-slate-100 border-b border-slate-200">
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600">
                    الوقت
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600">
                    العملية
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600">
                    القسم
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600">
                    السجل
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600">
                    المستخدم
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600">
                    التفاصيل
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => {
                  const actionConfig = ACTION_CONFIG[log.action] ?? {
                    label: log.action,
                    color: "bg-slate-100 text-slate-700",
                    icon: Eye,
                  };
                  const ActionIcon = actionConfig.icon;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${actionConfig.color}`}
                        >
                          <ActionIcon className="w-3 h-3" />
                          {actionConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                          {MODULE_LABELS[log.module] ?? log.module}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {log.recordLabel ?? log.recordId ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {log.userName}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 min-w-72 max-w-xl">
                        <div className="space-y-2">
                          <span className="line-clamp-2" title={log.details ?? undefined}>
                            {log.details ?? "—"}
                          </span>
                          <DocumentLinks
                            source={{ type: log.sourceType, id: log.sourceId, number: log.sourceNumber }}
                            related={{ type: log.relatedType, id: log.relatedId, number: log.relatedNumber }}
                            financialTransactionId={log.financialTransactionId}
                            journalEntryId={log.journalEntryId}
                            reversalOfId={log.reversalOfId}
                          />
                          {log.changedFields.length > 0 && (
                            <details className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2">
                              <summary className="cursor-pointer font-bold text-indigo-700">
                                عرض Before / After ({log.changedFields.length})
                              </summary>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <SnapshotList title="قبل" rows={log.beforeSnapshot} />
                                <SnapshotList title="بعد" rows={log.afterSnapshot} />
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoadingFirstPage && results.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-xs text-slate-400">
            عرض {filtered.length} نتيجة من {results.length} سجل محمل
          </p>
          {(canLoadMore || isLoadingMore) && (
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              disabled={isLoadingMore}
              onClick={() => loadMore(50)}
            >
              <ChevronDown className="w-4 h-4" />
              {isLoadingMore ? "جارٍ تحميل المزيد..." : "تحميل 50 سجلًا إضافيًا"}
            </button>
          )}
          {status === "Exhausted" && (
            <span className="text-xs text-slate-400">
              تم تحميل كل السجلات المطابقة
            </span>
          )}
        </div>
      )}
    </div>
  );
}
