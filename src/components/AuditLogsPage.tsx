import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Shield, Search, Filter, Trash2, Plus, Edit2,
  Eye, AlertTriangle, RefreshCw, BarChart3
} from "lucide-react";

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  create: { label: "إنشاء",  color: "bg-emerald-100 text-emerald-700", icon: Plus },
  update: { label: "تعديل",  color: "bg-blue-100 text-blue-700",       icon: Edit2 },
  delete: { label: "حذف",    color: "bg-red-100 text-red-700",         icon: Trash2 },
  view:   { label: "عرض",    color: "bg-slate-100 text-slate-600",     icon: Eye },
};

const MODULE_LABELS: Record<string, string> = {
  invoices:   "الفواتير",
  orders:     "الأوردرات",
  deliveries: "التوصيلات",
  repairs:    "الصيانة",
  expenses:   "المصروفات",
  suppliers:  "الموردين",
  shipments:  "الشحنات",
  crm:        "CRM",
  branches:   "الفروع",
  employees:  "الموظفون",
  products:   "المنتجات",
  customers:  "العملاء",
  settings:   "الإعدادات",
};

export function AuditLogsPage() {
  const logs = useQuery(api.auditLogs.list, { limit: 200 }) ?? [];
  const stats = useQuery(api.auditLogs.getStats);

  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterModule, setFilterModule] = useState("all");

  const filtered = logs.filter(l => {
    const matchSearch =
      (l.recordLabel ?? "").includes(search) ||
      (l.userName ?? "").includes(search) ||
      (l.details ?? "").includes(search) ||
      (MODULE_LABELS[l.module] ?? l.module).includes(search);
    const matchAction = filterAction === "all" || l.action === filterAction;
    const matchModule = filterModule === "all" || l.module === filterModule;
    return matchSearch && matchAction && matchModule;
  });

  const uniqueModules = [...new Set(logs.map(l => l.module))];

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString("ar-EG", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            سجل العمليات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">تتبع جميع الإجراءات التي تمت على النظام</p>
        </div>
        <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
          سجل محفوظ وغير قابل للمسح
        </span>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "إجمالي العمليات", value: stats.total,                    color: "bg-slate-100 text-slate-700" },
            { label: "إنشاء",           value: stats.byAction["create"] ?? 0,  color: "bg-emerald-100 text-emerald-700" },
            { label: "تعديل",           value: stats.byAction["update"] ?? 0,  color: "bg-blue-100 text-blue-700" },
            { label: "حذف",             value: stats.byAction["delete"] ?? 0,  color: "bg-red-100 text-red-700" },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-4 text-center ${s.color}`}>
              <p className="text-2xl font-black">{s.value}</p>
              <p className="text-xs font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Module Activity */}
      {stats && Object.keys(stats.byModule).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-500" />
            نشاط الأقسام
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(stats.byModule)
              .sort(([, a], [, b]) => b - a)
              .map(([mod, count]) => {
                const maxCount = Math.max(...Object.values(stats.byModule));
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={mod} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-700">{MODULE_LABELS[mod] ?? mod}</span>
                      <span className="text-xs font-black text-indigo-600">{count}</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-9"
            placeholder="بحث في السجلات..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-input sm:w-40"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
        >
          <option value="all">كل العمليات</option>
          {Object.entries(ACTION_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="form-input sm:w-40"
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
        >
          <option value="all">كل الأقسام</option>
          {uniqueModules.map(m => (
            <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>
          ))}
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">لا توجد سجلات</p>
            <p className="text-slate-400 text-sm mt-1">ستظهر هنا العمليات التي تتم على النظام</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-b from-slate-50 to-slate-100 border-b border-slate-200">
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">الوقت</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">العملية</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">القسم</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">السجل</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">المستخدم</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(log => {
                  const actionCfg = ACTION_CONFIG[log.action] ?? ACTION_CONFIG.view;
                  const ActionIcon = actionCfg.icon;
                  return (
                    <tr key={log._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatTime(log._creationTime)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${actionCfg.color}`}>
                          <ActionIcon className="w-3 h-3" />
                          {actionCfg.label}
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
                        {log.userName ?? "النظام"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-48 truncate">
                        {log.details ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          عرض {filtered.length} من {logs.length} سجل
        </p>
      )}
    </div>
  );
}
