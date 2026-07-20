import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Package, Users, Wrench, Target, Calendar, Filter } from "lucide-react";

type Period = "all" | "today" | "week" | "month" | "year";

function filterByPeriod<T extends { _creationTime: number }>(items: T[], period: Period): T[] {
  if (period === "all") return items;
  const now = new Date();
  const start = new Date();
  if (period === "today") { start.setHours(0, 0, 0, 0); }
  else if (period === "week") { start.setDate(now.getDate() - 7); }
  else if (period === "month") { start.setMonth(now.getMonth() - 1); }
  else if (period === "year") { start.setFullYear(now.getFullYear() - 1); }
  return items.filter(i => i._creationTime >= start.getTime());
}

export function ReportsPage() {
  const [period, setPeriod] = useState<Period>("month");

  const allInvoices = useQuery(api.invoices.list) ?? [];
  const allExpenses = useQuery(api.expenses.list) ?? [];
  const products = useQuery(api.products.list, {}) ?? [];
  const customers = useQuery(api.customers.list) ?? [];
  const allRepairs = useQuery(api.repairs.list) ?? [];
  const crmStats = useQuery(api.leads.stats);

  const invoices = filterByPeriod(allInvoices, period);
  const expenses = filterByPeriod(allExpenses, period);
  const repairs = filterByPeriod(allRepairs, period);

  const totalRevenue = invoices.reduce((s, i) => s + i.total, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const totalPending = invoices.reduce((s, i) => s + i.remaining, 0);

  // Monthly breakdown (last 6 months)
  const months: Record<string, { revenue: number; expenses: number }> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("ar-SA", { month: "short", year: "2-digit" });
    months[key] = { revenue: 0, expenses: 0 };
  }

  invoices.forEach(inv => {
    const d = new Date(inv._creationTime);
    const key = d.toLocaleDateString("ar-SA", { month: "short", year: "2-digit" });
    if (months[key]) months[key].revenue += inv.total;
  });

  expenses.forEach(exp => {
    const d = new Date(exp._creationTime);
    const key = d.toLocaleDateString("ar-SA", { month: "short", year: "2-digit" });
    if (months[key]) months[key].expenses += exp.amount;
  });

  const maxVal = Math.max(...Object.values(months).map(m => Math.max(m.revenue, m.expenses)), 1);

  // Top products by sales
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  invoices.forEach(inv => {
    inv.items.forEach((item: any) => {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
      }
      productSales[item.productId].qty += item.quantity;
      productSales[item.productId].revenue += item.total;
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Expense by category
  const expByCategory: Record<string, number> = {};
  expenses.forEach(e => {
    expByCategory[e.category] = (expByCategory[e.category] ?? 0) + e.amount;
  });

  const periodLabels: Record<Period, string> = {
    all: "كل الوقت",
    today: "اليوم",
    week: "آخر 7 أيام",
    month: "آخر 30 يوم",
    year: "آخر سنة",
  };

  const conversionRate = crmStats
    ? crmStats.total > 0 ? Math.round((crmStats.won / crmStats.total) * 100) : 0
    : 0;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            التقارير والإحصائيات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">نظرة شاملة على أداء المحل</p>
        </div>
        {/* Period Filter */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          <Filter className="w-4 h-4 text-slate-400 mr-1" />
          {(["today", "week", "month", "year", "all"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === p
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الإيرادات", value: totalRevenue, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", suffix: " ريال" },
          { label: "إجمالي المصروفات", value: totalExpenses, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50", suffix: " ريال" },
          { label: "صافي الربح", value: netProfit, icon: DollarSign, color: netProfit >= 0 ? "text-indigo-600" : "text-red-600", bg: netProfit >= 0 ? "bg-indigo-50" : "bg-red-50", suffix: " ريال" },
          { label: "مستحقات العملاء", value: totalPending, icon: Users, color: "text-amber-600", bg: "bg-amber-50", suffix: " ريال" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="stat-card">
              <div className={`w-10 h-10 ${kpi.bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <p className={`text-xl font-black ${kpi.color}`}>
                {kpi.value.toLocaleString("ar-SA")}{kpi.suffix}
              </p>
              <p className="text-xs text-slate-500 mt-1">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الفواتير", value: invoices.length, icon: "📄" },
          { label: "إجمالي العملاء", value: customers.length, icon: "👥" },
          { label: "إجمالي المنتجات", value: products.length, icon: "📦" },
          { label: "طلبات الصيانة", value: repairs.length, icon: "🔧" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
            <p className="text-2xl font-black text-slate-800">{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Chart */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-5">الإيرادات والمصروفات الشهرية</h2>
          <div className="flex items-end gap-3 h-40">
            {Object.entries(months).map(([month, data]) => (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex gap-0.5 items-end" style={{ height: "120px" }}>
                  <div
                    className="flex-1 bg-indigo-500 rounded-t-sm transition-all"
                    style={{ height: `${(data.revenue / maxVal) * 100}%`, minHeight: data.revenue > 0 ? "4px" : "0" }}
                    title={`إيرادات: ${data.revenue.toLocaleString("ar-SA")} ريال`}
                  />
                  <div
                    className="flex-1 bg-red-400 rounded-t-sm transition-all"
                    style={{ height: `${(data.expenses / maxVal) * 100}%`, minHeight: data.expenses > 0 ? "4px" : "0" }}
                    title={`مصروفات: ${data.expenses.toLocaleString("ar-SA")} ريال`}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center">{month}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-indigo-500 rounded-sm" />
              <span className="text-xs text-slate-500">إيرادات</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-red-400 rounded-sm" />
              <span className="text-xs text-slate-500">مصروفات</span>
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-4">أكثر المنتجات مبيعاً</h2>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full"
                        style={{ width: `${(p.revenue / (topProducts[0]?.revenue || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <p className="text-sm font-bold text-slate-800">{p.revenue.toLocaleString("ar-SA")} ريال</p>
                    <p className="text-xs text-slate-400">{p.qty} قطعة</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-400 py-8">لا توجد بيانات مبيعات بعد</p>
          )}
        </div>

        {/* Expense breakdown */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-4">توزيع المصروفات</h2>
          {Object.keys(expByCategory).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-20 flex-shrink-0">{cat}</span>
                  <div className="flex-1">
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-red-400 h-2 rounded-full"
                        style={{ width: `${(amount / totalExpenses) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-28 text-left flex-shrink-0">
                    {amount.toLocaleString("ar-SA")} ريال
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-400 py-8">لا توجد مصروفات بعد</p>
          )}
        </div>

        {/* Repair stats */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-4">إحصائيات الصيانة</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "إجمالي الطلبات", value: repairs.length, color: "text-slate-700", bg: "bg-slate-50" },
              { label: "قيد الإصلاح", value: repairs.filter(r => r.status === "in_progress").length, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "جاهزة للاستلام", value: repairs.filter(r => r.status === "ready").length, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "تم التسليم", value: repairs.filter(r => r.status === "delivered").length, color: "text-indigo-600", bg: "bg-indigo-50" },
            ].map((s, i) => (
              <div key={i} className={`${s.bg} rounded-xl p-4 text-center`}>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-600 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي إيرادات الصيانة</span>
              <span className="font-bold text-slate-800">
                {repairs.reduce((s, r) => s + r.totalCost, 0).toLocaleString("ar-SA")} ريال
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CRM Report Section */}
      {crmStats && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-600" />
            تقرير إدارة العملاء المحتملين (CRM)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            {[
              { label: "إجمالي العملاء", value: crmStats.total, color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" },
              { label: "جديد", value: crmStats.new, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
              { label: "تم التواصل", value: crmStats.contacted, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100" },
              { label: "مهتم", value: crmStats.interested, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
              { label: "تفاوض", value: crmStats.negotiating, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
              { label: "تم البيع ✓", value: crmStats.won, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
              { label: "خسارة ✗", value: crmStats.lost, color: "text-red-600", bg: "bg-red-50", border: "border-red-100" },
            ].map((s, i) => (
              <div key={i} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Conversion funnel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-slate-700">معدل التحويل إلى مبيعات</span>
                <span className="text-lg font-black text-emerald-600">{conversionRate}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${conversionRate}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {crmStats.won} من أصل {crmStats.total} عميل محتمل تحوّل إلى مبيعات
              </p>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-slate-700">نسبة الخسارة</span>
                <span className="text-lg font-black text-red-500">
                  {crmStats.total > 0 ? Math.round((crmStats.lost / crmStats.total) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-red-400 to-red-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${crmStats.total > 0 ? (crmStats.lost / crmStats.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {crmStats.lost} عميل محتمل لم يتحوّل إلى مبيعات
              </p>
            </div>
          </div>

          {/* Pipeline stages visual */}
          {crmStats.total > 0 && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 mb-3">مسار المبيعات</p>
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {[
                  { label: "جديد", value: crmStats.new, color: "bg-blue-500" },
                  { label: "تواصل", value: crmStats.contacted, color: "bg-indigo-500" },
                  { label: "مهتم", value: crmStats.interested, color: "bg-amber-500" },
                  { label: "تفاوض", value: crmStats.negotiating, color: "bg-orange-500" },
                  { label: "مبيعات", value: crmStats.won, color: "bg-emerald-500" },
                ].map((stage, i, arr) => (
                  <div key={i} className="flex items-center gap-1 flex-shrink-0">
                    <div className={`${stage.color} text-white rounded-lg px-3 py-2 text-center min-w-[70px]`}>
                      <p className="text-lg font-black">{stage.value}</p>
                      <p className="text-xs opacity-90">{stage.label}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <span className="text-slate-300 text-lg">›</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
