import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../../convex/lib/permissions";
import {
  Users, Plus, X, Search, Phone, Building2, Mail, Link, Copy,
  Shield, Pencil, Trash2, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Lock, Unlock
} from "lucide-react";

const ROLES = [
  { value: "admin",            label: "مدير النظام",    color: "bg-purple-100 text-purple-700" },
  { value: "manager",          label: "مدير فرع",       color: "bg-indigo-100 text-indigo-700" },
  { value: "sales",            label: "موظف مبيعات",    color: "bg-blue-100 text-blue-700" },
  { value: "customer_service", label: "خدمة العملاء",   color: "bg-cyan-100 text-cyan-700" },
  { value: "technician",       label: "فني صيانة",      color: "bg-amber-100 text-amber-700" },
  { value: "accountant",       label: "محاسب",          color: "bg-emerald-100 text-emerald-700" },
  { value: "shipping",         label: "موظف شحن",       color: "bg-orange-100 text-orange-700" },
  { value: "viewer",           label: "مشاهد فقط",      color: "bg-slate-100 text-slate-600" },
];

const PERMISSION_LABELS_SOURCE = [
  { key: "view_products",   label: "عرض المنتجات",           group: "عرض" },
  { key: "view_customers",  label: "عرض العملاء",            group: "عرض" },
  { key: "view_orders",     label: "عرض الأوردرات",          group: "عرض" },
  { key: "view_invoices",   label: "عرض الفواتير",           group: "عرض" },
  { key: "view_repairs",    label: "عرض الصيانة",            group: "عرض" },
  { key: "view_shipments",  label: "عرض الشحنات",            group: "عرض" },
  { key: "view_reports",    label: "عرض التقارير",           group: "عرض" },
  { key: "view_prices",     label: "عرض الأسعار",            group: "عرض" },
  { key: "view_profits",    label: "عرض الأرباح",            group: "عرض" },
  { key: "create_orders",   label: "إنشاء أوردرات",          group: "إضافة" },
  { key: "create_invoices", label: "إنشاء فواتير",           group: "إضافة" },
  { key: "create_repairs",  label: "إنشاء أوامر صيانة",      group: "إضافة" },
  { key: "create_customers",label: "إضافة عملاء",            group: "إضافة" },
  { key: "create_expenses", label: "إضافة مصروفات",          group: "إضافة" },
  { key: "create_shipments",label: "إنشاء شحنات",            group: "إضافة" },
  { key: "edit_orders",     label: "تعديل الأوردرات",        group: "تعديل" },
  { key: "edit_repairs",    label: "تعديل الصيانة",          group: "تعديل" },
  { key: "edit_customers",  label: "تعديل العملاء",          group: "تعديل" },
  { key: "edit_expenses",   label: "تعديل المصروفات",        group: "تعديل" },
  { key: "edit_shipments",  label: "تعديل الشحنات",          group: "تعديل" },
  { key: "export_data",     label: "تصدير البيانات",         group: "أخرى" },
  { key: "print_invoices",  label: "طباعة الفواتير",         group: "أخرى" },
  { key: "print_repairs",   label: "طباعة الصيانة",          group: "أخرى" },
  { key: "print_shipping",  label: "طباعة الشحن",            group: "أخرى" },
  { key: "manage_users",    label: "إدارة المستخدمين",       group: "أخرى" },
  { key: "manage_settings", label: "إدارة الإعدادات",        group: "أخرى" },
  { key: "manage_branches", label: "إدارة الفروع",           group: "أخرى" },
];

const permissionGroup = (permission: string) => {
  if (permission.startsWith("view_")) return "عرض";
  if (permission.startsWith("create_")) return "إضافة";
  if (permission.startsWith("edit_")) return "تعديل";
  if (permission.startsWith("delete_")) return "حذف";
  if (permission.startsWith("manage_")) return "إدارة";
  return "أخرى";
};

const ALL_PERMISSIONS = PERMISSIONS.map((key) => {
  const existing = PERMISSION_LABELS_SOURCE.find((permission) => permission.key === key);
  return {
    key,
    label: existing?.label ?? key,
    group: permissionGroup(key),
  };
});

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  ...ROLE_PERMISSIONS,
};

interface EmpForm {
  name: string;
  email: string;
  phone: string;
  role: string;
  branchId: string;
  isActive: boolean;
  permissions: string[];
}

const emptyForm = (): EmpForm => ({
  name: "", email: "", phone: "", role: "sales", branchId: "", isActive: true,
  permissions: ROLE_DEFAULT_PERMISSIONS["sales"],
});

export function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<Id<"userProfiles"> | null>(null);
  const [form, setForm] = useState<EmpForm>(emptyForm());
  const [showPermissions, setShowPermissions] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const employees = useQuery(api.employees.list, {});
  const branches = useQuery(api.branches.list);
  const stats = useQuery(api.employees.stats);
  const createEmployee = useMutation(api.employees.create);
  const updateEmployee = useMutation(api.employees.update);
  const removeEmployee = useMutation(api.employees.remove);
  const toggleActive = useMutation(api.employees.toggleActive);
  const renewInvitation = useMutation(api.employees.renewInvitation);

  const filtered = (employees ?? []).filter(e => {
    const matchSearch =
      e.name.includes(search) ||
      (e.phone ?? "").includes(search) ||
      (e.email ?? "").includes(search.toLowerCase());
    const matchRole = filterRole === "all" || e.role === filterRole;
    return matchSearch && matchRole;
  });

  const getRoleInfo = (role: string) => ROLES.find(r => r.value === role) ?? ROLES[0];
  const getBranchName = (branchId?: Id<"branches">) =>
    (branches ?? []).find(b => b._id === branchId)?.name ?? "—";

  const openCreate = () => {
    setForm(emptyForm());
    setEditId(null);
    setShowPermissions(false);
    setShowForm(true);
  };

  const openEdit = (emp: NonNullable<typeof employees>[number]) => {
    setForm({
      name: emp.name,
      email: emp.email ?? "",
      phone: emp.phone ?? "",
      role: emp.role,
      branchId: emp.branchId ?? "",
      isActive: emp.isActive,
      permissions: emp.permissions,
    });
    setEditId(emp._id);
    setShowPermissions(false);
    setShowForm(true);
  };

  const handleRoleChange = (role: string) => {
    setForm({ ...form, role, permissions: ROLE_DEFAULT_PERMISSIONS[role] ?? [] });
  };

  const togglePermission = (key: string) => {
    const perms = form.permissions.includes(key)
      ? form.permissions.filter(p => p !== key)
      : [...form.permissions, key];
    setForm({ ...form, permissions: perms });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("أدخل اسم الموظف"); return; }
    if (!editId && !form.email.trim()) { toast.error("أدخل البريد الإلكتروني"); return; }
    try {
      if (editId) {
        await updateEmployee({
          id: editId,
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          role: form.role,
          branchId: form.branchId ? form.branchId as Id<"branches"> : undefined,
          permissions: form.permissions,
          isActive: form.isActive,
        });
        toast.success("تم تحديث بيانات الموظف");
      } else {
        const invitation = await createEmployee({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          role: form.role,
          branchId: form.branchId ? form.branchId as Id<"branches"> : undefined,
          permissions: form.permissions,
          isActive: form.isActive,
        });
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set("invite", invitation.inviteCode);
        url.searchParams.set("email", invitation.email);
        setInviteLink(url.toString());
        try {
          await navigator.clipboard.writeText(url.toString());
          toast.success("تم إنشاء الموظف ونسخ رابط الدعوة");
        } catch {
          toast.success("تم إنشاء الموظف. انسخ رابط الدعوة من النافذة");
        }
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  };

  const handleDelete = async (id: Id<"userProfiles">) => {
    if (!confirm("هل أنت متأكد من إيقاف هذا الموظف؟ سيظل سجل الحساب محفوظاً.")) return;
    try {
      await removeEmployee({ id });
      toast.success("تم إيقاف الموظف مع الاحتفاظ بسجله");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  };

  const handleRenewInvitation = async (id: Id<"userProfiles">) => {
    try {
      const invitation = await renewInvitation({ id });
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set("invite", invitation.inviteCode);
      url.searchParams.set("email", invitation.email);
      setInviteLink(url.toString());
      try {
        await navigator.clipboard.writeText(url.toString());
        toast.success("تم تجديد الدعوة ونسخ الرابط");
      } catch {
        toast.success("تم تجديد الدعوة");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تجديد الدعوة");
    }
  };

  const handleToggle = async (id: Id<"userProfiles">) => {
    try {
      await toggleActive({ id });
      toast.success("تم تغيير حالة الموظف");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  };

  // Group permissions by group
  const permGroups = ALL_PERMISSIONS.reduce((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {} as Record<string, typeof ALL_PERMISSIONS>);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            الموظفون والصلاحيات
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">إدارة فريق العمل وتحديد الصلاحيات</p>
        </div>
        <button
          data-testid="employee-create-open"
          onClick={openCreate}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          موظف جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الموظفين", value: stats?.total ?? 0,    color: "text-indigo-600",  bg: "bg-indigo-50",  icon: Users },
          { label: "نشطون",           value: stats?.active ?? 0,   color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle },
          { label: "موقوفون",         value: stats?.inactive ?? 0, color: "text-red-600",     bg: "bg-red-50",     icon: XCircle },
          { label: "الأدوار",         value: Object.keys(stats?.byRole ?? {}).length, color: "text-purple-600", bg: "bg-purple-50", icon: Shield },
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

      {/* Roles Summary */}
      {stats?.byRole && Object.keys(stats.byRole).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-500" />
            توزيع الأدوار
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byRole).map(([role, count]) => {
              const info = getRoleInfo(role);
              return (
                <span key={role} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${info.color}`}>
                  {info.label}: {count}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-9"
            placeholder="بحث بالاسم أو الهاتف..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterRole("all")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterRole === "all" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"}`}
          >
            الكل
          </button>
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => setFilterRole(r.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterRole === r.value ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">لا يوجد موظفون</p>
            <p className="text-slate-400 text-sm mt-1">أضف موظفاً جديداً للبدء</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الدور</th>
                  <th>الفرع</th>
                  <th>الصلاحيات</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => {
                  const roleInfo = getRoleInfo(emp.role);
                  return (
                    <tr
                      key={emp._id}
                      data-testid="employee-row"
                      data-employee-role={emp.role}
                      data-employee-active={String(emp.isActive)}
                      data-invitation-pending={String(
                        !emp.tokenIdentifier && Boolean(emp.email),
                      )}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-sm font-bold">{emp.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{emp.name}</p>
                            {emp.email && <p className="text-xs text-slate-400">{emp.email}</p>}
                            {emp.phone && <p className="text-xs text-slate-400">{emp.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${roleInfo.color}`}>
                          {roleInfo.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 text-slate-600 text-sm">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {getBranchName(emp.branchId)}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {!emp.tokenIdentifier && emp.email && (
                            <button
                              onClick={() => handleRenewInvitation(emp._id)}
                              className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                              title="تجديد رابط الدعوة"
                            >
                              <Link className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm text-slate-600">{emp.permissions.length} صلاحية</span>
                        </div>
                      </td>
                      <td>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${emp.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                          {emp.isActive ? "نشط" : "موقوف"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEdit(emp)}
                            className="p-1.5 bg-slate-50 text-slate-500 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            title="تعديل"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggle(emp._id)}
                            className={`p-1.5 rounded-lg transition-colors ${emp.isActive ? "bg-amber-50 text-amber-600 hover:bg-amber-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
                            title={emp.isActive ? "إيقاف" : "تفعيل"}
                          >
                            {emp.isActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDelete(emp._id)}
                            className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="إيقاف مع الاحتفاظ بالسجل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="my-auto max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl sm:rounded-t-2xl">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                {editId ? "تعديل الموظف" : "موظف جديد"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Basic Info */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">البيانات الأساسية</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">الاسم *</label>
                    <input data-testid="employee-name" className="form-input" placeholder="اسم الموظف" value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">رقم الهاتف</label>
                    <input className="form-input" placeholder="01xxxxxxxxx" value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="form-label">البريد الإلكتروني {!editId && "*"}</label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      dir="ltr"
                      data-testid="employee-email"
                      className="form-input pr-10"
                      placeholder="employee@example.com"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  {!editId && (
                    <p className="text-xs text-slate-400 mt-1">سيتم إنشاء رابط دعوة صالح لمدة 7 أيام.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">الدور الوظيفي *</label>
                    <select data-testid="employee-role" className="form-input" value={form.role} onChange={e => handleRoleChange(e.target.value)}>
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">الفرع</label>
                    <select data-testid="employee-branch" className="form-input" value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}>
                      <option value="">— بدون فرع —</option>
                      {(branches ?? []).map(b => (
                        <option key={b._id} value={b._id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-slate-200">
                  <span className="text-sm font-medium text-slate-700">حالة الموظف</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isActive: !form.isActive })}
                    className={`text-sm font-semibold px-3 py-1 rounded-lg transition-colors ${form.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}
                  >
                    {form.isActive ? "✓ نشط" : "✗ موقوف"}
                  </button>
                </div>
              </div>

              {/* Permissions */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowPermissions(!showPermissions)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold text-slate-700 text-sm">الصلاحيات</span>
                    <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {form.permissions.length} مفعّلة
                    </span>
                  </div>
                  {showPermissions ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {showPermissions && (
                  <div className="p-4 space-y-4">
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, permissions: ALL_PERMISSIONS.map(p => p.key) })}
                        className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium"
                      >
                        تحديد الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, permissions: [] })}
                        className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                      >
                        إلغاء الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, permissions: ROLE_DEFAULT_PERMISSIONS[form.role] ?? [] })}
                        className="text-xs px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium"
                      >
                        إعادة للافتراضي
                      </button>
                    </div>
                    {Object.entries(permGroups).map(([group, perms]) => (
                      <div key={group}>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">{group}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {perms.map(p => (
                            <label key={p.key} className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={form.permissions.includes(p.key)}
                                onChange={() => togglePermission(p.key)}
                                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-xs text-slate-600 group-hover:text-slate-800">{p.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
                <button data-testid="employee-create-submit" type="submit" className="btn-primary flex-1">{editId ? "حفظ التعديلات" : "إضافة الموظف"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {inviteLink && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Link className="w-5 h-5 text-indigo-600" />
                رابط دعوة الموظف
              </h2>
              <button
                data-testid="employee-invite-close"
                onClick={() => setInviteLink("")}
                className="p-1.5 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              أرسل هذا الرابط للموظف ليُنشئ كلمة المرور ويربط حسابه. الرابط صالح لمدة 7 أيام.
            </p>
            <div className="flex gap-2">
              <input
                data-testid="employee-invite-link"
                className="form-input flex-1"
                dir="ltr"
                readOnly
                value={inviteLink}
              />
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  toast.success("تم نسخ رابط الدعوة");
                }}
              >
                <Copy className="w-4 h-4" />
                نسخ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
