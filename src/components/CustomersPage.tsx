import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import { Users, Plus, Search, Phone, Mail, MapPin } from "lucide-react";

export function CustomersPage() {
  const canCreate = usePermission("create_customers");
  const customers = useQuery(api.customers.list) ?? [];
  const createCustomer = useMutation(api.customers.create);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCustomer({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      });
      toast.success("تم إضافة العميل بنجاح");
      setShowForm(false);
      setForm({ name: "", phone: "", email: "", address: "", notes: "" });
    } catch (err) {
      toast.error("حدث خطأ أثناء إضافة العميل");
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            العملاء
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{customers.length} عميل</p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          عميل جديد
        </button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-indigo-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-indigo-600">{customers.length}</p>
          <p className="text-xs text-slate-600 mt-0.5">إجمالي العملاء</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-amber-600">
            {customers.filter(c => c.balance > 0).length}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">عملاء بمديونية</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center">
          <p className="text-lg font-black text-emerald-600">
            {customers.reduce((s, c) => s + c.balance, 0).toLocaleString("ar-EG")} ج.م
          </p>
          <p className="text-xs text-slate-600 mt-0.5">إجمالي المديونيات</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="form-input pr-10"
          placeholder="بحث بالاسم أو رقم الهاتف..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <div key={c._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">{c.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-bold text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {c.phone}
                  </p>
                </div>
              </div>
              {c.balance > 0 && (
                <span className="badge badge-warning">{c.balance.toLocaleString("ar-EG")} ج.م</span>
              )}
            </div>
            {c.email && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                <Mail className="w-3 h-3" />
                {c.email}
              </p>
            )}
            {c.address && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                <MapPin className="w-3 h-3" />
                {c.address}
              </p>
            )}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">إجمالي المشتريات</p>
                <p className="font-bold text-slate-800 text-sm">{c.totalPurchases.toLocaleString("ar-EG")} ج.م</p>
              </div>
              {c.balance > 0 && (
                <div className="text-left">
                  <p className="text-xs text-slate-500">المديونية</p>
                  <p className="font-bold text-amber-600 text-sm">{c.balance.toLocaleString("ar-EG")} ج.م</p>
                </div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد عملاء
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">إضافة عميل جديد</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="form-label">الاسم *</label>
                <input className="form-input" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="اسم العميل" />
              </div>
              <div>
                <label className="form-label">رقم الهاتف *</label>
                <input className="form-input" required value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="01xxxxxxxxx" />
              </div>
              <div>
                <label className="form-label">البريد الإلكتروني</label>
                <input className="form-input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="example@email.com" />
              </div>
              <div>
                <label className="form-label">العنوان</label>
                <input className="form-input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="المدينة، الحي" />
              </div>
              <div>
                <label className="form-label">ملاحظات</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="ملاحظات إضافية..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">حفظ العميل</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
