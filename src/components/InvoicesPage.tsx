import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import type { Page } from "./ERPApp";
import { FileText, Plus, Search, Printer } from "lucide-react";
import { PrintModal } from "./PrintTemplate";
import { useCurrency } from "../lib/utils";

interface InvoicesPageProps {
  onNavigate: (page: Page) => void;
}

export function InvoicesPage({ onNavigate }: InvoicesPageProps) {
  const canCreate = usePermission("create_invoices");
  const invoices = useQuery(api.invoices.list, {}) ?? [];
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [printInvoice, setPrintInvoice] = useState<any>(null);

  const filtered = invoices.filter(inv =>
    inv.invoiceNumber.includes(search) ||
    inv.customerName.toLowerCase().includes(search.toLowerCase())
  ).filter(inv => !filterStatus || inv.status === filterStatus);

  const totalRevenue = filtered.reduce((s, i) => s + i.total, 0);
  const totalPaid = filtered.reduce((s, i) => s + i.paid, 0);
  const totalPending = filtered.reduce((s, i) => s + i.remaining, 0);

  const { currency, formatCurrency, formatAmount } = useCurrency();

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            المبيعات والفواتير
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{invoices.length} فاتورة</p>
        </div>
        {canCreate && <button onClick={() => onNavigate("new-invoice")} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          فاتورة جديدة
        </button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-indigo-600">{totalRevenue.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-slate-600 mt-0.5">إجمالي المبيعات (ج.م)</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-emerald-600">{totalPaid.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-slate-600 mt-0.5">المحصل (ج.م)</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-amber-600">{totalPending.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-slate-600 mt-0.5">المتبقي (ج.م)</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-10"
            placeholder="بحث برقم الفاتورة أو اسم العميل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="form-input sm:w-40" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="paid">مدفوعة</option>
          <option value="partial">جزئي</option>
          <option value="unpaid">معلقة</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>العميل</th>
                <th>التاريخ</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>طريقة الدفع</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv._id}>
                  <td className="font-mono text-xs text-indigo-600 font-bold">{inv.invoiceNumber}</td>
                  <td>
                    <p className="font-medium text-slate-800">{inv.customerName}</p>
                    {inv.customerPhone && <p className="text-xs text-slate-400">{inv.customerPhone}</p>}
                  </td>
                  <td className="text-slate-500 text-xs">
                    {new Date(inv._creationTime).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="font-bold">{inv.total.toLocaleString("ar-EG")} ج.م</td>
                  <td className="text-emerald-600 font-medium">{inv.paid.toLocaleString("ar-EG")} ج.م</td>
                  <td className={`font-medium ${inv.remaining > 0 ? "text-amber-600" : "text-slate-400"}`}>
                    {inv.remaining.toLocaleString("ar-EG")} ج.م
                  </td>
                  <td>
                    <span className="text-xs text-slate-600">
                      {inv.paymentMethod === "cash" ? "نقدي" :
                       inv.paymentMethod === "card" ? "بطاقة" :
                       inv.paymentMethod === "transfer" ? "تحويل" : inv.paymentMethod}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${
                      inv.status === "paid" ? "badge-success" :
                      inv.status === "partial" ? "badge-warning" : "badge-danger"
                    }`}>
                      {inv.status === "paid" ? "مدفوعة" :
                       inv.status === "partial" ? "جزئي" : "معلقة"}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setPrintInvoice(inv)}
                      className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors text-slate-500 hover:text-indigo-600"
                      title="طباعة الفاتورة"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    لا توجد فواتير
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Modal */}
      {printInvoice && (
        <PrintModal
          type="invoice"
          data={printInvoice}
          onClose={() => setPrintInvoice(null)}
        />
      )}
    </div>
  );
}
