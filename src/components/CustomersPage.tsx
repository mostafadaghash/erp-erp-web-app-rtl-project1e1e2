import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BookOpen, Edit3, Mail, MapPin, Phone, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { ContactFormModal } from "./ContactFormModal";
import {
  type ContactFormValues,
  validateContactForm,
} from "../lib/contactForm";

type CustomerForm = ContactFormValues;

type CustomerCard = {
  _id: Id<"customers">;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  branchId?: Id<"branches">;
  isActive?: boolean;
  categoryId?: Id<"customerCategories">;
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
  onCreateCustomer,
  createRequestToken,
}: {
  onOpenLedger?: (
    customerId: Id<"customers">,
    branchId: Id<"branches">,
  ) => void;
  onCreateCustomer?: () => void;
  createRequestToken?: number;
}) {
  const canCreate = usePermission("create_customers");
  const canEdit = usePermission("edit_customers");
  const canSetActive = usePermission("delete_customers");
  const canViewLedger = usePermission("view_customer_ledger");
  const canViewBranches = usePermission("view_branches");
  const me = useQuery(api.employees.me);

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"customers"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"customers"> | null>(null);
  const [profileId, setProfileId] = useState<Id<"customers"> | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const formValidation = validateContactForm(form);

  const branchesQuery = useQuery(
    api.branches.list,
    canViewBranches && !me?.branchId ? {} : "skip",
  );
  const branches = branchesQuery ?? [];
  const effectiveBranchId = me?.branchId ??
    (selectedBranchId ? selectedBranchId as Id<"branches"> : null);
  const requiresBranchSelection = Boolean(
    me && !me.branchId && canViewBranches && branches.length > 0 && !selectedBranchId,
  );
  const noCustomerBranchAvailable = Boolean(
    me &&
      !me.branchId &&
      canViewBranches &&
      branchesQuery !== undefined &&
      branches.length === 0,
  );
  const customerArgs = me && effectiveBranchId
    ? { branchId: effectiveBranchId }
    : "skip";
  const customersQuery = useQuery(api.customers.list, customerArgs);
  const customers = customersQuery ?? [];
  const balances = useQuery(
    api.customerLedger.branchBalances,
    canViewLedger && effectiveBranchId
      ? { branchId: effectiveBranchId }
      : "skip",
  ) as CustomerBalance[] | undefined;
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const setCustomerActive = useMutation(api.customers.setActive);
  const profile = useQuery(api.customers.profile, profileId ? { id: profileId } : "skip");
  const categories = useQuery(api.contactCategories.list, { type: "customer" }) ?? [];
  const createCategory = useMutation(api.contactCategories.create);

  const balanceFor = (id: Id<"customers">) =>
    balances?.find((balance) => balance.customerId === id);
  const hasBalanceScope =
    canViewLedger && Boolean(effectiveBranchId) && balances !== undefined;
  const customersLoaded = customersQuery !== undefined;
  const balancesLoading =
    canViewLedger && Boolean(effectiveBranchId) && balances === undefined;
  const missingCustomerBranchAccess = Boolean(
    me && !me.branchId && !canViewBranches,
  );
  const filtered = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      customer.phone.includes(search.trim()),
  ).filter(customer => !filterCategory || customer.categoryId === filterCategory);

  const handleCustomerBranchChange = (value: string) => {
    if (saving || updatingId !== null) return;
    setSelectedBranchId(value);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setCategoryId("");
    setSearch("");
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setCategoryId("");
  };

  const openCreate = () => {
    if (!effectiveBranchId) {
      toast.error("اختر فرع العميل أولًا");
      return;
    }
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openStandaloneCreate = () => {
    if (onCreateCustomer) {
      onCreateCustomer();
      return;
    }
    openCreate();
  };

  useEffect(() => {
    if (createRequestToken && canCreate) openCreate();
  }, [createRequestToken, canCreate]);

  const openEdit = (customer: CustomerCard) => {
    setEditingId(customer._id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
    setCategoryId(customer.categoryId ? String(customer.categoryId) : "");
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!editingId && !effectiveBranchId) {
      toast.error("اختر فرع العميل أولًا");
      return;
    }
    if (!formValidation.ok) {
      toast.error(formValidation.reason);
      return;
    }
    const { payload, normalizedForm } = formValidation;
    setForm(normalizedForm);
    setSaving(true);
    try {
      if (editingId) {
        await updateCustomer({ id: editingId, ...payload, categoryId: categoryId ? categoryId as Id<"customerCategories"> : undefined });
        toast.success("تم تحديث بيانات العميل");
      } else if (effectiveBranchId) {
        await createCustomer({ ...payload, branchId: effectiveBranchId, categoryId: categoryId ? categoryId as Id<"customerCategories"> : undefined });
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
      toast.error(
        getErrorMessage(
          error,
          isActive ? "تعذر إعادة تفعيل العميل" : "تعذر تعطيل العميل",
        ),
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const openLedger = (customer: CustomerCard) => {
    const branchId = customer.branchId ?? effectiveBranchId;
    if (!onOpenLedger || !branchId) {
      toast.error("اختر فرع العمل قبل فتح حساب العميل");
      return;
    }
    onOpenLedger(customer._id, branchId);
  };

  const handleCreateCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name || savingCategory) return;
    setSavingCategory(true);
    try {
      await createCategory({ type: "customer", name });
      setCategoryName("");
      setShowCategoryForm(false);
      toast.success("تمت إضافة التصنيف");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إضافة التصنيف"));
    } finally {
      setSavingCategory(false);
    }
  };

  return (
    <div data-testid="customers-page" className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            العملاء
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {noCustomerBranchAvailable
              ? "لا توجد فروع نشطة"
              : missingCustomerBranchAccess
                ? "لا يوجد فرع عمل متاح لعرض العملاء"
                : requiresBranchSelection
                ? "اختر الفرع لعرض العملاء"
                : customersQuery === undefined
                  ? "جارٍ تحميل العملاء"
                  : `${customers.length} عميل`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <button className="btn-secondary" onClick={() => setShowCategoryForm(value => !value)}><Plus className="h-4 w-4" />تصنيف</button>}
          {canViewBranches && !me?.branchId && branches.length > 0 && (
            <select
              data-testid="customer-branch-select"
              className="form-input min-w-40"
              aria-label="فرع العملاء"
              value={selectedBranchId}
              disabled={saving || updatingId !== null}
              onChange={(event) => handleCustomerBranchChange(event.target.value)}
            >
              <option value="">اختر الفرع</option>
              {branches.map((branch: { _id: Id<"branches">; name: string }) => (
                <option key={branch._id} value={branch._id}>{branch.name}</option>
              ))}
            </select>
          )}
          {canCreate && (
            <button
              data-testid="customer-create-open"
              onClick={openStandaloneCreate}
              disabled={!effectiveBranchId && !onCreateCustomer}
              className="btn-primary flex items-center gap-2"
              title={!effectiveBranchId && !onCreateCustomer ? "اختر فرع العميل أولًا" : undefined}
            >
              <Plus className="w-4 h-4" />
              عميل جديد
            </button>
          )}
        </div>
      </div>

      {showCategoryForm && (
        <form onSubmit={handleCreateCategory} className="professional-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="form-label">اسم تصنيف العملاء</label>
            <input autoFocus className="form-input" value={categoryName} onChange={event => setCategoryName(event.target.value)} maxLength={80} placeholder="مثال: عملاء جملة" />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={savingCategory || !categoryName.trim()}>{savingCategory ? "جارٍ الحفظ…" : "حفظ التصنيف"}</button>
            <button type="button" className="btn-secondary" onClick={() => { setShowCategoryForm(false); setCategoryName(""); }}>إلغاء</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="إجمالي العملاء"
          value={customersLoaded ? customers.length : "—"}
          color="indigo"
        />
        <StatCard
          label="عملاء بمديونية"
          value={
            balancesLoading
              ? "…"
              : hasBalanceScope
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
            balancesLoading
              ? "…"
              : hasBalanceScope
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
          data-testid="customer-search"
          className="form-input pr-10"
          placeholder="بحث بالاسم أو رقم الهاتف..."
          value={search}
          disabled={!customersLoaded}
          title={!customersLoaded ? "اختر الفرع وانتظر تحميل العملاء" : undefined}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {categories.length > 0 && <select className="form-input max-w-xs" value={filterCategory} onChange={event => setFilterCategory(event.target.value)}><option value="">كل التصنيفات</option>{categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}</select>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((customer) => {
          const balance = balanceFor(customer._id);
          return (
            <article
              key={customer._id}
              data-testid="customer-card"
              data-customer-name={customer.name}
              data-customer-active={String(customer.isActive !== false)}
              data-customer-branch-id={customer.branchId ?? ""}
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
                <button onClick={() => setProfileId(customer._id)} className="btn-secondary text-xs flex items-center justify-center gap-1"><Users className="w-3.5 h-3.5" />بطاقة العميل</button>
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
                    حساب العميل
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
        {missingCustomerBranchAccess && (
          <div className="col-span-full text-center py-12 text-amber-700">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد فرع عمل متاح لعرض العملاء
          </div>
        )}
        {requiresBranchSelection && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            اختر الفرع لعرض العملاء
          </div>
        )}
        {!requiresBranchSelection && !noCustomerBranchAvailable && !missingCustomerBranchAccess && customersQuery === undefined && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            جارٍ تحميل العملاء
          </div>
        )}
        {!requiresBranchSelection && customersQuery !== undefined && customers.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد عملاء في هذا الفرع
          </div>
        )}
        {customers.length > 0 && filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا توجد نتائج مطابقة للبحث
          </div>
        )}
      </div>

      {showForm && (
        <ContactFormModal
          title={editingId ? "تعديل بيانات العميل" : "إضافة عميل جديد"}
          nameLabel="الاسم *"
          form={form}
          saving={saving}
          validation={formValidation}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSubmit}
          categoryOptions={categories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
        />
      )}
      {profileId && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"><section className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">{profile === undefined ? <p className="p-10 text-center text-slate-500">جارٍ تحميل بطاقة العميل…</p> : <><header className="flex items-start justify-between border-b pb-4"><div><p className="erp-kicker">بطاقة العميل</p><h2 className="text-2xl font-black">{profile.customer.name}</h2><p className="mt-1 text-sm text-slate-500">{profile.customer.phone} {profile.customer.categoryName ? `— ${profile.customer.categoryName}` : ""}</p></div><button className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setProfileId(null)}><X className="h-5 w-5" /></button></header><div className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="الرصيد الحالي" value={`${(profile.balance?.receivableBalance ?? 0).toLocaleString("ar-EG")} ج.م`} color="amber" /><StatCard label="المبيعات" value={profile.invoices.length} color="indigo" /><StatCard label="الصيانة" value={profile.repairs.length} color="emerald" /><StatCard label="الشحن" value={profile.deliveries.length} color="indigo" /></div><div className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border p-4"><h3 className="mb-3 font-black">البيانات والملاحظات</h3><p className="text-sm leading-7 text-slate-600">{profile.customer.address || "لا يوجد عنوان"}<br />{profile.customer.email || "لا يوجد بريد إلكتروني"}<br />{profile.customer.notes || "لا توجد ملاحظات"}</p></div><div className="rounded-2xl border p-4"><h3 className="mb-3 font-black">آخر التعاملات</h3><div className="max-h-64 divide-y overflow-y-auto">{profile.ledger.slice(0, 20).map(entry => <div key={entry._id} className="flex justify-between gap-3 py-2 text-sm"><span>{entry.description}</span><span className="whitespace-nowrap font-bold">{entry.receivableAfter.toLocaleString("ar-EG")} ج.م</span></div>)}{profile.ledger.length === 0 && <p className="text-sm text-slate-400">لا توجد حركات.</p>}</div></div></div></>}</section></div>}
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