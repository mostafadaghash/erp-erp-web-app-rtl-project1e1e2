import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import { DollarSign, Plus, Search } from "lucide-react";

const expenseCategories = ["إيجار", "رواتب", "مرافق", "تسويق", "صيانة", "مشتريات", "نقل", "أخرى"];

export function ExpensesPage() {
  const canCreate = usePermission("create_expenses");
  const expenses = useQuery(api.expenses.list) ?? [];
  const expenseStats = useQuery(api.expenses.getStats);
  const createExpense = useMutation(api.expenses.create);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", category: "إيجار", amount: "",
    date: new Date().toISOString().split("T")[0],
    paymentMethod: "cash", notes: "",
  });

  const filtered = expenses.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase())
  ).filter(e => !filterCategory || e.category === filterCategory);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await createExpense({
        title: form.title,
        category: form.category,
        amount: Number(form.amount),
        date: form.date,
        paymentMethod: form.paymentMethod,
        notes: form.notes || undefined,
      });
      toast.success("تم إضافة المصروف بنجاح");
      setShowForm(false);
      setForm({ title: "", category: "إيجار", amount: "", date: new Date().toISOString().split("T")[0], paymentMethod: "cash", notes: "" });
    } catch (err) {
      toast.error("حدث خطأ");
    }
  };

  // Group by category
  const byCategory = expenseCategories.map(cat => ({
    name: cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
    count: expenses.filter(e => e.category === cat).length,
  })).filter(c => c.count > 0);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-indigo-600" />
            المصروفات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{expenses.length} مصروف</p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          مصروف جديد
        </button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-red-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-red-600">{(expenseStats?.total ?? 0).toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-600 mt-0.5">إجمالي المصروفات (ريال)</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-amber-600">{(expenseStats?.today ?? 0).toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-600 mt-0.5">مصروفات اليوم (ريال)</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 text-center">
          <p className="text-xl font-black text-slate-600">{expenseStats?.count ?? 0}</p>
          <p className="text-xs text-slate-600 mt-0.5">عدد العمليات</p>
        </div>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-4">توزيع المصروفات</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {byCategory.map(cat => (
              <div key={cat.name} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="font-bold text-slate-800">{cat.total.toLocaleString("ar-SA")}</p>
                <p className="text-xs text-slate-500 mt-0.5">{cat.name}</p>
                <p className="text-xs text-slate-400">{cat.count} عملية</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="form-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-input sm:w-40" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">كل الفئات</option>
          {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>العنوان</th>
                <th>الفئة</th>
                <th>المبلغ</th>
                <th>التاريخ</th>
                <th>طريقة الدفع</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e._id}>
                  <td className="font-medium text-slate-800">{e.title}</td>
                  <td><span className="badge badge-info">{e.category}</span></td>
                  <td className="font-bold text-red-600">{e.amount.toLocaleString("ar-SA")} ريال</td>
                  <td className="text-slate-500 text-xs">{e.date}</td>
                  <td className="text-slate-600 text-xs">
                    {e.paymentMethod === "cash" ? "نقدي" :
                     e.paymentMethod === "card" ? "بطاقة" : "تحويل"}
                  </td>
                  <td className="text-slate-500 text-xs">{e.notes ?? "-"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    لا توجد مصروفات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">إضافة مصروف</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="form-label">العنوان *</label>
                <input className="form-input" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="مثال: إيجار المحل" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">الفئة</label>
                  <select className="form-input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">المبلغ (ريال) *</label>
                  <input className="form-input" type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">التاريخ</label>
                  <input className="form-input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">طريقة الدفع</label>
                  <select className="form-input" value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod: e.target.value})}>
                    <option value="cash">نقدي</option>
                    <option value="card">بطاقة</option>
                    <option value="transfer">تحويل</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">ملاحظات</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">حفظ</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
