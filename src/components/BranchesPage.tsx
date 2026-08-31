import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";
import {
  Building2, Plus, X, MapPin, Phone,
  CheckCircle, XCircle, Pencil, Trash2, Users,
  ToggleLeft, ToggleRight, DatabaseZap
} from "lucide-react";

interface BranchForm {
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
}

const emptyForm = (): BranchForm => ({ name: "", address: "", phone: "", isActive: true });

export function BranchesPage() {
  const canManage = usePermission("manage_branches");
  const canViewEmployees = usePermission("view_employees");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<Id<"branches"> | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm());

  const branches = useQuery(api.branches.list);
  const employees = useQuery(api.employees.list, canViewEmployees ? {} : "skip");
  const stats = useQuery(api.branches.stats);
  const legacyData = useQuery(api.branches.legacyDataStats, canManage ? {} : "skip");
  const createBranch = useMutation(api.branches.create);
  const updateBranch = useMutation(api.branches.update);
  const removeBranch = useMutation(api.branches.setActive);
  const assignLegacyData = useMutation(api.branches.assignLegacyData);

  const filtered = branches ?? [];

  const openCreate = () => { setForm(emptyForm()); setEditId(null); setShowForm(true); };
  const openEdit = (b: NonNullable<typeof branches>[number]) => {
    setForm({ name: b.name, address: b.address, phone: b.phone ?? "", isActive: b.isActive });
    setEditId(b._id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("أدخل اسم الفرع"); return; }
    if (!form.address.trim()) { toast.error("أدخل عنوان الفرع"); return; }
    try {
      if (editId) {
        await updateBranch({ id: editId, name: form.name, address: form.address, phone: form.phone || undefined, isActive: form.isActive });
        toast.success("تم تحديث الفرع");
      } else {
        await createBranch({ name: form.name, address: form.address, phone: form.phone || undefined, isActive: form.isActive });
        toast.success("تم إضافة الفرع بنجاح");
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  };

  const handleDelete = async (id: Id<"branches">) => {
    if (!confirm("هل أنت متأكد من تعطيل هذا الفرع؟")) return;
    try {
      await removeBranch({ id, isActive: false });
      toast.success("تم تعطيل الفرع");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  };

  const handleAssignLegacyData = async (id: Id<"branches">, name: string) => {
    if (!confirm(`سيتم إسناد كل البيانات القديمة غير المرتبطة بفرع إلى «${name}». هل تريد المتابعة؟`)) return;
    try {
      const assigned = await assignLegacyData({ branchId: id });
      toast.success(`تم إسناد ${assigned} سجل إلى ${name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إسناد البيانات القديمة");
    }
  };

  const getBranchEmployeeCount = (branchId: Id<"branches">) =>
    (employees ?? []).filter(e => e.branchId === branchId).length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-600" />
            الفروع
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">إدارة فروع المتجر ومواقعه</p>
        </div>
        {canManage && <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          فرع جديد
        </button>}
      </div>

      {canManage && (legacyData?.total ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <DatabaseZap className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold text-amber-800">يوجد {legacyData?.total} سجل قديم بدون فرع</p>
            <p className="text-xs text-amber-700 mt-1">اختر الفرع المناسب ثم استخدم زر «إسناد البيانات القديمة» داخل بطاقة الفرع.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الفروع",   value: stats?.total ?? 0,         color: "text-indigo-600",  bg: "bg-indigo-50",  icon: Building2 },
          { label: "فروع نشطة",       value: stats?.active ?? 0,        color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle },
          { label: "فروع متوقفة",     value: stats?.inactive ?? 0,      color: "text-red-600",     bg: "bg-red-50",     icon: XCircle },
          ...(canViewEmployees ? [{ label: "إجمالي المستخدمين", value: stats?.totalEmployees ?? 0, color: "text-blue-600", bg: "bg-blue-50", icon: Users }] : []),
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card flex items-center gap-4">
              <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Branches Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-9 h-9 text-slate-400" />
          </div>
          <p className="text-slate-500 font-semibold text-lg">لا توجد فروع</p>
          <p className="text-slate-400 text-sm mt-1">أضف فرعاً جديداً للبدء</p>
          {canManage && <button onClick={openCreate} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> إضافة فرع
          </button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(branch => {
            const empCount = canViewEmployees ? getBranchEmployeeCount(branch._id) : undefined;
            return (
              <div key={branch._id} className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all p-5 ${!branch.isActive ? "opacity-60 border-slate-200" : "border-slate-100"}`}>
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${branch.isActive ? "bg-indigo-100" : "bg-slate-100"}`}>
                      <Building2 className={`w-6 h-6 ${branch.isActive ? "text-indigo-600" : "text-slate-400"}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">{branch.name}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${branch.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {branch.isActive ? "نشط" : "متوقف"}
                      </span>
                    </div>
                  </div>
                  {canManage && <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(branch)}
                      className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                      title="تعديل"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(branch._id)}
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                      title="تعطيل"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>}
                </div>

                {/* Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{branch.address}</span>
                  </div>
                  {branch.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>{branch.phone}</span>
                    </div>
                  )}
                  {canViewEmployees && <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span>{empCount} موظف</span>
                  </div>}
                </div>
                {canManage && (legacyData?.total ?? 0) > 0 && branch.isActive && (
                  <button
                    type="button"
                    onClick={() => void handleAssignLegacyData(branch._id, branch.name)}
                    className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-colors"
                  >
                    <DatabaseZap className="w-4 h-4" />
                    إسناد البيانات القديمة لهذا الفرع
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                {editId ? "تعديل الفرع" : "فرع جديد"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="form-label">اسم الفرع *</label>
                <input className="form-input" placeholder="مثال: الفرع الرئيسي" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="form-label">العنوان *</label>
                <input className="form-input" placeholder="عنوان الفرع" value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className="form-label">رقم الهاتف</label>
                <input className="form-input" placeholder="01xxxxxxxxx" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                <span className="text-sm font-medium text-slate-700">حالة الفرع</span>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, isActive: !form.isActive })}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${form.isActive ? "text-emerald-600" : "text-slate-400"}`}
                >
                  {form.isActive
                    ? <><ToggleRight className="w-6 h-6" /> نشط</>
                    : <><ToggleLeft className="w-6 h-6" /> متوقف</>
                  }
                </button>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
                <button type="submit" className="btn-primary flex-1">{editId ? "حفظ التعديلات" : "إضافة الفرع"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}