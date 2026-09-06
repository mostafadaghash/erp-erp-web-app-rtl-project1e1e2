import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Boxes,
  CalendarClock,
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

type OperationalCard = {
  key: string;
  title: string;
  value: number;
  note: string;
  page: Page;
  icon: React.ElementType;
  iconClass: string;
};

type StatusMeta<T extends string> = {
  key: T;
  iconClass: string;
};

const ORDER_STATUS_META: readonly StatusMeta<CanonicalOrderStatus>[] = [
  { key: "pending", iconClass: "bg-amber-50 text-amber-700" },
  { key: "confirmed", iconClass: "bg-indigo-50 text-indigo-700" },
  { key: "preparing", iconClass: "bg-blue-50 text-blue-700" },
  { key: "ready", iconClass: "bg-cyan-50 text-cyan-700" },
  { key: "handed_to_shipping", iconClass: "bg-violet-50 text-violet-700" },
  { key: "delivered_to_customer", iconClass: "bg-emerald-50 text-emerald-700" },
  { key: "received", iconClass: "bg-teal-50 text-teal-700" },
  { key: "cancelled", iconClass: "bg-rose-50 text-rose-700" },
];

const REPAIR_STATUS_META: readonly StatusMeta<RepairLifecycleStatus>[] = [
  { key: "pending", iconClass: "bg-amber-50 text-amber-700" },
  { key: "in_progress", iconClass: "bg-blue-50 text-blue-700" },
  { key: "new_issue", iconClass: "bg-orange-50 text-orange-700" },
  { key: "repaired", iconClass: "bg-emerald-50 text-emerald-700" },
  { key: "delivered_to_customer", iconClass: "bg-teal-50 text-teal-700" },
  { key: "rejected_by_customer", iconClass: "bg-rose-50 text-rose-700" },
  { key: "rejected_by_shipping", iconClass: "bg-slate-100 text-slate-700" },
];

function StatusCard({
  testId,
  title,
  value,
  note,
  page,
  icon: Icon,
  iconClass,
  onNavigate,
}: OperationalCard & { testId: string; onNavigate: (page: Page) => void }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onNavigate(page)}
      className="group flex min-h-[142px] min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-slate-500">{title}</p>
          <p className="mt-1.5 text-[32px] font-black leading-none text-slate-900">{value}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 min-h-8 text-xs font-medium leading-5 text-slate-500">{note}</p>
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] font-black text-emerald-700">
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
  const canViewFollowUps = permissions.includes("view_follow_ups");
  const canViewProducts = permissions.includes("view_products");

  const orderCounts = useQuery(
    api.operationStatusDashboard.orderCounts,
    canViewOperationalDashboard && canViewOrders ? { refreshToken } : "skip",
  );
  const repairCounts = useQuery(
    api.operationStatusDashboard.repairCounts,
    canViewOperationalDashboard && canViewRepairs ? { refreshToken } : "skip",
  );
  const pendingFollowUps = useQuery(
    api.customerFollowUps.list,
    canViewOperationalDashboard && canViewFollowUps ? { status: "pending", limit: 100 } : "skip",
  );
  const lowStockProducts = useQuery(
    api.products.list,
    canViewOperationalDashboard && canViewProducts ? { lowStock: true } : "skip",
  );

  const waitingForData =
    (canViewOrders && orderCounts === undefined) ||
    (canViewRepairs && repairCounts === undefined) ||
    (canViewFollowUps && pendingFollowUps === undefined) ||
    (canViewProducts && lowStockProducts === undefined);

  useEffect(() => {
    if (refreshing && !waitingForData) setRefreshing(false);
  }, [refreshing, waitingForData]);

  if (!canViewOperationalDashboard) {
    return <div className="erp-empty-state m-6">لا تملك صلاحية عرض لوحة التحكم التشغيلية.</div>;
  }

  const otherCards: OperationalCard[] = [];
  if (canViewFollowUps && pendingFollowUps) {
    otherCards.push({
      key: "follow-ups",
      title: "متابعات مطلوبة",
      value: pendingFollowUps.length,
      note: "متابعات العملاء التي تحتاج إجراء",
      page: "follow-ups",
      icon: CalendarClock,
      iconClass: "bg-amber-50 text-amber-700",
    });
  }
  if (canViewProducts && lowStockProducts) {
    otherCards.push({
      key: "low-stock",
      title: "تنبيهات المخزون",
      value: lowStockProducts.length,
      note: "أصناف وصلت أو اقتربت من حد إعادة الطلب",
      page: "inventory",
      icon: Boxes,
      iconClass: "bg-violet-50 text-violet-700",
    });
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
            <p className="mt-0.5 truncate text-xs text-slate-500">ملخص العمل اليومي حسب صلاحيات المستخدم والفرع المسموح به.</p>
          </div>
        </div>
        <button
          type="button"
          data-testid="operational-dashboard-refresh"
          onClick={requestRefresh}
          disabled={refreshing}
          className="hidden shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-wait disabled:opacity-60 md:flex"
          title="البيانات تتحدث تلقائيًا، ويمكنك طلب إعادة تحميل فورية"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "جاري التحديث..." : "تحديث لحظي"}
        </button>
      </section>

      {canViewOrders && (
        <section className="mb-5" aria-labelledby="operational-orders-heading">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <div>
              <h2 id="operational-orders-heading" className="text-base font-black text-slate-900">طلبات البيع</h2>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">جميع حالات دورة طلب البيع</p>
            </div>
            {orderCounts && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">الإجمالي {orderCounts.total}</span>}
          </div>
          {orderCounts === undefined ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3" aria-label="جارٍ تحميل حالات طلبات البيع">
              {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[142px] animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3" data-testid="operational-orders-status-grid">
              {ORDER_STATUS_META.map((status) => (
                <StatusCard
                  key={status.key}
                  testId={`operational-order-status-${status.key}`}
                  title={ORDER_STATUS_LABELS[status.key]}
                  value={orderCounts[status.key]}
                  note="عدد طلبات البيع في هذه الحالة"
                  page="orders"
                  icon={ClipboardList}
                  iconClass={status.iconClass}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {canViewRepairs && (
        <section className="mb-5" aria-labelledby="operational-repairs-heading">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <div>
              <h2 id="operational-repairs-heading" className="text-base font-black text-slate-900">أوامر الصيانة</h2>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">جميع حالات دورة أمر الصيانة</p>
            </div>
            {repairCounts && <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">الإجمالي {repairCounts.total}</span>}
          </div>
          {repairCounts === undefined ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3" aria-label="جارٍ تحميل حالات أوامر الصيانة">
              {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-[142px] animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3" data-testid="operational-repairs-status-grid">
              {REPAIR_STATUS_META.map((status) => (
                <StatusCard
                  key={status.key}
                  testId={`operational-repair-status-${status.key}`}
                  title={REPAIR_STATUS_LABELS[status.key]}
                  value={repairCounts[status.key]}
                  note="عدد أوامر الصيانة في هذه الحالة"
                  page="repairs"
                  icon={Wrench}
                  iconClass={status.iconClass}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {otherCards.length > 0 && (
        <section aria-labelledby="operational-alerts-heading">
          <div className="mb-2.5 px-1">
            <h2 id="operational-alerts-heading" className="text-base font-black text-slate-900">المتابعات والتنبيهات</h2>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">مؤشرات تشغيلية إضافية حسب صلاحيات المستخدم</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
            {otherCards.map((card) => (
              <StatusCard
                key={card.key}
                {...card}
                testId={`operational-card-${card.key}`}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      )}

      {!canViewOrders && !canViewRepairs && otherCards.length === 0 && !waitingForData && (
        <div className="erp-empty-state">لا توجد مؤشرات تشغيلية إضافية متاحة ضمن صلاحيات هذا المستخدم.</div>
      )}
    </div>
  );
}
