import { useQuery } from "convex/react";
import { AlertCircle, CheckCircle, Clock, PackageCheck, Truck, Wrench } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function OperationStatusReportCards({
  from,
  to,
  branchId,
  enabled = true,
}: {
  from: string;
  to: string;
  branchId?: Id<"branches">;
  enabled?: boolean;
}) {
  const data = useQuery(
    api.operationStatusDashboard.reportCounts,
    enabled ? { from, to, branchId } : "skip",
  );

  if (!enabled) return null;
  if (!data) return <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />;

  const orderItems = [
    ["قيد الإنتظار", data.orders.pending, Clock],
    ["مؤكد", data.orders.confirmed, CheckCircle],
    ["جاري التجهيز", data.orders.preparing, PackageCheck],
    ["تم التجهيز", data.orders.ready, PackageCheck],
    ["تم التسليم للعميل", data.orders.delivered_to_customer, CheckCircle],
    ["تم التسليم لشركة الشحن", data.orders.handed_to_shipping, Truck],
    ["تم الإستلام", data.orders.received, CheckCircle],
    ["ملغي", data.orders.cancelled, AlertCircle],
  ] as const;

  const repairItems = [
    ["قيد الإنتظار", data.repairs.pending, Clock],
    ["جاري الصيانة", data.repairs.in_progress, Wrench],
    ["ظهور مشكلة جديدة", data.repairs.new_issue, AlertCircle],
    ["تم الإصلاح", data.repairs.repaired, CheckCircle],
    ["تم التسليم للعميل", data.repairs.delivered_to_customer, CheckCircle],
    ["مرفوض من العميل", data.repairs.rejected_by_customer, AlertCircle],
    ["مرفوض من شركة الشحن", data.repairs.rejected_by_shipping, AlertCircle],
  ] as const;

  const renderGroup = (
    title: string,
    total: number,
    items: ReadonlyArray<readonly [string, number, typeof Clock]>,
    testId: string,
  ) => (
    <section className="erp-section" data-testid={testId}>
      <div className="erp-section-header">
        <div>
          <p className="text-xs font-bold text-[var(--erp-accent-strong)]">من {from} إلى {to}</p>
          <h2 className="erp-section-title mt-1">{title}</h2>
        </div>
        <span className="erp-status">الإجمالي: {total}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4 xl:grid-cols-8">
        {items.map(([label, value, Icon]) => (
          <div key={label} className="flex min-h-20 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <div><p className="text-xl font-black text-slate-900">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{label}</p></div>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50"><Icon className="h-4 w-4 text-indigo-600" /></div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-4" data-testid="operation-status-report">
      {renderGroup("حالات أوامر البيع", data.orders.total, orderItems, "order-status-report")}
      {renderGroup("حالات أوامر الصيانة", data.repairs.total, repairItems, "repair-status-report")}
    </div>
  );
}
