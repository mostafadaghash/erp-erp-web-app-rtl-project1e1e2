import { useCurrency } from "../lib/utils";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Edit2, History, Package, Plus, Search, SlidersHorizontal, ToggleLeft } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";

const emptyForm = { name: "", sku: "", costPrice: "", sellPrice: "", stock: "0", minStock: "0", unit: "قطعة", categoryId: "", supplierId: "", warrantyMonths: "", description: "" };
function errorMessage(error: unknown) { return error instanceof Error ? error.message.replace(/^.*Uncaught ConvexError:\s*/, "") : "تعذر إتمام العملية"; }

export function ProductsPage({ createRequestToken }: { createRequestToken?: number }) {
  const { formatCurrency } = useCurrency();
  const canCreate = usePermission("create_products");
  const canEdit = usePermission("edit_products");
  const canViewSuppliers = usePermission("view_suppliers");
  const canViewPrices = usePermission("view_prices");
  const canViewProfits = usePermission("view_profits");
  const products = useQuery(api.products.list, {}) ?? [];
  const categories = useQuery(api.categories.list) ?? [];
  const suppliers = useQuery(api.suppliers.list, canViewSuppliers ? {} : "skip") ?? [];
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const adjustStock = useMutation(api.products.adjustStock);
  const setActive = useMutation(api.products.setActive);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [editingId, setEditingId] = useState<Id<"products"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [stockProductId, setStockProductId] = useState<Id<"products"> | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState("");
  const [historyProductId, setHistoryProductId] = useState<Id<"products"> | null>(null);
  const movements = useQuery(api.products.movements, historyProductId ? { productId: historyProductId } : "skip") ?? [];
  const selectedStockProduct = products.find((p) => p._id === stockProductId);

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };
  const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };
  useEffect(() => {
    if (createRequestToken && canCreate) openCreate();
  }, [createRequestToken, canCreate]);
  const openEdit = (product: (typeof products)[number]) => {
    setEditingId(product._id);
    setForm({ name: product.name, sku: product.sku, costPrice: product.costPrice?.toString() ?? "", sellPrice: product.sellPrice?.toString() ?? "", stock: product.stock.toString(), minStock: product.minStock.toString(), unit: product.unit, categoryId: product.categoryId ?? "", supplierId: canViewSuppliers ? product.supplierId ?? "" : "", warrantyMonths: product.warrantyMonths?.toString() ?? "", description: product.description ?? "" });
    setShowForm(true);
  };
  const filtered = products.filter((p) => (p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())) && (!filterCategory || p.categoryId === filterCategory));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true);
    try {
      const common = { name: form.name, sku: form.sku, costPrice: Number(form.costPrice), sellPrice: Number(form.sellPrice), minStock: Number(form.minStock), unit: form.unit, categoryId: form.categoryId ? form.categoryId as Id<"categories"> : undefined, ...(canViewSuppliers ? { supplierId: form.supplierId ? form.supplierId as Id<"suppliers"> : undefined } : {}), warrantyMonths: form.warrantyMonths === "" ? undefined : Number(form.warrantyMonths), description: form.description || undefined };
      if (editingId) { await updateProduct({ id: editingId, ...common }); toast.success("تم تعديل الصنف بنجاح"); }
      else { await createProduct({ ...common, stock: Number(form.stock) }); toast.success("تمت إضافة الصنف بنجاح"); }
      closeForm();
    } catch (error) { toast.error(errorMessage(error)); } finally { setSaving(false); }
  };
  const submitStock = async (event: React.FormEvent) => {
    event.preventDefault(); if (!stockProductId || saving) return; setSaving(true);
    try { await adjustStock({ id: stockProductId, adjustment: Number(adjustment), reason }); toast.success("تم تعديل المخزون وتسجيل الحركة"); setStockProductId(null); setAdjustment(""); setReason(""); }
    catch (error) { toast.error(errorMessage(error)); } finally { setSaving(false); }
  };
  const toggleProduct = async (product: (typeof products)[number]) => {
    if (product.isActive && !window.confirm(`هل تريد تعطيل الصنف «${product.name}»؟`)) return;
    try { await setActive({ id: product._id, isActive: !product.isActive }); toast.success(product.isActive ? "تم تعطيل الصنف" : "تم تفعيل الصنف"); } catch (error) { toast.error(errorMessage(error)); }
  };
  const columns = 5 + Number(canViewProfits) + Number(canViewPrices) + Number(canViewProfits && canViewPrices) + Number(canEdit);

  return <div data-testid="products-page" className="p-4 lg:p-6 space-y-5" dir="rtl">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Package className="w-6 h-6 text-indigo-600"/>الأصناف</h1><p className="text-slate-500 text-sm">{products.length} صنف</p></div>{canCreate && <button data-testid="product-create-open" onClick={openCreate} className="btn-primary flex gap-2"><Plus className="w-4 h-4"/>صنف جديد</button>}</div>
    <div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute right-3 top-3 w-4 h-4 text-slate-400"/><input data-testid="product-search" className="form-input pr-10" placeholder="بحث بالاسم أو الكود..." value={search} onChange={(e) => setSearch(e.target.value)}/></div><select className="form-input sm:w-48" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}><option value="">كل الفئات</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></div>
    <div className="bg-white rounded-2xl border overflow-x-auto"><table className="data-table"><thead><tr><th>الصنف</th><th>الفئة / المورد</th>{canViewProfits && <th>التكلفة</th>}{canViewPrices && <th>البيع</th>}{canViewProfits && canViewPrices && <th>الربح</th>}<th>الضمان</th><th>المخزون</th><th>الحالة</th>{canEdit && <th>الإجراءات</th>}</tr></thead><tbody>
      {filtered.map((p) => <tr key={p._id} data-testid="product-row" data-product-name={p.name} data-product-sku={p.sku} data-product-stock={String(p.stock)} data-product-active={String(p.isActive)} data-product-branch-id={p.branchId ?? ""} className={!p.isActive ? "opacity-60 bg-slate-50" : ""}><td><p className="font-semibold">{p.name}</p><p className="text-xs text-slate-400 font-mono">{p.sku}</p></td><td>{categories.find((c) => c._id === p.categoryId)?.name ?? "—"}{canViewSuppliers && <p className="text-xs text-slate-400">{suppliers.find((s) => s._id === p.supplierId)?.name ?? "بدون مورد"}</p>}</td>{canViewProfits && <td>{p.costPrice === undefined ? "—" : `${formatCurrency(p.costPrice)}`}</td>}{canViewPrices && <td>{p.sellPrice === undefined ? "—" : `${formatCurrency(p.sellPrice)}`}</td>}{canViewProfits && canViewPrices && <td className="text-emerald-600">{p.costPrice === undefined || p.sellPrice === undefined ? "—" : `${formatCurrency((p.sellPrice - p.costPrice))}`}</td>}<td>{p.warrantyMonths === undefined ? "—" : `${p.warrantyMonths} شهر`}</td><td><span className={p.stock === 0 ? "text-red-600 font-bold" : p.stock <= p.minStock ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"}>{p.stock}</span> {p.unit}{p.stock <= p.minStock && p.stock > 0 && <AlertTriangle className="inline w-4 h-4 text-amber-500 mr-1"/>}</td><td><span className={`badge ${p.isActive ? "badge-success" : "badge-danger"}`}>{p.isActive ? "نشط" : "معطل"}</span></td>{canEdit && <td><div className="flex gap-1"><button title="تعديل" onClick={() => openEdit(p)} className="p-2 hover:bg-slate-100 rounded"><Edit2 className="w-4 h-4"/></button><button data-testid="product-stock-open" title="تعديل المخزون" onClick={() => setStockProductId(p._id)} className="p-2 hover:bg-slate-100 rounded"><SlidersHorizontal className="w-4 h-4"/></button><button title="سجل المخزون" onClick={() => setHistoryProductId(p._id)} className="p-2 hover:bg-slate-100 rounded"><History className="w-4 h-4"/></button><button title={p.isActive ? "تعطيل" : "تفعيل"} onClick={() => toggleProduct(p)} className="p-2 hover:bg-slate-100 rounded"><ToggleLeft className="w-4 h-4"/></button></div></td>}</tr>)}
      {!filtered.length && <tr><td colSpan={columns} className="text-center py-12 text-slate-400">لا توجد أصناف</td></tr>}
    </tbody></table></div>
    {showForm && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="p-5 border-b font-bold">{editingId ? "تعديل الصنف" : "إضافة صنف جديد"}</div><form onSubmit={handleSubmit} className="p-6 space-y-4"><div className="grid sm:grid-cols-2 gap-4">
      <label className="form-label">اسم الصنف *<input data-testid="product-name" className="form-input" required value={form.name} onChange={(e) => setForm({...form,name:e.target.value})}/></label><label className="form-label">SKU *<input data-testid="product-sku" className="form-input" required value={form.sku} onChange={(e) => setForm({...form,sku:e.target.value})}/></label>
      {canViewProfits && <label className="form-label">سعر التكلفة *<input data-testid="product-cost-price" type="number" min="0" step="any" className="form-input" required value={form.costPrice} onChange={(e) => setForm({...form,costPrice:e.target.value})}/></label>}{canViewPrices && <label className="form-label">سعر البيع *<input data-testid="product-sell-price" type="number" min="0" step="any" className="form-input" required value={form.sellPrice} onChange={(e) => setForm({...form,sellPrice:e.target.value})}/></label>}
      {!editingId && <label className="form-label">الرصيد الافتتاحي *<input data-testid="product-opening-stock" type="number" min="0" step="1" className="form-input" required value={form.stock} onChange={(e) => setForm({...form,stock:e.target.value})}/></label>}<label className="form-label">الحد الأدنى<input data-testid="product-min-stock" type="number" min="0" step="1" className="form-input" value={form.minStock} onChange={(e) => setForm({...form,minStock:e.target.value})}/></label>
      <label className="form-label">الفئة<select className="form-input" value={form.categoryId} onChange={(e) => setForm({...form,categoryId:e.target.value})}><option value="">بدون فئة</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>{canViewSuppliers && <label className="form-label">المورد<select data-testid="product-supplier" className="form-input" value={form.supplierId} onChange={(e) => setForm({...form,supplierId:e.target.value})}><option value="">بدون مورد</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>}
      <label className="form-label">الوحدة *<input className="form-input" required value={form.unit} onChange={(e) => setForm({...form,unit:e.target.value})}/></label><label className="form-label">الضمان (شهر)<input type="number" min="0" step="1" className="form-input" value={form.warrantyMonths} onChange={(e) => setForm({...form,warrantyMonths:e.target.value})}/></label></div><label className="form-label">الوصف<textarea className="form-input" value={form.description} onChange={(e) => setForm({...form,description:e.target.value})}/></label><div className="flex gap-3"><button data-testid="product-submit" disabled={saving} className="btn-primary flex-1">{saving ? "جارٍ الحفظ..." : editingId ? "حفظ التعديلات" : "حفظ الصنف"}</button><button type="button" onClick={closeForm} className="btn-secondary">إلغاء</button></div></form></div></div>}
    {stockProductId && selectedStockProduct && <div data-testid="product-stock-form" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><form onSubmit={submitStock} className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4"><h2 className="font-bold">تعديل مخزون: {selectedStockProduct.name}</h2><p>المخزون الحالي: <b>{selectedStockProduct.stock}</b></p><label className="form-label">الكمية المضافة أو المخصومة *<input data-testid="product-stock-adjustment" type="number" step="1" required className="form-input" value={adjustment} onChange={(e) => setAdjustment(e.target.value)}/></label><p>المخزون بعد الحركة: <b>{selectedStockProduct.stock + Number(adjustment || 0)}</b></p><label className="form-label">السبب *<textarea data-testid="product-stock-reason" required className="form-input" value={reason} onChange={(e) => setReason(e.target.value)}/></label><div className="flex gap-2"><button data-testid="product-stock-submit" disabled={saving} className="btn-primary flex-1">{saving ? "جارٍ الحفظ..." : "تسجيل الحركة"}</button><button type="button" className="btn-secondary" onClick={() => {setStockProductId(null);setAdjustment("");setReason("");}}>إلغاء</button></div></form></div>}
    {historyProductId && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto"><h2 className="font-bold mb-4">سجل حركات المخزون</h2><table className="data-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>الكمية</th><th>الرصيد</th><th>السبب</th></tr></thead><tbody>{movements.map((m) => <tr key={m._id}><td>{new Date(m.createdAt).toLocaleString("ar-EG")}</td><td>{m.type}</td><td>{m.quantityDelta > 0 ? "+" : ""}{m.quantityDelta}</td><td>{m.stockBefore} ← {m.stockAfter}</td><td>{m.reason}</td></tr>)}</tbody></table><button className="btn-secondary mt-4" onClick={() => setHistoryProductId(null)}>إغلاق</button></div></div>}
  </div>;
}
