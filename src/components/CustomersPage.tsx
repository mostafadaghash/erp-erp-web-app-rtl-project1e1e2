import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookOpen, Edit3, FilterX, Plus, Search, UserCheck, UserX, Users, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { type ContactFormValues, validateContactForm } from "../lib/contactForm";
import { getErrorMessage } from "../lib/errors";
import { useCurrency } from "../lib/utils";
import { ContactFormModal } from "./ContactFormModal";

type CustomerRow = {
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

type StatusFilter = "" | "active" | "inactive";
type BalanceFilter = "" | "debt" | "advance" | "clear";

const EMPTY_FORM: ContactFormValues = {
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
  onOpenLedger?: (customerId: Id<"customers">, branchId: Id<"branches">) => void;
  onCreateCustomer?: () => void;
  createRequestToken?: number;
}) {
  const canCreate = usePermission("create_customers");
  const canEdit = usePermission("edit_customers");
  const canSetActive = usePermission("delete_customers");
  const canViewLedger = usePermission("view_customer_ledger");
  const canViewBranches = usePermission("view_branches");
  const { formatAmount, formatCurrency } = useCurrency();
  const me = useQuery(api.employees.me);

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("");
  const [filterBalance, setFilterBalance] = useState<BalanceFilter>("");
  const [editingId, setEditingId] = useState<Id<"customers"> | null>(null);
  const [profileId, setProfileId] = useState<Id<"customers"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"customers"> | null>(null);
  const [form, setForm] = useState<ContactFormValues>(EMPTY_FORM);
  const [categoryId, setCategoryId] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const branchesQuery = useQuery(api.branches.list, canViewBranches && !me?.branchId ? {} : "skip");
  const branches = branchesQuery ?? [];
  const effectiveBranchId = me?.branchId ?? (selectedBranchId ? selectedBranchId as Id<"branches"> : null);
  const customersQuery = useQuery(api.customers.list, me && effectiveBranchId ? { branchId: effectiveBranchId } : "skip");
  const customers = (customersQuery ?? []) as CustomerRow[];
  const balances = useQuery(
    api.customerLedger.branchBalances,
    canViewLedger && effectiveBranchId ? { branchId: effectiveBranchId } : "skip",
  ) as CustomerBalance[] | undefined;
  const categories = useQuery(api.contactCategories.list, { type: "customer" }) ?? [];
  const profile = useQuery(api.customers.profile, profileId ? { id: profileId } : "skip");

  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const setCustomerActive = useMutation(api.customers.setActive);
  const createCategory = useMutation(api.contactCategories.create);

  const validation = validateContactForm(form);
  const hasBalanceScope = canViewLedger && Boolean(effectiveBranchId) && balances !== undefined;
  const balancesLoading = canViewLedger && Boolean(effectiveBranchId) && balances === undefined;
  const requiresBranchSelection = Boolean(me && !me.branchId && canViewBranches && branches.length > 0 && !selectedBranchId);
  const noCustomerBranchAvailable = Boolean(me && !me.branchId && canViewBranches && branchesQuery !== undefined && branches.length === 0);
  const missingCustomerBranchAccess = Boolean(me && !me.branchId && !canViewBranches);

  const balanceMap = useMemo(
    () => new Map((balances ?? []).map((row) => [row.customerId, row])),
    [balances],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((row) => [String(row._id), row.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ar-EG-u-nu-latn");
    return customers.filter((customer) => {
      if (query) {
        const matches =
          customer.name.toLocaleLowerCase("ar-EG-u-nu-latn").includes(query) ||
          customer.phone.includes(search.trim()) ||
          (customer.email ?? "").toLocaleLowerCase("ar-EG-u-nu-latn").includes(query);
        if (!matches) return false;
      }
      if (filterCategory && String(customer.categoryId ?? "") !== filterCategory) return false;
      if (filterStatus === "active" && customer.isActive === false) return false;
      if (filterStatus === "inactive" && customer.isActive !== false) return false;
      if (filterBalance && hasBalanceScope) {
        const balance = balanceMap.get(customer._id);
        const debt = balance?.receivableBalance ?? 0;
        const advance = balance?.advanceBalance ?? 0;
        if (filterBalance === "debt" && debt <= 0) return false;
        if (filterBalance === "advance" && advance <= 0) return false;
        if (filterBalance === "clear" && (debt !== 0 || advance !== 0)) return false;
      }
      return true;
    });
  }, [balanceMap, customers, filterBalance, filterCategory, filterStatus, hasBalanceScope, search]);

  const activeFilters = Boolean(search || filterCategory || filterStatus || filterBalance);
  const debtCustomers = hasBalanceScope
    ? customers.filter((customer) => (balanceMap.get(customer._id)?.receivableBalance ?? 0) > 0).length
    : null;
  const totalDebt = hasBalanceScope
    ? (balances ?? []).reduce((sum, row) => sum + row.receivableBalance, 0)
    : null;

  const resetFilters = () => {
    setSearch("");
    setFilterCategory("");
    setFilterStatus("");
    setFilterBalance("");
  };

  const resetEditForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCategoryId("");
  };

  const openCreate = () => {
    if (!effectiveBranchId) return toast.error("اختر فرع العميل أولًا");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCategoryId("");
    setShowForm(true);
  };

  useEffect(() => {
    if (createRequestToken && canCreate) openCreate();
  }, [createRequestToken, canCreate]);

  const openEdit = (customer: CustomerRow) => {
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
    if (!editingId && !effectiveBranchId) return toast.error("اختر فرع العميل أولًا");
    if (!validation.ok) return toast.error(validation.reason);

    setSaving(true);
    try {
      const category = categoryId ? categoryId as Id<"customerCategories"> : undefined;
      if (editingId) {
        await updateCustomer({ id: editingId, ...validation.payload, categoryId: category });
        toast.success("تم تحديث بيانات العميل");
      } else if (effectiveBranchId) {
        await createCustomer({ ...validation.payload, branchId: effectiveBranchId, categoryId: category });
        toast.success("تمت إضافة العميل");
      }
      resetEditForm();
    } catch (error) {
      toast.error(getErrorMessage(error, editingId ? "تعذر تحديث العميل" : "تعذر إضافة العميل"));
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (customer: CustomerRow, nextActive: boolean) => {
    if (updatingId) return;
    const message = nextActive
      ? `هل تريد إعادة تفعيل العميل ${customer.name}؟`
      : `هل تريد تعطيل العميل ${customer.name}؟ ستظل مستنداته القديمة محفوظة.`;
    if (!window.confirm(message)) return;

    setUpdatingId(customer._id);
    try {
      await setCustomerActive({ id: customer._id, isActive: nextActive });
      toast.success(nextActive ? "تمت إعادة تفعيل العميل" : "تم تعطيل العميل");
    } catch (error) {
      toast.error(getErrorMessage(error, nextActive ? "تعذر إعادة تفعيل العميل" : "تعذر تعطيل العميل"));
    } finally {
      setUpdatingId(null);
    }
  };

  const openLedger = (customer: CustomerRow) => {
    const branchId = customer.branchId ?? effectiveBranchId;
    if (!onOpenLedger || !branchId) return toast.error("اختر فرع العمل قبل فتح حساب العميل");
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
    <div data-testid="customers-page" className="space-y-5 p-4 lg:p-6">
      <div className="erp-page-header">
        <div>
          <span className="erp-kicker">إدارة العملاء</span>
          <h1 className="erp-page-title"><Users className="h-6 w-6 text-[var(--erp-accent)]" />قائمة العملاء</h1>
          <p className="erp-page-subtitle">
            {noCustomerBranchAvailable ? "لا توجد فروع نشطة" :
              missingCustomerBranchAccess ? "لا يوجد فرع عمل متاح لعرض العملاء" :
              requiresBranchSelection ? "اختر الفرع لعرض العملاء" :
              customersQuery === undefined ? "جارٍ تحميل العملاء" :
              `عرض ${formatAmount(filtered.length)} من ${formatAmount(customers.length)} عميل`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <button type="button" className="btn-secondary" onClick={() => setShowCategoryForm((value) => !value)}><Plus className="h-4 w-4" />تصنيف</button>}
          {canCreate && (
            <button
              data-testid="customer-create-open"
              type="button"
              className="btn-primary"
              disabled={!effectiveBranchId && !onCreateCustomer}
              onClick={() => onCreateCustomer ? onCreateCustomer() : openCreate()}
            >
              <Plus className="h-4 w-4" />عميل جديد
            </button>
          )}
        </div>
      </div>

      {showCategoryForm && (
        <form onSubmit={handleCreateCategory} className="professional-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="form-label">اسم تصنيف العملاء</label>
            <input autoFocus className="form-input" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={80} placeholder="مثال: عملاء جملة" />
          </div>
          <button className="btn-primary" disabled={savingCategory || !categoryName.trim()}>{savingCategory ? "جارٍ الحفظ…" : "حفظ التصنيف"}</button>
          <button type="button" className="btn-secondary" onClick={() => { setShowCategoryForm(false); setCategoryName(""); }}>إلغاء</button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي العملاء" value={customersQuery === undefined ? "—" : formatAmount(customers.length)} tone="slate" />
        <Stat label="العملاء النشطون" value={customersQuery === undefined ? "—" : formatAmount(customers.filter((row) => row.isActive !== false).length)} tone="indigo" />
        <Stat label="عملاء بمديونية" value={balancesLoading ? "…" : debtCustomers === null ? "—" : formatAmount(debtCustomers)} tone="amber" />
        <Stat label="إجمالي المديونيات" value={balancesLoading ? "…" : totalDebt === null ? "—" : formatCurrency(totalDebt)} tone="emerald" />
      </div>

      <div className="erp-toolbar flex-col gap-2 lg:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input data-testid="customer-search" className="form-input w-full pr-10" placeholder="بحث بالاسم أو الهاتف أو البريد الإلكتروني..." value={search} disabled={customersQuery === undefined} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {canViewBranches && !me?.branchId && branches.length > 0 && (
          <select
            data-testid="customer-branch-select"
            className="form-input lg:w-44"
            value={selectedBranchId}
            disabled={saving || updatingId !== null}
            onChange={(event) => {
              setSelectedBranchId(event.target.value);
              resetFilters();
              resetEditForm();
            }}
          >
            <option value="">اختر الفرع</option>
            {branches.map((branch: { _id: Id<"branches">; name: string }) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
          </select>
        )}
        <select className="form-input lg:w-44" value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
          <option value="">كل التصنيفات</option>
          {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
        </select>
        <select className="form-input lg:w-40" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as StatusFilter)}>
          <option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">معطل</option>
        </select>
        {canViewLedger && (
          <select className="form-input lg:w-44" value={filterBalance} disabled={!hasBalanceScope} onChange={(event) => setFilterBalance(event.target.value as BalanceFilter)}>
            <option value="">كل الأرصدة</option><option value="debt">عليه مديونية</option><option value="advance">له رصيد مقدم</option><option value="clear">رصيده صفر</option>
          </select>
        )}
        {activeFilters && <button type="button" className="btn-secondary shrink-0" onClick={resetFilters}><FilterX className="h-4 w-4" />مسح الفلاتر</button>}
      </div>

      <div className="erp-section">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead><tr><th>العميل</th><th>رقم الهاتف</th><th>التصنيف</th><th>إجمالي المشتريات</th><th>المديونية</th><th>الرصيد المقدم</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              {filtered.map((customer) => {
                const balance = balanceMap.get(customer._id);
                const isActive = customer.isActive !== false;
                return (
                  <tr
                    key={customer._id}
                    data-testid="customer-card"
                    data-customer-name={customer.name}
                    data-customer-active={String(isActive)}
                    className={`invoice-row-compact cursor-pointer ${isActive ? "" : "opacity-70"}`}
                    tabIndex={0}
                    onClick={() => setProfileId(customer._id)}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        setProfileId(customer._id);
                      }
                    }}
                  >
                    <td><p className="font-bold text-slate-800">{customer.name}</p>{customer.email && <p className="max-w-56 truncate text-xs text-slate-400">{customer.email}</p>}</td>
                    <td className="font-mono text-xs" dir="ltr">{customer.phone}</td>
                    <td className="text-xs">{customer.categoryId ? categoryMap.get(String(customer.categoryId)) ?? "—" : "بدون تصنيف"}</td>
                    <td className="font-bold">{hasBalanceScope ? formatCurrency(balance?.totalPurchases ?? 0) : "—"}</td>
                    <td className={(balance?.receivableBalance ?? 0) > 0 ? "font-bold text-amber-700" : "text-slate-400"}>{hasBalanceScope ? formatCurrency(balance?.receivableBalance ?? 0) : "—"}</td>
                    <td className={(balance?.advanceBalance ?? 0) > 0 ? "font-bold text-emerald-700" : "text-slate-400"}>{hasBalanceScope ? formatCurrency(balance?.advanceBalance ?? 0) : "—"}</td>
                    <td><span className={`badge ${isActive ? "badge-success" : "badge-danger"}`}>{isActive ? "نشط" : "معطل"}</span></td>
                    <td>
                      <div className="flex min-w-max gap-1.5">
                        <button type="button" className="rounded-lg border px-2.5 py-1.5 text-xs font-bold" onClick={(event) => { event.stopPropagation(); setProfileId(customer._id); }}>بطاقة</button>
                        {canEdit && <button type="button" className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700" onClick={(event) => { event.stopPropagation(); openEdit(customer); }}><span className="flex items-center gap-1"><Edit3 className="h-3.5 w-3.5" />تعديل</span></button>}
                        {canViewLedger && <button type="button" className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700" onClick={(event) => { event.stopPropagation(); openLedger(customer); }}><span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />الحساب</span></button>}
                        {canSetActive && <button type="button" disabled={updatingId !== null} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${isActive ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`} onClick={(event) => { event.stopPropagation(); void handleSetActive(customer, !isActive); }}><span className="flex items-center gap-1">{isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}{updatingId === customer._id ? "جارٍ التحديث..." : isActive ? "تعطيل" : "تفعيل"}</span></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {missingCustomerBranchAccess && <EmptyState text="لا يوجد فرع عمل متاح لعرض العملاء" />}
        {requiresBranchSelection && <EmptyState text="اختر الفرع لعرض العملاء" />}
        {!requiresBranchSelection && !noCustomerBranchAvailable && !missingCustomerBranchAccess && customersQuery === undefined && <EmptyState text="جارٍ تحميل العملاء" />}
        {!requiresBranchSelection && customersQuery !== undefined && customers.length === 0 && <EmptyState text="لا يوجد عملاء في هذا الفرع" />}
        {customers.length > 0 && filtered.length === 0 && <EmptyState text="لا توجد نتائج مطابقة للفلاتر الحالية" />}
      </div>

      {showForm && (
        <ContactFormModal
          title={editingId ? "تعديل بيانات العميل" : "إضافة عميل جديد"}
          nameLabel="الاسم *"
          form={form}
          saving={saving}
          validation={validation}
          onChange={setForm}
          onClose={() => { if (!saving) resetEditForm(); }}
          onSubmit={handleSubmit}
          categoryOptions={categories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
        />
      )}

      {profileId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
          <section className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            {profile === undefined ? <p className="p-10 text-center text-slate-500">جارٍ تحميل بطاقة العميل…</p> : (
              <>
                <header className="flex items-start justify-between border-b pb-4">
                  <div><p className="erp-kicker">بطاقة العميل</p><h2 className="text-2xl font-black">{profile.customer.name}</h2><p className="mt-1 text-sm text-slate-500"><span dir="ltr">{profile.customer.phone}</span>{profile.customer.categoryName ? ` — ${profile.customer.categoryName}` : ""}</p></div>
                  <button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setProfileId(null)}><X className="h-5 w-5" /></button>
                </header>
                <div className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="الرصيد الحالي" value={formatCurrency(profile.balance?.receivableBalance ?? 0)} tone="amber" />
                  <Stat label="المبيعات" value={formatAmount(profile.invoices.length)} tone="indigo" />
                  <Stat label="الصيانة" value={formatAmount(profile.repairs.length)} tone="emerald" />
                  <Stat label="الشحن" value={formatAmount(profile.deliveries.length)} tone="slate" />
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border p-4"><h3 className="mb-3 font-black">البيانات والملاحظات</h3><p className="text-sm leading-7 text-slate-600">{profile.customer.address || "لا يوجد عنوان"}<br />{profile.customer.email || "لا يوجد بريد إلكتروني"}<br />{profile.customer.notes || "لا توجد ملاحظات"}</p></div>
                  <div className="rounded-2xl border p-4"><h3 className="mb-3 font-black">آخر التعاملات</h3><div className="max-h-64 divide-y overflow-y-auto">{profile.ledger.slice(0, 20).map((entry) => <div key={entry._id} className="flex justify-between gap-3 py-2 text-sm"><span>{entry.description}</span><span className="whitespace-nowrap font-bold">{formatCurrency(entry.receivableAfter)}</span></div>)}{profile.ledger.length === 0 && <p className="text-sm text-slate-400">لا توجد حركات.</p>}</div></div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-12 text-center text-slate-400"><Users className="mx-auto mb-2 h-10 w-10 opacity-30" />{text}</div>;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: "slate" | "indigo" | "amber" | "emerald" }) {
  const classes = { slate: "bg-slate-50 text-slate-700", indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-50 text-amber-700", emerald: "bg-emerald-50 text-emerald-700" }[tone];
  return <div className={`${classes} rounded-xl p-4 text-center`}><p className="text-xl font-black">{value}</p><p className="mt-0.5 text-xs text-slate-600">{label}</p></div>;
}
