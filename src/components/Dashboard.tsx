import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Page } from "./ERPApp";
import {
  TrendingUp, ShoppingCart, Users, Package,
  Wrench, AlertTriangle, ArrowUpRight, DollarSign,
  Clock, CheckCircle, UserPlus, Target, PhoneCall, Star
} from "lucide-react";
import { useCurrency } from "../lib/utils";

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const invoiceStats = useQuery(api.invoices.getStats);
  const repairStats = useQuery(api.repairs.getStats);
  const expenseStats = useQuery(api.expenses.getStats);
  const lowStockProducts = useQuery(api.products.getLowStock);
  const recentInvoices = useQuery(api.invoices.list);
  const recentRepairs = useQuery(api.repairs.list);
  const crmStats = useQuery(api.leads.stats);

  const { formatCurrency, currency } = useCurrency();

  const statCards = [
    {
      title: "مبيعات اليوم",
      value: formatCurrency(invoiceStats?.todaySales ?? 0),
      sub: `${invoiceStats?.todayInvoices ?? 0} فاتورة`,
      icon: TrendingUp,
      color: "from-indigo-500 to-indigo-600",
      bg: "bg-indigo-50",
      text: "text-indigo-600",
    },
    {
      title: "إجمالي المبيعات",
      value: formatCurrency(invoiceStats?.totalSales ?? 0),
      sub: `${invoiceStats?.totalInvoices ?? 0} فاتورة`,
      icon: ShoppingCart,
      color: "from-emerald-500 to-emerald-600",
      bg: "bg-emerald-50",
      text: "text-emerald-600",
    },
    {
      title: "مستحقات العملاء",
      value: formatCurrency(invoiceStats?.pendingPayments ?? 0),
      sub: "مبالغ معلقة",
      icon: DollarSign,
      color: "from-amber-500 to-amber-600",
      bg: "bg-amber-50",
      text: "text-amber-600",
    },
    {
      title: "مصروفات الشهر",
      value: formatCurrency(expenseStats?.total ?? 0),
      sub: `${expenseStats?.count ?? 0} عملية`,
      icon: ArrowUpRight,
      color: "from-red-500 to-red-600",
      bg: "bg-red-50",
      text: "text-red-600",
    },
  ];

  const repairStatusCards = [
    { label: "مستلمة", value: repairStats?.received ?? 0, color: "text-blue-600", bg: "bg-blue-50", icon: Clock },
    { label: "قيد الإصلاح", value: repairStats?.inProgress ?? 0, color: "text-amber-600", bg: "bg-amber-50", icon: Wrench },
    { label: "جاهزة", value: repairStats?.ready ?? 0, color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle },
    { label: "مسلمة", value: repairStats?.delivered ?? 0, color: "text-slate-600", bg: "bg-slate-50", icon: CheckCircle },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">لوحة التحكم</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button
          onClick={() => onNavigate("new-invoice")}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">فاتورة جديدة</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className="stat-card"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${card.text}`} />
                </div>
                <span className={`text-xs font-medium ${card.text} ${card.bg} px-2 py-0.5 rounded-full`}>
                  اليوم
                </span>
              </div>
              <p className="text-xl font-black text-slate-800 leading-tight">{card.value}</p>
              <p className="text-xs text-slate-500 mt-1">{card.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* CRM Quick Stats */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-500" />
            إحصائيات CRM - العملاء المحتملون
          </h2>
          <button
            onClick={() => onNavigate("crm")}
            className="text-purple-600 text-sm font-medium hover:text-purple-700 transition-colors"
          >
            إدارة CRM
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "إجمالي", value: crmStats?.total ?? 0, color: "text-slate-700", bg: "bg-slate-50", icon: UserPlus },
            { label: "جديد", value: crmStats?.new ?? 0, color: "text-blue-600", bg: "bg-blue-50", icon: UserPlus },
            { label: "تم التواصل", value: crmStats?.contacted ?? 0, color: "text-indigo-600", bg: "bg-indigo-50", icon: PhoneCall },
            { label: "مهتم", value: crmStats?.interested ?? 0, color: "text-amber-600", bg: "bg-amber-50", icon: Star },
            { label: "تفاوض", value: crmStats?.negotiating ?? 0, color: "text-orange-600", bg: "bg-orange-50", icon: Target },
            { label: "مكتسب ✓", value: crmStats?.won ?? 0, color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle },
            { label: "خسارة", value: crmStats?.lost ?? 0, color: "text-red-600", bg: "bg-red-50", icon: AlertTriangle },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className={`${s.bg} rounded-xl p-3 text-center`}>
                <Icon className={`w-4 h-4 ${s.color} mx-auto mb-1`} />
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            );
          })}
        </div>
        {(crmStats?.total ?? 0) > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-sm text-slate-500">معدل التحويل</span>
            <div className="flex items-center gap-3">
              <div className="w-32 bg-slate-100 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${crmStats?.conversionRate ?? 0}%` }}
                />
              </div>
              <span className="text-sm font-bold text-emerald-600">{crmStats?.conversionRate ?? 0}%</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <FileTextIcon />
              آخر الفواتير
            </h2>
            <button
              onClick={() => onNavigate("invoices")}
              className="text-indigo-600 text-sm font-medium hover:text-indigo-700 transition-colors"
            >
              عرض الكل
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>العميل</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {(recentInvoices ?? []).slice(0, 5).map((inv) => (
                  <tr key={inv._id}>
                    <td className="font-mono text-xs text-indigo-600">{inv.invoiceNumber}</td>
                    <td className="font-medium">{inv.customerName}</td>
                    <td className="font-bold">{formatCurrency(inv.total)}</td>
                    <td>
                      <span className={`badge ${inv.status === "paid" ? "badge-success" : inv.status === "partial" ? "badge-warning" : "badge-danger"}`}>
                        {inv.status === "paid" ? "مدفوعة" : inv.status === "partial" ? "جزئي" : "معلقة"}
                      </span>
                    </td>
                  </tr>
                ))}
                {(recentInvoices ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400">لا توجد فواتير بعد</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Repair Status */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-500" />
                حالة الصيانة
              </h2>
              <button
                onClick={() => onNavigate("repairs")}
                className="text-indigo-600 text-sm font-medium hover:text-indigo-700"
              >
                عرض الكل
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {repairStatusCards.map((card, i) => {
                const Icon = card.icon;
                return (
                  <div key={i} className={`${card.bg} rounded-xl p-3 text-center`}>
                    <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{card.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Low Stock Alert */}
          {(lowStockProducts ?? []).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h2 className="font-bold text-amber-800 text-sm">تنبيه المخزون</h2>
              </div>
              <div className="space-y-2">
                {(lowStockProducts ?? []).slice(0, 4).map((p) => (
                  <div key={p._id} className="flex items-center justify-between">
                    <span className="text-xs text-amber-800 font-medium truncate">{p.name}</span>
                    <span className="badge badge-warning text-xs">{p.stock} متبقي</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => onNavigate("products")}
                className="mt-3 text-xs text-amber-700 font-medium hover:text-amber-800"
              >
                إدارة المخزون ←
              </button>
            </div>
          )}

          {/* Recent Repairs */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-slate-500" />
              آخر طلبات الصيانة
            </h2>
            <div className="space-y-2">
              {(recentRepairs ?? []).slice(0, 3).map((r) => (
                <div key={r._id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-slate-800">{r.customerName}</p>
                    <p className="text-xs text-slate-500">{r.deviceBrand} {r.deviceModel}</p>
                  </div>
                  <span className={`badge ${
                    r.status === "ready" ? "badge-success" :
                    r.status === "in_progress" ? "badge-warning" :
                    r.status === "delivered" ? "badge-info" : "badge-purple"
                  }`}>
                    {r.status === "received" ? "مستلم" :
                     r.status === "in_progress" ? "قيد الإصلاح" :
                     r.status === "ready" ? "جاهز" : "مسلم"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileTextIcon() {
  return (
    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
