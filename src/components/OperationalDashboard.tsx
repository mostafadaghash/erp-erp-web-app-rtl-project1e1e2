import { useQuery } from "convex/react";
import { Boxes, CalendarClock, ClipboardList, PackageCheck, Truck, Wrench } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Permission } from "../../convex/lib/permissions";
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
};

export function OperationalDashboard({ permissions, onNavigate }: OperationalDashboardProps) {
  const canViewOperationalDashboard = permissions.includes("view_operational_dashboard");
  const canViewOrders = permissions.includes("view_orders");
  const canViewRepairs = permissions.includes("view_repairs");
  const canViewFollowUps = permissions.includes("view_follow_ups");
  const canViewProducts = permissions.includes("view_products");
  const canViewDeliveries = permissions.includes("view_deliveries");

  const orderCounts = useQuery(
    api.operationStatusDashboard.orderCounts,
    canViewOperationalDashboard && canViewOrders ? {} : "skip",
  );
  const repairCounts = useQuery(
    api.operationStatusDashboard.repairCounts,
    canViewOperationalDashboard && canViewRepairs ? {} : "skip",
  );
  const pendingFollowUps = useQuery(
    api.customerFollowUps.list,
    canViewOperationalDashboard && canViewFollowUps ? { status: "pending", limit: 100 } : "skip",
  );
  const lowStockProducts = useQuery(
    api.products.list,
    canViewOperationalDashboard && canViewProducts ? { lowStock: true } : "skip",
  );

  if (!canViewOperationalDashboard) {
    return <div className="erp-empty-state m-6">لا تملك صلاحية عرض لوحة التحكم التشغيلية.</div>;
  }

  const openOrders = orderCounts
    ? orderCounts.pending + orderCounts.confirmed + orderCounts.preparing + orderCounts.ready + orderCounts.handed_to_shipping
    : 0;
  const openRepairs = repairCounts
    ? repairCounts.pending + repairCounts.in_progress + repairCounts.new_issue + repairCounts.repaired
    : 0;

  const cards: OperationalCard[] = [];
  if (canViewOrders && orderCounts) {
    cards.push({
      key: "orders",
      title: "طلبات البيع المفتوحة",
      value: openOrders,
      note: `${orderCounts.pending} انتظار · ${orderCounts.preparing} تجهيز · ${orderCounts.ready} جاهز`,
      page: "orders",
      icon: ClipboardList,
    });
  }
  if (canViewRepairs && repairCounts) {
    cards.push({
      key: "repairs",
      title: "أوامر الصيانة المفتوحة",
      value: openRepairs,
      note: `${repairCounts.pending} انتظار · ${repairCounts.in_progress} جاري الصيانة · ${repairCounts.new_issue} مشكلة جديدة`,
      page: "repairs",
      icon: Wrench,
    });
  }
  if (canViewFollowUps && pendingFollowUps) {
    cards.push({
      key: "follow-ups",
      title: "متابعات مطلوبة",
      value: pendingFollowUps.length,
      note: "متابعات العملاء التي تحتاج إجراء",
      page: "follow-ups",
      icon: CalendarClock,
    });
  }
  if (canViewProducts && lowStockProducts) {
    cards.push({
      key: "low-stock",
      title: "تنبيهات المخزون",
      value: lowStockProducts.length,
      note: "أصناف وصلت أو اقتربت من حد إعادة الطلب",
      page: "inventory",
      icon: Boxes,
    });
  }
  if (canViewDeliveries && orderCounts) {
    cards.push({
      key: "shipping",
      title: "طلبات لدى الشحن",
      value: orderCounts.handed_to_shipping,
      note: "طلبات تم تسليمها لشركة الشحن وتحتاج متابعة",
      page: "deliveries",
      icon: Truck,
    });
  }

  const waitingForData =
    (canViewOrders && orderCounts === undefined) ||
    (canViewRepairs && repairCounts === undefined) ||
    (canViewFollowUps && pendingFollowUps === undefined) ||
    (canViewProducts && lowStockProducts === undefined);

  return (
    <div className="p-4 lg:p-6" data-testid="operational-dashboard">
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <PackageCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-bold text-emerald-700">لوحة التحكم</p>
            <h1 className="text-xl font-black text-slate-900">لوحة التشغيل</h1>
            <p className="mt-0.5 text-xs text-slate-500">ملخص العمل اليومي حسب صلاحيات المستخدم والفرع المسموح به.</p>
          </div>
        </div>
      </section>

      {waitingForData && cards.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="جارٍ تحميل مؤشرات التشغيل">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : cards.length > 0 ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="مؤشرات التشغيل">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.key}
                type="button"
                data-testid={`operational-card-${card.key}`}
                onClick={() => onNavigate(card.page)}
                className="min-h-36 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-slate-500">{card.title}</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{card.value}</p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-emerald-700">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-4 text-xs font-medium leading-5 text-slate-500">{card.note}</p>
              </button>
            );
          })}
        </section>
      ) : (
        <div className="erp-empty-state">لا توجد مؤشرات تشغيلية إضافية متاحة ضمن صلاحيات هذا المستخدم.</div>
      )}
    </div>
  );
}
