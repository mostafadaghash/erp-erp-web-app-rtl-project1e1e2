import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Permission } from "../../convex/lib/permissions";
import {
  AlertTriangle,
  Boxes,
  Download,
  FileText,
  Loader2,
  Package,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

type Dataset =
  | "products"
  | "customers"
  | "invoices"
  | "orders"
  | "repairs"
  | "shipments"
  | "suppliers"
  | "expenses"
  | "deliveries";

type ExportCell = string | number | boolean | null;
type ExportPayload = {
  dataset: Dataset;
  label: string;
  columns: Array<{ key: string; label: string }>;
  rows: ExportCell[][];
  truncated: boolean;
  rowLimit: number;
  exportedAt: number;
  scope: "global" | "all_branches" | "assigned_branch";
};

type DatasetConfig = {
  id: Dataset;
  label: string;
  description: string;
  permission: Permission;
  icon: LucideIcon;
};

const DATASETS: DatasetConfig[] = [
  {
    id: "products",
    label: "الأصناف",
    description: "الأسعار والأرصدة وحدود إعادة الطلب",
    permission: "view_products",
    icon: Package,
  },
  {
    id: "customers",
    label: "العملاء",
    description: "بيانات التواصل والأرصدة وإجمالي المشتريات",
    permission: "view_customers",
    icon: Users,
  },
  {
    id: "invoices",
    label: "الفواتير",
    description: "البنود والإجماليات والتحصيل والحالة",
    permission: "view_invoices",
    icon: FileText,
  },
  {
    id: "orders",
    label: "أوامر البيع",
    description: "البنود والعربون والمتبقي وحالة التنفيذ",
    permission: "view_orders",
    icon: ShoppingCart,
  },
  {
    id: "repairs",
    label: "الصيانة",
    description: "الأجهزة والأعطال والتكاليف وحالة الصيانة",
    permission: "view_repairs",
    icon: Wrench,
  },
  {
    id: "shipments",
    label: "المشتريات",
    description: "الموردون والبنود والتكلفة وحالة الوصول",
    permission: "view_shipments",
    icon: Boxes,
  },
  {
    id: "suppliers",
    label: "الموردون",
    description: "بيانات المورد الأساسية دون أرصدة الدفاتر",
    permission: "view_suppliers",
    icon: Truck,
  },
  {
    id: "expenses",
    label: "المصروفات",
    description: "التصنيف والمبلغ وطريقة الدفع والحالة",
    permission: "view_expenses",
    icon: ReceiptText,
  },
  {
    id: "deliveries",
    label: "عمليات الشحن",
    description: "الشحن والعملاء والتحصيل عند الاستلام",
    permission: "view_deliveries",
    icon: UserRound,
  },
];

export function csvCell(value: ExportCell): string {
  const original = value === null ? "" : String(value);
  const protectedValue = /^[\u0000-\u0020]*[=+\-@]/.test(original)
    ? `'${original}`
    : original;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

export function buildCsv(payload: ExportPayload): string {
  const header = payload.columns.map((column) => csvCell(column.label)).join(",");
  const rows = payload.rows.map((row) => row.map(csvCell).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

function downloadCsv(payload: ExportPayload) {
  const blob = new Blob([buildCsv(payload)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date(payload.exportedAt).toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `erp-${payload.dataset}-${date}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DataExportPage({
  permissions,
}: {
  permissions: Permission[];
}) {
  const exportDataset = useMutation(api.dataExport.exportDataset);
  const [pending, setPending] = useState<Dataset | null>(null);
  const [lastExport, setLastExport] = useState<{
    label: string;
    rows: number;
    truncated: boolean;
    rowLimit: number;
  } | null>(null);

  const availableDatasets = DATASETS.filter((dataset) =>
    permissions.includes(dataset.permission),
  );

  const handleExport = async (dataset: DatasetConfig) => {
    if (pending) return;
    setPending(dataset.id);
    try {
      const result = (await exportDataset({
        dataset: dataset.id,
      })) as ExportPayload;
      downloadCsv(result);
      setLastExport({
        label: result.label,
        rows: result.rows.length,
        truncated: result.truncated,
        rowLimit: result.rowLimit,
      });
      if (result.truncated) {
        toast.warning(
          `تم تنزيل أول ${result.rowLimit.toLocaleString("ar-EG")} سجل فقط. استخدم النسخ الاحتياطي لنقل كل البيانات.`,
        );
      } else {
        toast.success(
          `تم تصدير ${result.rows.length.toLocaleString("ar-EG")} سجل من ${result.label}`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تصدير البيانات",
      );
    } finally {
      setPending(null);
    }
  };

  if (!permissions.includes("export_data")) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          لا تملك صلاحية تصدير البيانات.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-800">
            <Download className="h-6 w-6 text-indigo-600" />
            تصدير البيانات
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            تنزيل CSV آمن للبيانات التشغيلية التي يملك حسابك صلاحية عرضها.
          </p>
        </div>
        <div className="flex max-w-xl gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            يطبق الخادم صلاحية التصدير وعزل الفروع قبل تجهيز الملف، ولا
            يتضمن التصدير كلمات مرور أو جلسات أو Tokens أو مفاتيح طلبات داخلية.
          </p>
        </div>
      </header>

      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          ملفات CSV ليست نسخة احتياطية ولا تصلح للاستعادة. الحد الأقصى لكل
          ملف هو ٥٬٠٠٠ سجل، ويعرض النظام تنبيهًا واضحًا إذا تم الوصول إليه.
        </p>
      </div>

      {lastExport && (
        <div
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"
          role="status"
        >
          آخر تصدير: <strong>{lastExport.label}</strong> —{" "}
          {lastExport.rows.toLocaleString("ar-EG")} سجل
          {lastExport.truncated &&
            ` (تم تطبيق الحد الأقصى ${lastExport.rowLimit.toLocaleString("ar-EG")})`}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-700">
          اختر مجموعة البيانات
        </h2>
        {availableDatasets.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            لا توجد مجموعة بيانات متاحة وفق صلاحيات الحساب الحالية.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {availableDatasets.map((dataset) => {
              const Icon = dataset.icon;
              const isPending = pending === dataset.id;
              return (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => void handleExport(dataset)}
                  disabled={pending !== null}
                  aria-label={`تصدير ${dataset.label}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white">
                    {isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </span>
                  <span className="block font-bold text-slate-800">
                    {dataset.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {dataset.description}
                  </span>
                  <span className="mt-4 flex items-center gap-1 text-xs font-bold text-indigo-600">
                    <Download className="h-3.5 w-3.5" />
                    {isPending ? "جاري تجهيز الملف..." : "تنزيل CSV"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
