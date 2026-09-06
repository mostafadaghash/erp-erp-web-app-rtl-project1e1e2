import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Permission } from "../../convex/lib/permissions";
import {
  ORDER_STATUS_LABELS,
  REPAIR_STATUS_LABELS,
  type CanonicalOrderStatus,
  type RepairLifecycleStatus,
} from "../../shared/businessRules";
import type { Page } from "./ERPApp";

interface OperationalDashboardProps {
  permissions: Permission[];
  onNavigate: (page: Page) => void;
}

type StatusMeta<T extends string> = {
  key: T;
  surfaceClass: string;
  iconClass: string;
  valueClass: string;
};

const ORDER_STATUS_META: readonly StatusMeta<CanonicalOrderStatus>[] = [
  { key: "pending", surfaceClass: "border-amber-200 bg-amber-50/65", iconClass: "bg-amber-100 text-amber-700", valueClass: "text-amber-950" },
  { key: "confirmed", surfaceClass: "border-indigo-200 bg-indigo-50/65", iconClass: "bg-indigo-100 text-indigo-700", valueClass: "text-indigo-950" },
  { key: "preparing", surfaceClass: "border-blue-200 bg-blue-50/65", iconClass: "bg-blue-100 text-blue-700", valueClass: "text-blue-950" },
  { key: "ready", surfaceClass: "border-cyan-200 bg-cyan-50/65", iconClass: "bg-cyan-100 text-cyan-700", valueClass: "text-cyan-950" },
  { key: "handed_to_shipping", surfaceClass: "border-violet-200 bg-violet-50/65", iconClass: "bg-violet-100 text-violet-700", valueClass: "text-violet-950" },
  { key: "delivered_to_customer", surfaceClass: "border-emerald-200 bg-emerald-50/65", iconClass: "bg-emerald-100 text-emerald-700", valueClass: "text-emerald-950" },
  { key: "received", surfaceClass: "border-teal-200 bg-teal-50/65", iconClass: "bg-teal-100 text-teal-700", valueClass: "text-teal-950" },
  { key: "cancelled", surfaceClass: "border-rose-200 bg-rose-50/65", iconClass: "bg-rose-100 text-rose-700", valueClass: "text-rose-950" },
];

const REPAIR_STATUS_META: readonly StatusMeta<RepairLifecycleStatus>[] = [
  { key: "pending", surfaceClass: "border-amber-200 bg-amber-50/65", iconClass: "bg-amber-100 text-amber-700", valueClass: "text-amber-950" },
  { key: "technician_received", surfaceClass: "border-sky-200 bg-sky-50/65", iconClass: "bg-sky-100 text-sky-700", valueClass: "text-sky-950" },
  { key: "in_progress", surfaceClass: "border-blue-200 bg-blue-50/65", iconClass: "bg-blue-100 text-blue-700", valueClass: "text-blue-950" },
  { key: "new_issue", surfaceClass: "border-orange-200 bg-orange-50/65", iconClass: "bg-orange-100 text-orange-700", valueClass: "text-orange-950" },
  { key: "repaired", surfaceClass: "border-emerald-200 bg-emerald-50/65", iconClass: "bg-emerald-100 text-emerald-700", valueClass: "text-emerald-950" },
  { key: "delivered_to_customer", surfaceClass: "border-teal-200 bg-teal-50/65", iconClass: "bg-teal-100 text-teal-700", valueClass: "text-teal-950" },
  { key: "rejected_by_customer", surfaceClass: "border-rose-200 bg-rose-50/65", iconClass: "bg-rose-100 text-rose-700", valueClass: "text-rose-950" },
  { key: "rejected_by_technician", surfaceClass: "border-slate-300 bg-slate-100/80", iconClass: "bg-slate-200 text-slate-700", valueClass: "text-slate-950" },
];

function StatusCard({
  testId,
  title,
  value,
  page,
  icon: Icon,
  surfaceClass,
  iconClass,
  valueClass,
  onNavigate,
}: {
  testId: string;
  title: string;
  value: number;
  page: Page;
  icon: React.ElementType;
  surfaceClass: string;
  iconClass: string;
  valueClass: string;
  onNavigate: (page: Page) => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onNavigate(page)}
      className={`group flex min-h-[132px] min-w-0 flex-col rounded-2xl border p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 ${surfaceClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black leading-5 text-slate-700">{title}</p>
          <p className={`mt-2 text-[34px] font-black leading-none ${valueClass}`}>{value}</p>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-slate-900/5 pt-3 text-[11px] font-black text-slate-600 transition group-hover:text-emerald-700">
        <span>فتح التفاصيل</span>
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
      </div>
    </button>
  );
}

export function OperationalDashboard({ permissions, onNavigate }: OperationalDashboardProps) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const canViewOperationalDashboard = permissions.includes("view_operational_dashboard");
  const canViewOrders = permissions.includes("view_orders");
  const canViewRepairs = permissions.includes("view_repairs");

  const orderCounts = useQuery(
    api.operationStatusDashboard.orderCounts,
    canViewOperationalDashboard && canViewOrders ? { refreshToken } : "skip",
  );
  const repairCounts = useQuery(
    api.operationStatusDashboard.repairCounts,
    canViewOperationalDashboard && canViewRepairs ? { refreshToken } : "skip",
  );

  const waitingForData =
    (canViewOrders && orderCounts === undefined) ||
    (canViewRepairs && repairCounts === undefined);

  useEffect(() => {
    if (refreshing && !waitingForData) setRefreshing(false);
  }, [refreshing, waitingForData]);

  if (!canViewOperationalDashboard) {
    return <div className="erp-empty-state m-6">لا تملك صلاحية عرض لوحة التحكم التشغيلية.</div>;
  }

  const requestRefresh = () => {
    setRefreshing(true);
    setRefreshToken(Date.now());
  };

  return (
    <div className="p-4 lg:p-5" data-testid="operational-dashboard">
      <section className="mb-4 flex min-h-[78px] items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <PackageCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black text-emerald-700">لوحة التحكم</p>
            <h1 className="text-xl font-black leading-tight text-slate-900">لوحة التشغيل</h1>
            <p className="mt-0.5 truncate text-xs text-slate-500">حالات طلبات البيع وأوامر الصيانة حسب صلاحيات المستخدم والفرع المسموح به.</p>
          </div>
        </div>
        <button
          type="button"
          data-testid="operational-dashboard-refresh"
          onClick={requestRefresh}
          disabled={refreshing}
          className="hidden shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60 md:flex"
          title="البيانات تتحدث تلقائيًا، ويمكنك طلب إعادة تحميل فورية"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "جاري التحديث..." : "تحديث لحظي"}
        </button>
      </section>

      {canViewOrders && (
        <section className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50/20 p-3.5 lg:p-4" aria-labelledby="operational-orders-heading">
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <h2 id="operational-orders-heading" className="text-lg font-black text-slate-900">طلبات البيع</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">جميع حالات دورة طلب البيع بالترتيب التشغيلي</p>
            </div>
            {orderCounts && <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800">الإجمالي {orderCounts.total}</span>}
          </div>
          {orderCounts === undefined ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="جارٍ تحميل حالات طلبات البيع">
              {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[132px] animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="operational-orders-status-grid">
              {ORDER_STATUS_META.map((status) => (
                <StatusCard
                  key={status.key}
                  testId={`operational-order-status-${status.key}`}
                  title={ORDER_STATUS_LABELS[status.key]}
                  value={orderCounts[status.key]}
                  page="orders"
                  icon={ClipboardList}
                  surfaceClass={status.surfaceClass}
                  iconClass={status.iconClass}
                  valueClass={status.valueClass}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {canViewRepairs && (
        <section className="rounded-2xl border border-sky-100 bg-sky-50/20 p-3.5 lg:p-4" aria-labelledby="operational-repairs-heading">
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <h2 id="operational-repairs-heading" className="text-lg font-black text-slate-900">أوامر الصيانة</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">جميع حالات دورة أمر الصيانة بالترتيب التشغيلي</p>
            </div>
            {repairCounts && <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-black text-sky-800">الإجمالي {repairCounts.total}</span>}
          </div>
          {repairCounts === undefined ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="جارٍ تحميل حالات أوامر الصيانة">
              {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[132px] animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="operational-repairs-status-grid">
              {REPAIR_STATUS_META.map((status) => (
                <StatusCard
                  key={status.key}
                  testId={`operational-repair-status-${status.key}`}
                  title={REPAIR_STATUS_LABELS[status.key]}
                  value={repairCounts[status.key]}
                  page="repairs"
                  icon={Wrench}
                  surfaceClass={status.surfaceClass}
                  iconClass={status.iconClass}
                  valueClass={status.valueClass}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {!canViewOrders && !canViewRepairs && !waitingForData && (
        <div className="erp-empty-state">لا توجد أقسام تشغيلية متاحة ضمن صلاحيات هذا المستخدم.</div>
      )}
    </div>
  );
}
