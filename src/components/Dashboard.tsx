import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Page } from "./ERPApp";
import {
  BarChart3,
  Boxes,
  Landmark,
  Target,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { useCurrency } from "../lib/utils";
import type { Permission } from "../../convex/lib/permissions";
import type { ReportingOverview } from "../../shared/reportingView";

interface DashboardProps {
  onNavigate: (page: Page) => void;
  onRequestCreate: (page: "new-invoice" | "shipments" | "products" | "customers") => void;
  permissions: Permission[];
  modules: Record<string, boolean | undefined>;
  branchId?: Id<"branches">;
}

type ShortcutTile = {
  page: Page;
  title: string;
  description: string;
  icon: React.ElementType;
  tone: "navy" | "blue" | "deep" | "teal";
  visible: boolean;
};

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function Sparkline() {
  return (
    <div className="erp-dashboard-spark" aria-hidden="true">
      <svg viewBox="0 0 76 42" fill="none">
        <path
          d="M2 31 C10 28 11 18 18 20 C26 22 27 28 34 25 C42 22 43 10 51 13 C59 16 60 21 67 16 L74 8"
          stroke="#dfbd68"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <circle cx="74" cy="8" r="2.6" fill="#e8c268" />
      </svg>
    </div>
  );
}

export function Dashboard({ onNavigate, permissions, modules }: DashboardProps) {
  const can = (permission: Permission) => permissions.includes(permission);
  const enabled = (moduleName: string) => modules[moduleName] !== false;

  const canViewRepairs = can("view_repairs") && enabled("repairs");
  const canViewProducts = can("view_products");
  const canViewLeads = can("view_leads") && enabled("crm");
  const canViewReports = can("view_reports");
  const canViewProfits = can("view_profits");
  const canViewSuppliers = can("view_suppliers") && enabled("suppliers");
  const canViewCustomers = can("view_customers");
  const canViewTreasury = can("view_finance");

  const now = new Date();
  const today = isoDate(now);
  const monthFrom = `${today.slice(0, 7)}-01`;

  const report = useQuery(
    api.reporting.overview,
    canViewReports ? { from: monthFrom, to: today } : "skip",
  ) as ReportingOverview | undefined;
  const repairStats = useQuery(api.repairs.getStats, canViewRepairs ? {} : "skip");
  const lowStockProducts = useQuery(api.products.list, canViewProducts ? { lowStock: true } : "skip");
  const crmStats = useQuery(api.leads.stats, canViewLeads ? {} : "skip");

  const { formatCurrency, formatAmount } = useCurrency();

  const shortcuts: ShortcutTile[] = [
    {
      page: "treasury",
      title: "الخزينة والبنوك",
      description: "الأرصدة والمعاملات والحركة النقدية",
      icon: Landmark,
      tone: "navy",
      visible: canViewTreasury,
    },
    {
      page: "customers",
      title: "العملاء",
      description: "دليل العملاء والأرصدة والمتابعة",
      icon: Users,
      tone: "blue",
      visible: canViewCustomers,
    },
    {
      page: "suppliers",
      title: "الموردون",
      description: "دليل الموردين والمستحقات والمدفوعات",
      icon: Truck,
      tone: "deep",
      visible: canViewSuppliers,
    },
    {
      page: "repairs",
      title: "الصيانة",
      description: "أوامر الصيانة وحالة الأجهزة والمتابعة",
      icon: Wrench,
      tone: "teal",
      visible: canViewRepairs,
    },
  ].filter((tile) => tile.visible);

  const profitability = canViewProfits ? report?.profitability : undefined;
  const profitValue = profitability
    ? profitability.netProfit === null
      ? "—"
      : formatCurrency(profitability.netProfit)
    : lowStockProducts
      ? `${formatAmount(lowStockProducts.length)} صنف`
      : "—";
  const profitLabel = profitability ? "صافي ربح الشهر" : "أصناف منخفضة المخزون";
  const profitNote = profitability
    ? profitability.netMargin === null
      ? "بيانات التكلفة تحتاج مراجعة"
      : `هامش ${formatAmount(profitability.netMargin)}٪`
    : "تحتاج متابعة المخزون";

  const followUpTiles = canViewLeads
    ? [
        { label: "تم التعاقد", value: crmStats?.won ?? 0, tone: "green" },
        { label: "جدد", value: crmStats?.new ?? 0, tone: "amber" },
        { label: "الإجمالي", value: crmStats?.total ?? 0, tone: "rose" },
      ]
    : [
        { label: "جاهزة للتسليم", value: repairStats?.ready ?? 0, tone: "green" },
        { label: "مستلمة", value: repairStats?.received ?? 0, tone: "amber" },
        { label: "قيد الإصلاح", value: repairStats?.inProgress ?? 0, tone: "rose" },
      ];

  return (
    <div className="erp-dashboard">
      <header className="erp-dashboard-heading">
        <div>
          <p className="erp-dashboard-kicker">الرئيسية</p>
          <h1 className="erp-page-title">لوحة التحكم</h1>
        </div>
      </header>

      {shortcuts.length > 0 && (
        <section className="erp-dashboard-shortcut-grid" aria-label="الأقسام الرئيسية">
          {shortcuts.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.page}
                type="button"
                onClick={() => onNavigate(tile.page)}
                className={`erp-dashboard-shortcut erp-dashboard-shortcut--${tile.tone}`}
                aria-label={`فتح قسم ${tile.title}`}
              >
                <span className="erp-dashboard-shortcut-icon"><Icon className="h-5 w-5" /></span>
                <span className="erp-dashboard-shortcut-copy">
                  <span className="erp-dashboard-shortcut-title block">{tile.title}</span>
                  <span className="erp-dashboard-shortcut-description block">{tile.description}</span>
                </span>
                <Sparkline />
              </button>
            );
          })}
        </section>
      )}

      {canViewReports && (
        <div className="erp-dashboard-report-row">
          <button
            type="button"
            onClick={() => onNavigate("reports")}
            className="erp-dashboard-report-card"
            aria-label="فتح قسم التقارير"
          >
            <span className="erp-dashboard-report-icon"><BarChart3 className="h-5 w-5" /></span>
            <span>
              <span className="erp-dashboard-report-title block">التقارير</span>
              <span className="erp-dashboard-report-description block">تقارير المبيعات والمخزون والحسابات</span>
            </span>
          </button>
        </div>
      )}

      <div className="erp-dashboard-secondary-grid">
        {(canViewProducts || canViewReports) && (
          <section className="erp-dashboard-panel">
            <div className="erp-dashboard-panel-header">
              <h2 className="erp-dashboard-panel-title">
                <Boxes className="h-4 w-4 text-amber-600" />
                متابعة المخزون
              </h2>
              {canViewProducts && (
                <button type="button" onClick={() => onNavigate("products")} className="erp-dashboard-panel-action">
                  إدارة المخزون
                </button>
              )}
            </div>
            <div className="erp-dashboard-mini-grid">
              <div className="erp-dashboard-mini-card">
                <div className="erp-dashboard-mini-head">
                  <div>
                    <p className="erp-dashboard-mini-label">قيد التحصيل لدى شركات الشحن</p>
                    <p className="erp-dashboard-mini-value">
                      {report ? formatCurrency(report.cod.currentOutstanding) : "—"}
                    </p>
                    <p className="erp-dashboard-mini-note">
                      {report ? `تمت تسوية ${formatCurrency(report.cod.settled)}` : "بانتظار بيانات التقرير"}
                    </p>
                  </div>
                  <span className="erp-dashboard-mini-icon erp-dashboard-mini-icon--mint"><Truck className="h-4 w-4" /></span>
                </div>
              </div>

              <div className="erp-dashboard-mini-card">
                <div className="erp-dashboard-mini-head">
                  <div>
                    <p className="erp-dashboard-mini-label">{profitLabel}</p>
                    <p className="erp-dashboard-mini-value">{profitValue}</p>
                    <p className="erp-dashboard-mini-note">{profitNote}</p>
                  </div>
                  <span className="erp-dashboard-mini-icon erp-dashboard-mini-icon--lilac"><BarChart3 className="h-4 w-4" /></span>
                </div>
              </div>
            </div>
          </section>
        )}

        {(canViewLeads || canViewRepairs) && (
          <section className="erp-dashboard-panel">
            <div className="erp-dashboard-panel-header">
              <h2 className="erp-dashboard-panel-title">
                <Target className="h-4 w-4 text-violet-500" />
                {canViewLeads ? "العملاء المحتملون" : "متابعة الصيانة"}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate(canViewLeads ? "crm" : "repairs")}
                className="erp-dashboard-panel-action"
              >
                فتح المتابعة
              </button>
            </div>
            <div className="erp-dashboard-lead-grid">
              {followUpTiles.map((tile) => (
                <div
                  key={tile.label}
                  className={`erp-dashboard-lead-tile erp-dashboard-lead-tile--${tile.tone}`}
                >
                  <p className="erp-dashboard-lead-value">{formatAmount(tile.value)}</p>
                  <p className="erp-dashboard-lead-label">{tile.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
