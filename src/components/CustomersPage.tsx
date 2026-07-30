import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BookOpen, Edit3, Mail, MapPin, Phone, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

type CustomerCard = {
  _id: Id<"customers">;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  branchId?: Id<"branches">;
  isActive?: boolean;
};

type CustomerBalance = {
  customerId: Id<"customers">;
  receivableBalance: number;
  advanceBalance: number;
  totalPurchases: number;
};

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export function CustomersPage({
  onOpenLedger,
}: {
  onOpenLedger?: (
    customerId: Id<"customers">,
    branchId: Id<"branches">,
  ) => void;
}) {
  const canCreate = usePermission("create_customers");
  const canEdit = usePermission("edit_customers");
  const canSetActive = usePermission("delete_customers");
  const canViewLedger = usePermission("view_customer_ledger");
  const me = useQuery(api.employees.me);
  const customerArgs = me
    ? me.branchId
      ? { branchId: me.branchId }
      : {}
    : "skip";
  const customers = useQuery(api.customers.list, customerArgs) ?? [];
  const balances = useQuery(
    api.customerLedger.branchBalances,
    canViewLedger && me?.branchId ? { branchId: me.branchId } : "skip",
  ) as CustomerBalance[] | undefined;
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const setCustomerActive = useMutation(api.customers.setActive);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"customers"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"customers"> | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);

  const balanceFor = (id: Id<"customers">) =>
    balances?.find((balance) => balance.customerId === id);
  const hasBalanceScope =
    canViewLedger && Boolean(me?.branchId) && balances !== undefined;
  const filtered = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      customer.phone.includes(search.trim()),
  );

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (customer: CustomerCard) => {
    setEditingId(customer._id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      notes: form.notes,
    };
    try {
      if (editingId) {
        await updateCustomer({ id: editingId, ...payload });
        toast.success("تم تحديث بيانات العميل");
      } else {
        await createCustomer({ ...payload, branchId: me?.branchId });
        toast.success("تمت إضافة العميل");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          editingId ? "تعذر تحديث العميل" : "تعذر إضافة العميل",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (
    id: Id<"customers">,
    name: string,
    isActive: boolean,
  ) => {
    if (updatingId) return;
    const message = isActive
      ? `هل تريد إعادة تفعيل العميل ${name}؟`
      : `هل تريد تعطيل العميل ${name}؟ ستظل مستنداته القديمة محفوظة.`;
    if (!window.confirm(message)) return;
    setUpdatingId(id);
    try {
      await setCustomerActive({ id, isActive });
      toast.success(isActive ? "تمت إعادة تفعيل العميل" : "تم تعطيل العميل");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث حالة العميل"));
    } finally {
      setUpdatingId(null);
    }
  };

  const openLedger = (customer: CustomerCard) => {
    const branchId = customer.branchId ?? me?.branchId;
    if (!onOpenLedger || !branchId) {
      toast.error("اختر فرع العمل قبل فتح دفتر العميل");
      return;
    }
    onOpenLedger(customer._id, branchId);
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
        {canCreate && (
          <button
            onClick={openCreate}
            disabled={!me?.branchId}
            className="btn-primary flex items-center gap-2"
            title={!me?.branchId ? "اختر فرع العمل أولًا" : undefined}
          >
            <Plus className="w-4 h-4" />
            عميل جديد
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="إجمالي العملاء" value={customers.length} color="indigo" />
        <StatCard
          label="عملاء بمديونية"
          value={
            hasBalanceScope
              ? customers.filter(
                  (customer) =>
                    (balanceFor(customer._id)?.receivableBalance ?? 0) > 0,
                ).length
              : "—"
          }
          color="amber"
        />
        <StatCard
          label="إجمالي المديونيات"
          value={
            hasBalanceScope
              ? `${(balances ?? [])
                  .reduce(
                    (sum, balance) => sum + balance.receivableBalance,
                    0,
                  )
                  .toLocaleString("ar-EG")} ج.م`
              : "—"
          }
          color="emerald"
        />
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="form-input pr-10"
          placeholder="بحث بالاسم أو رقم الهاتف..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((customer) => {
          const balance = balanceFor(customer._id);
          return (
            <article
              key={customer._id}
              className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                customer.isActive === false ? "opacity-70 grayscale-[25%]" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">
                      {customer.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{customer.name}</p>
                    <span
                      className={`badge ${
                        customer.isActive === false
                          ? "badge-danger"
                          : "badge-success"
                      }`}
                    >
                      {customer.isActive === false ? "معطل" : "نشط"}
                    </span>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {customer.phone}
                    </p>
                  </div>
                </div>
                {hasBalanceScope && (balance?.receivableBalance ?? 0) > 0 && (
                  <span className="badge badge-warning">
                    {balance?.receivableBalance.toLocaleString("ar-EG")} ج.م
                  </span>
                )}
              </div>
              {customer.email && (
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                  <Mail className="w-3 h-3" />
                  {customer.email}
                </p>
              )}
              {customer.address && (
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                  <MapPin className="w-3 h-3" />
                  {customer.address}
                </p>
              )}
              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <div>
                  <p className="text-xs text-slate-500">إجمالي المشتريات</p>
                  <p className="font-bold text-sm">
                    {hasBalanceScope
                      ? `${(balance?.totalPurchases ?? 0).toLocaleString(
                          "ar-EG",
                        )} ج.م`
                      : "—"}
                  </p>
                </div>
                {hasBalanceScope && (
                  <div className="text-left">
                    <p className="text-xs text-slate-500">المقدم</p>
                    <p className="font-bold text-sm text-emerald-700">
                      {(balance?.advanceBalance ?? 0).toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {canEdit && (
                  <button
                    onClick={() => openEdit(customer)}
                    className="btn-secondary text-xs flex items-center justify-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    تعديل
                  </button>
                )}
                {canViewLedger && (
                  <button
                    onClick={() => openLedger(customer)}
                    className="btn-secondary text-xs flex items-center justify-center gap-1"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    دفتر العميل
                  </button>
                )}
              </div>
              {canSetActive && (
                <button
                  disabled={updatingId !== null}
                  onClick={() =>
                    void handleSetActive(
                      customer._id,
                      customer.name,
                      customer.isActive === false,
                    )
                  }
                  className={`mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold ${
                    customer.isActive === false
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {updatingId === customer._id
                    ? "جارٍ التحديث..."
                    : customer.isActive === false
                      ? "إعادة تفعيل العميل"
                      : "تعطيل العميل"}
                </button>
              )}
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد عملاء
          </div>
        )}
      </div>

      {showForm && (
        <ContactModal
          title={editingId ? "تعديل بيانات العميل" : "إضافة عميل جديد"}
          form={form}
          saving={saving}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: "indigo" | "amber" | "emerald";
}) {
  const classes = {
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  }[color];
  return (
    <div className={`${classes} rounded-xl p-4 text-center`}>
      <p className="text-xl font-black">{value}</p>
      <p className="text-xs text-slate-600 mt-0.5">{label}</p>
    </div>
  );
}

function ContactModal({
  title,
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  title: string;
  form: CustomerForm;
  saving: boolean;
  onChange: (form: CustomerForm) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-up">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <ContactField
            label="الاسم *"
            value={form.name}
            required
            onChange={(name) => onChange({ ...form, name })}
          />
          <ContactField
            label="رقم الهاتف *"
            value={form.phone}
            required
            onChange={(phone) => onChange({ ...form, phone })}
          />
          <ContactField
            label="البريد الإلكتروني"
            value={form.email}
            type="email"
            onChange={(email) => onChange({ ...form, email })}
          />
          <ContactField
            label="العنوان"
            value={form.address}
            onChange={(address) => onChange({ ...form, address })}
          />
          <label className="block">
            <span className="form-label">ملاحظات</span>
            <textarea
              className="form-input"
              rows={2}
              maxLength={1000}
              value={form.notes}
              onChange={(event) =>
                onChange({ ...form, notes: event.target.value })
              }
            />
          </label>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="btn-secondary"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactField({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "email";
}) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <input
        className="form-input"
        type={type}
        required={required}
        maxLength={type === "email" ? 254 : 300}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
