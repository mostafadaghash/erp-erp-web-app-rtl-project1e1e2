import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Wrench, Plus, Search, Clock, CheckCircle, AlertCircle, Copy, MessageCircle, Printer } from "lucide-react";
import { PrintModal } from "./PrintTemplate";

const statusConfig: Record<string, { label: string; badge: string; icon: any }> = {
  received: { label: "مستلم", badge: "badge-info", icon: Clock },
  in_progress: { label: "قيد الإصلاح", badge: "badge-warning", icon: Wrench },
  ready: { label: "جاهز للاستلام", badge: "badge-success", icon: CheckCircle },
  delivered: { label: "تم التسليم", badge: "badge-purple", icon: CheckCircle },
  cancelled: { label: "ملغي", badge: "badge-danger", icon: AlertCircle },
};

export function RepairsPage() {
  const repairs = useQuery(api.repairs.list) ?? [];
  const customers = useQuery(api.customers.list) ?? [];
  const createRepair = useMutation(api.repairs.create);
  const updateStatus = useMutation(api.repairs.updateStatus);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [printRepair, setPrintRepair] = useState<any>(null);
  const [form, setForm] = useState({
    customerName: "", customerPhone: "", customerId: "",
    deviceType: "موبايل", deviceBrand: "", deviceModel: "",
    problem: "", laborCost: "", deposit: "",
    expectedDate: "", notes: "", technicianName: "",
  });

  const filtered = repairs.filter(r =>
    r.customerName.toLowerCase().includes(search.toLowerCase()) ||
    r.repairNumber.includes(search) ||
    r.deviceBrand.toLowerCase().includes(search.toLowerCase())
  ).filter(r => !filterStatus || r.status === filterStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRepair({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerId: form.customerId ? form.customerId as any : undefined,
        deviceType: form.deviceType,
        deviceBrand: form.deviceBrand,
        deviceModel: form.deviceModel,
        problem: form.problem,
        laborCost: Number(form.laborCost),
        deposit: Number(form.deposit),
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
        technicianName: form.technicianName || undefined,
      });
      toast.success("تم إضافة طلب الصيانة بنجاح");
      setShowForm(false);
      setForm({ customerName: "", customerPhone: "", customerId: "", deviceType: "موبايل", deviceBrand: "", deviceModel: "", problem: "", laborCost: "", deposit: "", expectedDate: "", notes: "", technicianName: "" });
    } catch (err) {
      toast.error("حدث خطأ أثناء إضافة طلب الصيانة");
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateStatus({
        id: id as any,
        status,
        deliveredDate: status === "delivered" ? new Date().toISOString().split("T")[0] : undefined,
      });
      toast.success("تم تحديث الحالة");
    } catch (err) {
      toast.error("حدث خطأ");
    }
  };

  const handleSelectCustomer = (id: string) => {
    const c = customers.find(c => c._id === id);
    if (c) {
      setForm({ ...form, customerId: id, customerName: c.name, customerPhone: c.phone });
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-indigo-600" />
            الصيانة
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{repairs.length} طلب صيانة</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          طلب صيانة جديد
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ value: "", label: "الكل" }, ...Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label }))].map(s => (
          <button
            key={s.value}
            onClick={() => setFilterStatus(s.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              filterStatus === s.value
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {s.label}
            <span className="mr-1.5 text-xs opacity-70">
              ({s.value ? repairs.filter(r => r.status === s.value).length : repairs.length})
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="form-input pr-10"
          placeholder="بحث بالاسم أو رقم الطلب أو الجهاز..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((r) => {
          const status = statusConfig[r.status] ?? statusConfig.received;
          const StatusIcon = status.icon;
          return (
            <div key={r._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono text-xs text-indigo-600 font-bold">{r.repairNumber}</p>
                  <p className="font-bold text-slate-800 mt-0.5">{r.customerName}</p>
                  <p className="text-xs text-slate-500">{r.customerPhone}</p>
                </div>
                <span className={`badge ${status.badge}`}>
                  {status.label}
                </span>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 mb-3">
                <p className="text-sm font-semibold text-slate-700">{r.deviceBrand} {r.deviceModel}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.deviceType}</p>
                <p className="text-xs text-slate-600 mt-1.5 font-medium">المشكلة: {r.problem}</p>
              </div>

              <div className="flex items-center justify-between mb-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">التكلفة</p>
                  <p className="font-bold text-slate-800">{r.totalCost.toLocaleString("ar-SA")} ريال</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-slate-500">المتبقي</p>
                  <p className={`font-bold ${r.remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {r.remaining.toLocaleString("ar-SA")} ريال
                  </p>
                </div>
                {r.technicianName && (
                  <div className="text-left">
                    <p className="text-xs text-slate-500">الفني</p>
                    <p className="text-xs font-medium text-slate-700">{r.technicianName}</p>
                  </div>
                )}
              </div>

              {r.trackingToken && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-indigo-500 mb-0.5">رمز التتبع</p>
                      <p className="font-mono font-black text-indigo-700 text-sm tracking-widest">{r.trackingToken}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}${window.location.pathname}#track=${r.trackingToken}`;
                          navigator.clipboard.writeText(url);
                          toast.success("تم نسخ رابط التتبع");
                        }}
                        className="p-1.5 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors text-indigo-600"
                        title="نسخ رابط التتبع"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={`https://wa.me/${r.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً ${r.customerName}،\nرابط متابعة طلب الصيانة الخاص بك:\n${window.location.origin}${window.location.pathname}#track=${r.trackingToken}\n\nرقم الطلب: ${r.repairNumber}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors text-emerald-600"
                        title="إرسال عبر واتساب"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {r.status !== "delivered" && r.status !== "cancelled" && (
                  <select
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                    value={r.status}
                    onChange={e => handleStatusChange(r._id, e.target.value)}
                  >
                    <option value="received">مستلم</option>
                    <option value="in_progress">قيد الإصلاح</option>
                    <option value="ready">جاهز</option>
                    <option value="delivered">تم التسليم</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                )}
                <button
                  onClick={() => setPrintRepair(r)}
                  className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors"
                  title="طباعة"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Wrench className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا توجد طلبات صيانة
          </div>
        )}
      </div>

      {/* Print Modal */}
      {printRepair && (
        <PrintModal
          type="repair"
          data={printRepair}
          onClose={() => setPrintRepair(null)}
        />
      )}

      {/* Add Repair Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">طلب صيانة جديد</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">اختر عميل</label>
                  <select className="form-input" value={form.customerId} onChange={e => handleSelectCustomer(e.target.value)}>
                    <option value="">عميل جديد</option>
                    {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">اسم العميل *</label>
                  <input className="form-input" required value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">رقم الهاتف *</label>
                  <input className="form-input" required value={form.customerPhone} onChange={e => setForm({...form, customerPhone: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">نوع الجهاز *</label>
                  <select className="form-input" value={form.deviceType} onChange={e => setForm({...form, deviceType: e.target.value})}>
                    <option value="موبايل">موبايل</option>
                    <option value="لابتوب">لابتوب</option>
                    <option value="تابلت">تابلت</option>
                    <option value="بلايستيشن">بلايستيشن</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">الماركة *</label>
                  <input className="form-input" required value={form.deviceBrand} onChange={e => setForm({...form, deviceBrand: e.target.value})} placeholder="مثال: Samsung, Apple" />
                </div>
                <div>
                  <label className="form-label">الموديل *</label>
                  <input className="form-input" required value={form.deviceModel} onChange={e => setForm({...form, deviceModel: e.target.value})} placeholder="مثال: Galaxy S23" />
                </div>
                <div className="sm:col-span-2">
                  <label className="form-label">وصف المشكلة *</label>
                  <textarea className="form-input" required rows={2} value={form.problem} onChange={e => setForm({...form, problem: e.target.value})} placeholder="اشرح المشكلة بالتفصيل..." />
                </div>
                <div>
                  <label className="form-label">تكلفة العمالة (ريال)</label>
                  <input className="form-input" type="number" value={form.laborCost} onChange={e => setForm({...form, laborCost: e.target.value})} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">العربون (ريال)</label>
                  <input className="form-input" type="number" value={form.deposit} onChange={e => setForm({...form, deposit: e.target.value})} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">الفني المسؤول</label>
                  <input className="form-input" value={form.technicianName} onChange={e => setForm({...form, technicianName: e.target.value})} placeholder="اسم الفني" />
                </div>
                <div>
                  <label className="form-label">تاريخ التسليم المتوقع</label>
                  <input className="form-input" type="date" value={form.expectedDate} onChange={e => setForm({...form, expectedDate: e.target.value})} />
                </div>
                <div className="sm:col-span-2">
                  <label className="form-label">ملاحظات</label>
                  <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">حفظ طلب الصيانة</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
