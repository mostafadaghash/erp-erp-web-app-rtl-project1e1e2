import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import { Package, Plus, Search, AlertTriangle, Edit2, ToggleLeft } from "lucide-react";

export function ProductsPage() {
  const canCreate = usePermission("create_products");
  const products = useQuery(api.products.list, {}) ?? [];
  const categories = useQuery(api.categories.list) ?? [];
  const suppliers = useQuery(api.suppliers.list) ?? [];
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const createCategory = useMutation(api.categories.create);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [form, setForm] = useState({
    name: "", sku: "", costPrice: "", sellPrice: "",
    stock: "", minStock: "", unit: "قطعة",
    categoryId: "", supplierId: "", warrantyMonths: "",
    description: "",
  });

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  ).filter(p => !filterCategory || p.categoryId === filterCategory);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createProduct({
        name: form.name,
        sku: form.sku,
        cost: Number(form.costPrice),
        price: Number(form.sellPrice),
        stock: Number(form.stock),
        minStock: Number(form.minStock),
        unit: form.unit,
        category: form.categoryId || undefined,
        description: form.description || undefined,
      });
      toast.success("تم إضافة المنتج بنجاح");
      setShowForm(false);
      setForm({ name: "", sku: "", costPrice: "", sellPrice: "", stock: "", minStock: "", unit: "قطعة", categoryId: "", supplierId: "", warrantyMonths: "", description: "" });
    } catch (err) {
      toast.error("حدث خطأ أثناء إضافة المنتج");
    }
  };

  const getCategoryName = (id?: string) => {
    if (!id) return "-";
    return categories.find(c => c._id === id)?.name ?? "-";
  };

  const profit = (p: { sellPrice: number; costPrice: number }) => p.sellPrice - p.costPrice;
  const profitPct = (p: { sellPrice: number; costPrice: number }) => p.costPrice > 0 ? ((profit(p) / p.costPrice) * 100).toFixed(1) : "0";

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600" />
            المنتجات والمخزون
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{products.length} منتج</p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          منتج جديد
        </button>}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-10"
            placeholder="بحث بالاسم أو الكود..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-input sm:w-48"
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
        >
          <option value="">كل الفئات</option>
          {categories.map(c => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المنتجات", value: products.length, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "نفاد المخزون", value: products.filter(p => p.stock === 0).length, color: "text-red-600", bg: "bg-red-50" },
          { label: "مخزون منخفض", value: products.filter(p => p.stock > 0 && p.stock <= p.minStock).length, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "متوفر", value: products.filter(p => p.stock > p.minStock).length, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((s, i) => (
          <div key={i} className={`${s.bg} rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الفئة</th>
                <th>سعر التكلفة</th>
                <th>سعر البيع</th>
                <th>الربح</th>
                <th>المخزون</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p._id}>
                  <td>
                    <div>
                      <p className="font-semibold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                    </div>
                  </td>
                  <td className="text-slate-600">{getCategoryName(p.categoryId)}</td>
                  <td className="font-medium">{p.costPrice.toLocaleString("ar-EG")} ج.م</td>
                  <td className="font-bold text-indigo-600">{p.sellPrice.toLocaleString("ar-EG")} ج.م</td>
                  <td>
                    <span className="text-emerald-600 font-medium">
                      {profit(p).toLocaleString("ar-EG")} ج.م
                    </span>
                    <span className="text-xs text-slate-400 mr-1">({profitPct(p)}%)</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {p.stock <= p.minStock && p.stock > 0 && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span className={`font-bold ${p.stock === 0 ? "text-red-600" : p.stock <= p.minStock ? "text-amber-600" : "text-emerald-600"}`}>
                        {p.stock}
                      </span>
                      <span className="text-xs text-slate-400">{p.unit}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${p.isActive ? "badge-success" : "badge-danger"}`}>
                      {p.isActive ? "نشط" : "معطل"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    لا توجد منتجات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">إضافة منتج جديد</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">اسم المنتج *</label>
                  <input className="form-input" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="مثال: iPhone 15 Pro" />
                </div>
                <div>
                  <label className="form-label">كود المنتج (SKU) *</label>
                  <input className="form-input" required value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="مثال: IPHONE-15-PRO" />
                </div>
                <div>
                  <label className="form-label">سعر التكلفة *</label>
                  <input className="form-input" type="number" required value={form.costPrice} onChange={e => setForm({...form, costPrice: e.target.value})} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">سعر البيع *</label>
                  <input className="form-input" type="number" required value={form.sellPrice} onChange={e => setForm({...form, sellPrice: e.target.value})} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">الكمية في المخزون *</label>
                  <input className="form-input" type="number" required value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">الحد الأدنى للمخزون</label>
                  <input className="form-input" type="number" value={form.minStock} onChange={e => setForm({...form, minStock: e.target.value})} placeholder="2" />
                </div>
                <div>
                  <label className="form-label">الفئة</label>
                  <select className="form-input" value={form.categoryId} onChange={e => setForm({...form, categoryId: e.target.value})}>
                    <option value="">اختر الفئة</option>
                    {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">المورد</label>
                  <select className="form-input" value={form.supplierId} onChange={e => setForm({...form, supplierId: e.target.value})}>
                    <option value="">اختر المورد</option>
                    {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">الوحدة</label>
                  <select className="form-input" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}>
                    <option value="قطعة">قطعة</option>
                    <option value="جهاز">جهاز</option>
                    <option value="علبة">علبة</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">مدة الضمان (شهر)</label>
                  <input className="form-input" type="number" value={form.warrantyMonths} onChange={e => setForm({...form, warrantyMonths: e.target.value})} placeholder="12" />
                </div>
              </div>
              <div>
                <label className="form-label">الوصف</label>
                <textarea className="form-input" rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="وصف المنتج..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">حفظ المنتج</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
