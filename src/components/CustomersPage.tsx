import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  BookOpen,
  CalendarDays,
  Edit3,
  FileText,
  FilterX,
  Mail,
  MapPin,
  NotebookText,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Tags,
  Truck,
  UserCheck,
  UserRound,
  UserX,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { type ContactFormValues, validateContactForm } from "../lib/contactForm";
import { getErrorMessage } from "../lib/errors";
import { useCurrency } from "../lib/utils";
import { ContactFormModal } from "./ContactFormModal";

type CustomerForm = ContactFormValues;

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
type ProfileTab = "overview" | "invoices" | "account" | "notes";

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

const transactionLabels: Record<string, string> = {
  opening_balance: "رصيد افتتاحي",
  invoice_charge: "استحقاق فاتورة",
  invoice_adjustment: "تعديل فاتورة",
  invoice_cancel: "إلغاء فاتورة",
  invoice_payment: "تحصيل فاتورة",
  invoice_refund: "استرداد فاتورة",
  sales_return: "مرتجع مبيعات",
  sales_return_reversal: "عكس مرتجع مبيعات",
  order_deposit: "عربون طلب",
  order_deposit_application: "تسوية عربون",
  delivery_cod_collection: "تحصيل شحن",
  delivery_cod_reversal: "عكس تحصيل شحن",
  order_refund: "استرداد طلب",
  repair_charge: "تكلفة صيانة",
  repair_adjustment: "تعديل صيانة",
  repair_cancel: "إلغاء صيانة",
  repair_payment: "تحصيل صيانة",
  repair_refund: "استرداد صيانة",
  reversal: "قيد عكسي",
};

const invoiceStatusLabels: Record<string, string> = {
  paid: "مدفوعة",
  partial: "جزئي",
  unpaid: "معلقة",
  cancelled: "ملغاة",
  partial_return: "مرتجعة جزئيًا",
  paid_returned_partial: "مدفوعة ومرتجعة جزئيًا",
  returned: "مرتجعة بالكامل",
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
  const [profileTab, setProfileTab] = useState<ProfileTab>("overview");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"customers"> | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [categoryId, setCategoryId] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const formValidation = validateContactForm(form);

  const branchesQuery = useQuery(api.branches.list, canViewBranches && !me?.branchId ? {} : "skip");
  const branches = branchesQuery ?? [];
  const effectiveBranchId = me?.branchId ?? (selectedBranchId ? selectedBranchId as Id<"branches"> : null);
  const requiresBranchSelection = Boolean(me && !me.branchId && canViewBranches && branches.length > 0 && !selectedBranchId);
  const noCustomerBranchAvailable = Boolean(me && !me.branchId && canViewBranches && branchesQuery !== undefined && branches.length === 0);
  const missingCustomerBranchAccess = Boolean(me && !me.branchId && !canViewBranches);

  const customerArgs = me && effectiveBranchId ? { branchId: effectiveBranchId } : "skip";
  const customersQuery = useQuery(api.customers.list, customerArgs);
  const customers = (customersQuery ?? []) as CustomerRow[];
  const customersLoaded = customersQuery !== undefined;
  const balances = useQuery(
    api.customerLedger.branchBalances,
    canViewLedger && effectiveBranchId ? { branchId: effectiveBranchId } : "skip",
  ) as CustomerBalance[] | undefined;
  const balancesLoading = canViewLedger && Boolean(effectiveBranchId) && balances === undefined;
  const hasBalanceScope = canViewLedger && Boolean(effectiveBranchId) && balances !== undefined;
  const categories = useQuery(api.contactCategories.list, { type: "customer" }) ?? [];
  const profile = useQuery(api.customers.profile, profileId ? { id: profileId } : "skip");

  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const setCustomerActive = useMutation(api.customers.setActive);
  const createCategory = useMutation(api.contactCategories.create);

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

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setCategoryId("");
  };

  const handleCustomerBranchChange = (value: string) => {
    if (saving || updatingId !== null) return;
    setSelectedBranchId(value);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setCategoryId("");
    setProfileId(null);
    resetFilters();
  };

  const openCreate = () => {
    if (!effectiveBranchId) {
      toast.error("اختر فرع العميل أولًا");
      return;
    }
    setEditingId(null);
    setForm(emptyForm);
    setCategoryId("");
    setShowForm(true);
  };

  useEffect(() => {
    if (createRequestToken && canCreate) openCreate();
  }, [createRequestToken, canCreate]);

  useEffect(() => {
    if (!profileId) return;
    setProfileTab("overview");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [profileId]);

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
      setCategoryId("");
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
            <button data-testid="customer-create-open" type="button" className="btn-primary" disabled={!effectiveBranchId && !onCreateCustomer} onClick={() => onCreateCustomer ? onCreateCustomer() : openCreate()}>
              <Plus className="h-4 w-4" />عميل جديد
            </button>
          )}
        </div>
      </div>

      {showCategoryForm && (
        <form onSubmit={handleCreateCategory} className="professional-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1"><label className="form-label">اسم تصنيف العملاء</label><input autoFocus className="form-input" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={80} placeholder="مثال: عملاء جملة" /></div>
          <button className="btn-primary" disabled={savingCategory || !categoryName.trim()}>{savingCategory ? "جارٍ الحفظ…" : "حفظ التصنيف"}</button>
          <button type="button" className="btn-secondary" onClick={() => { setShowCategoryForm(false); setCategoryName(""); }}>إلغاء</button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي العملاء" value={customersLoaded ? customers.length : "—"} tone="slate" />
        <Stat label="العملاء النشطون" value={customersLoaded ? customers.filter((row) => row.isActive !== false).length : "—"} tone="indigo" />
        <Stat label="عملاء بمديونية" value={balancesLoading ? "…" : debtCustomers === null ? "—" : debtCustomers} tone="amber" />
        <Stat label="إجمالي المديونيات" value={balancesLoading ? "…" : totalDebt === null ? "—" : formatCurrency(totalDebt)} tone="emerald" />
      </div>

      <div className="erp-toolbar flex-col gap-2 lg:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="customer-search"
            className="form-input w-full pr-10"
            placeholder="بحث بالاسم أو الهاتف أو البريد الإلكتروني..."
            value={search}
            disabled={!customersLoaded}
            title={!customersLoaded ? "اختر الفرع وانتظر تحميل العملاء" : undefined}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {canViewBranches && !me?.branchId && branches.length > 0 && (
          <select
            data-testid="customer-branch-select"
            className="form-input lg:w-44"
            value={selectedBranchId}
            disabled={saving || updatingId !== null}
            onChange={(event) => handleCustomerBranchChange(event.target.value)}
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
                  <tr key={customer._id} data-testid="customer-card" data-customer-name={customer.name} data-customer-active={String(isActive)} className={`invoice-row-compact cursor-pointer ${isActive ? "" : "opacity-70"}`} tabIndex={0} onClick={() => setProfileId(customer._id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setProfileId(customer._id); } }}>
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
                        {canViewLedger && <button type="button" className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700" onClick={(event) => { event.stopPropagation(); openLedger(customer); }}><span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />حساب العميل</span></button>}
                        {canSetActive && (
                          <button type="button" disabled={updatingId !== null} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${isActive ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`} onClick={(event) => { event.stopPropagation(); void handleSetActive(customer, !isActive); }}>
                            <span className="flex items-center gap-1">{isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}{updatingId === customer._id ? "جارٍ التحديث..." : isActive ? "تعطيل" : "تفعيل"}</span>
                          </button>
                        )}
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
        {customers.length > 0 && filtered.length === 0 && <EmptyState text="لا توجد نتائج مطابقة للبحث" />}
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

      {profileId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-[2px] sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfileId(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="بطاقة العميل"
            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            {profile === undefined ? (
              <div className="grid min-h-72 place-items-center p-10 text-center text-slate-500">
                <div><div className="mx-auto mb-3 h-9 w-9 animate-pulse rounded-full bg-slate-200" /><p>جارٍ تحميل بطاقة العميل…</p></div>
              </div>
            ) : (
              <>
                <header className="flex flex-col gap-4 border-b border-slate-100 bg-white px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-900 text-lg font-black text-white sm:h-14 sm:w-14">
                      {profile.customer.name.trim().charAt(0) || "ع"}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="erp-kicker">بطاقة العميل</span>
                        <span className={`badge ${profile.customer.isActive === false ? "badge-danger" : "badge-success"}`}>
                          {profile.customer.isActive === false ? "معطل" : "نشط"}
                        </span>
                        {profile.customer.categoryName && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{profile.customer.categoryName}</span>}
                      </div>
                      <h2 className="truncate text-xl font-black text-slate-900 sm:text-2xl">{profile.customer.name}</h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 sm:text-sm">
                        <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /><span dir="ltr">{profile.customer.phone}</span></span>
                        {profile.customer.email && <span className="flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5" /><span className="truncate">{profile.customer.email}</span></span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {canEdit && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setProfileId(null);
                          openEdit(profile.customer);
                        }}
                      >
                        <Edit3 className="h-4 w-4" />تعديل
                      </button>
                    )}
                    {canViewLedger && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          setProfileId(null);
                          openLedger(profile.customer);
                        }}
                      >
                        <BookOpen className="h-4 w-4" />حساب العميل
                      </button>
                    )}
                    <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" onClick={() => setProfileId(null)} aria-label="إغلاق بطاقة العميل">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </header>

                <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-3 py-2 sm:px-5" aria-label="أقسام بطاقة العميل">
                  <ProfileTabButton active={profileTab === "overview"} onClick={() => setProfileTab("overview")} icon={<Activity className="h-4 w-4" />}>نظرة عامة</ProfileTabButton>
                  <ProfileTabButton active={profileTab === "invoices"} onClick={() => setProfileTab("invoices")} icon={<FileText className="h-4 w-4" />}>الفواتير</ProfileTabButton>
                  <ProfileTabButton active={profileTab === "account"} onClick={() => setProfileTab("account")} icon={<BookOpen className="h-4 w-4" />}>الحساب</ProfileTabButton>
                  <ProfileTabButton active={profileTab === "notes"} onClick={() => setProfileTab("notes")} icon={<NotebookText className="h-4 w-4" />}>البيانات والملاحظات</ProfileTabButton>
                </nav>

                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-3 sm:p-5">
                  {profileTab === "overview" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <ProfileMetric
                          label="الرصيد المستحق"
                          value={formatCurrency(profile.balance?.receivableBalance ?? 0)}
                          icon={<BookOpen className="h-5 w-5" />}
                          tone="amber"
                        />
                        <ProfileMetric
                          label="إجمالي المشتريات"
                          value={formatCurrency(profile.balance?.totalPurchases ?? 0)}
                          icon={<ShoppingBag className="h-5 w-5" />}
                          tone="emerald"
                        />
                        <ProfileMetric
                          label="فواتير المبيعات"
                          value={formatAmount(profile.invoices.length)}
                          icon={<FileText className="h-5 w-5" />}
                          tone="indigo"
                        />
                        <ProfileMetric
                          label="الصيانة والشحن"
                          value={formatAmount(profile.repairs.length + profile.deliveries.length)}
                          icon={<Wrench className="h-5 w-5" />}
                          tone="slate"
                        />
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
                            <div>
                              <h3 className="font-black text-slate-900">آخر التعاملات</h3>
                              <p className="mt-0.5 text-xs text-slate-400">آخر الحركات المسجلة على حساب العميل</p>
                            </div>
                            {profile.ledger.length > 8 && (
                              <button type="button" className="text-xs font-bold text-[var(--erp-accent)]" onClick={() => setProfileTab("account")}>عرض الكل</button>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] text-sm">
                              <thead className="bg-slate-50 text-xs text-slate-500">
                                <tr><th className="px-4 py-2.5 text-right font-bold">التاريخ</th><th className="px-4 py-2.5 text-right font-bold">النوع</th><th className="px-4 py-2.5 text-right font-bold">المرجع</th><th className="px-4 py-2.5 text-right font-bold">الحركة</th><th className="px-4 py-2.5 text-right font-bold">الرصيد</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {profile.ledger.slice(0, 8).map((entry) => {
                                  const amount = ledgerEntryAmount(entry);
                                  return (
                                    <tr key={entry._id} className="hover:bg-slate-50/70">
                                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatIsoDate(entry.date)}</td>
                                      <td className="px-4 py-3"><p className="font-bold text-slate-700">{transactionLabels[entry.type] ?? entry.type}</p><p className="mt-0.5 max-w-72 truncate text-xs text-slate-400">{entry.description}</p></td>
                                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500" dir="ltr">{entry.referenceNumber || entry.entryNumber}</td>
                                      <td className={`whitespace-nowrap px-4 py-3 font-black ${entry.receivableDelta > 0 ? "text-amber-700" : entry.receivableDelta < 0 ? "text-emerald-700" : "text-slate-600"}`}>{formatCurrency(amount)}</td>
                                      <td className="whitespace-nowrap px-4 py-3 font-black text-slate-800">{formatCurrency(entry.receivableAfter)}</td>
                                    </tr>
                                  );
                                })}
                                {profile.ledger.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">لا توجد تعاملات مسجلة لهذا العميل.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="mb-4 flex items-center justify-between">
                            <div><h3 className="font-black text-slate-900">بيانات العميل</h3><p className="mt-0.5 text-xs text-slate-400">البيانات الأساسية المسجلة</p></div>
                            <UserRound className="h-5 w-5 text-slate-300" />
                          </div>
                          <div className="divide-y divide-slate-100">
                            <ProfileInfoRow icon={<Phone className="h-4 w-4" />} label="رقم الهاتف" value={<span dir="ltr">{profile.customer.phone}</span>} />
                            <ProfileInfoRow icon={<Tags className="h-4 w-4" />} label="التصنيف" value={profile.customer.categoryName || "بدون تصنيف"} />
                            <ProfileInfoRow icon={<Mail className="h-4 w-4" />} label="البريد الإلكتروني" value={profile.customer.email || "غير مسجل"} />
                            <ProfileInfoRow icon={<MapPin className="h-4 w-4" />} label="العنوان" value={profile.customer.address || "غير مسجل"} />
                          </div>
                          <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
                            <p className="mb-1 text-[11px] font-bold text-slate-400">ملاحظات</p>
                            <p className="text-sm leading-6 text-slate-600">{profile.customer.notes || "لا توجد ملاحظات على العميل."}</p>
                          </div>
                        </section>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <CompactCount icon={<FileText className="h-4 w-4" />} label="فواتير" value={profile.invoices.length} />
                        <CompactCount icon={<ShoppingBag className="h-4 w-4" />} label="طلبات بيع" value={profile.orders.length} />
                        <CompactCount icon={<Wrench className="h-4 w-4" />} label="صيانة" value={profile.repairs.length} />
                        <CompactCount icon={<Truck className="h-4 w-4" />} label="شحن" value={profile.deliveries.length} />
                      </div>
                    </div>
                  )}

                  {profileTab === "invoices" && (
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div><h3 className="font-black text-slate-900">فواتير العميل</h3><p className="mt-0.5 text-xs text-slate-400">{formatAmount(profile.invoices.length)} فاتورة مرتبطة بالعميل</p></div>
                        <span className="text-sm font-black text-slate-700">إجمالي المشتريات: {formatCurrency(profile.balance?.totalPurchases ?? 0)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="data-table min-w-[860px]">
                          <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead>
                          <tbody>
                            {[...profile.invoices].sort((a, b) => b._creationTime - a._creationTime).map((invoice) => (
                              <tr key={invoice._id} className="invoice-row-compact">
                                <td className="font-mono text-xs font-black" dir="ltr">{invoice.invoiceNumber}</td>
                                <td className="text-xs text-slate-500">{new Date(invoice._creationTime).toLocaleDateString("ar-EG-u-nu-latn")}</td>
                                <td className="font-bold">{formatCurrency(invoice.netTotal ?? invoice.total)}</td>
                                <td className="font-bold text-emerald-700">{formatCurrency(invoice.paid)}</td>
                                <td className={invoice.remaining > 0 ? "font-bold text-amber-700" : "text-slate-400"}>{formatCurrency(invoice.remaining)}</td>
                                <td><span className={`badge ${invoice.status === "paid" ? "badge-success" : invoice.status === "cancelled" || invoice.status === "returned" ? "badge-danger" : "badge-warning"}`}>{invoiceStatusLabels[invoice.status] ?? invoice.status}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {profile.invoices.length === 0 && <div className="py-14 text-center text-sm text-slate-400">لا توجد فواتير مرتبطة بهذا العميل.</div>}
                    </section>
                  )}

                  {profileTab === "account" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <AccountSummary label="مديونية مستحقة" value={formatCurrency(profile.balance?.receivableBalance ?? 0)} tone="amber" />
                        <AccountSummary label="رصيد مقدم" value={formatCurrency(profile.balance?.advanceBalance ?? 0)} tone="emerald" />
                        <AccountSummary label="إجمالي المشتريات" value={formatCurrency(profile.balance?.totalPurchases ?? 0)} tone="indigo" />
                      </div>
                      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                          <div><h3 className="font-black text-slate-900">حركة حساب العميل</h3><p className="mt-0.5 text-xs text-slate-400">آخر {formatAmount(Math.min(profile.ledger.length, 40))} حركة</p></div>
                          {canViewLedger && <button type="button" className="btn-secondary" onClick={() => { setProfileId(null); openLedger(profile.customer); }}><BookOpen className="h-4 w-4" />فتح كشف الحساب الكامل</button>}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="data-table min-w-[920px]">
                            <thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th>مديونية</th><th>رصيد مقدم</th><th>الرصيد بعد الحركة</th></tr></thead>
                            <tbody>
                              {profile.ledger.slice(0, 40).map((entry) => (
                                <tr key={entry._id} className="invoice-row-compact">
                                  <td className="text-xs text-slate-500">{formatIsoDate(entry.date)}</td>
                                  <td><p className="font-bold text-slate-700">{transactionLabels[entry.type] ?? entry.type}</p><p className="mt-0.5 max-w-80 truncate text-xs text-slate-400">{entry.description}</p></td>
                                  <td className="font-mono text-xs" dir="ltr">{entry.referenceNumber || entry.entryNumber}</td>
                                  <td className={entry.receivableDelta === 0 ? "text-slate-300" : entry.receivableDelta > 0 ? "font-bold text-amber-700" : "font-bold text-emerald-700"}>{entry.receivableDelta === 0 ? "—" : formatCurrency(entry.receivableDelta)}</td>
                                  <td className={entry.advanceDelta === 0 ? "text-slate-300" : "font-bold text-indigo-700"}>{entry.advanceDelta === 0 ? "—" : formatCurrency(entry.advanceDelta)}</td>
                                  <td className="font-black">{formatCurrency(entry.receivableAfter)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {profile.ledger.length === 0 && <div className="py-14 text-center text-sm text-slate-400">لا توجد حركات على حساب العميل.</div>}
                      </section>
                    </div>
                  )}

                  {profileTab === "notes" && (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-5 flex items-center gap-2"><UserRound className="h-5 w-5 text-[var(--erp-accent)]" /><div><h3 className="font-black text-slate-900">البيانات الأساسية</h3><p className="text-xs text-slate-400">بيانات التواصل والتصنيف</p></div></div>
                        <div className="divide-y divide-slate-100">
                          <ProfileInfoRow icon={<Phone className="h-4 w-4" />} label="رقم الهاتف" value={<span dir="ltr">{profile.customer.phone}</span>} />
                          <ProfileInfoRow icon={<Mail className="h-4 w-4" />} label="البريد الإلكتروني" value={profile.customer.email || "غير مسجل"} />
                          <ProfileInfoRow icon={<MapPin className="h-4 w-4" />} label="العنوان" value={profile.customer.address || "غير مسجل"} />
                          <ProfileInfoRow icon={<Tags className="h-4 w-4" />} label="التصنيف" value={profile.customer.categoryName || "بدون تصنيف"} />
                          <ProfileInfoRow icon={<CalendarDays className="h-4 w-4" />} label="حالة الحساب" value={profile.customer.isActive === false ? "معطل" : "نشط"} />
                        </div>
                      </section>
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-5 flex items-center gap-2"><NotebookText className="h-5 w-5 text-[var(--erp-accent)]" /><div><h3 className="font-black text-slate-900">الملاحظات</h3><p className="text-xs text-slate-400">معلومات داخلية تساعد فريق العمل</p></div></div>
                        <div className="min-h-44 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                          {profile.customer.notes || "لا توجد ملاحظات مسجلة لهذا العميل."}
                        </div>
                        {canEdit && <button type="button" className="btn-secondary mt-4" onClick={() => { setProfileId(null); openEdit(profile.customer); }}><Edit3 className="h-4 w-4" />تعديل بيانات العميل</button>}
                      </section>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ledgerEntryAmount(entry: Doc<"customerLedgerEntries">) {
  const movement = entry.receivableDelta !== 0
    ? entry.receivableDelta
    : entry.advanceDelta !== 0
      ? entry.advanceDelta
      : entry.purchasesDelta;
  return Math.abs(movement);
}

function formatIsoDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("ar-EG-u-nu-latn");
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-12 text-center text-slate-400"><Users className="mx-auto mb-2 h-10 w-10 opacity-30" />{text}</div>;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: "slate" | "indigo" | "amber" | "emerald" }) {
  const classes = { slate: "bg-slate-50 text-slate-700", indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-50 text-amber-700", emerald: "bg-emerald-50 text-emerald-700" }[tone];
  return <div className={`${classes} rounded-xl p-4 text-center`}><p className="text-xl font-black">{value}</p><p className="mt-0.5 text-xs text-slate-600">{label}</p></div>;
}

function ProfileTabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition sm:text-sm ${active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/70 hover:text-slate-800"}`}
    >
      {icon}{children}
    </button>
  );
}

function ProfileMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "slate" | "indigo" | "amber" | "emerald";
}) {
  const styles = {
    slate: "border-slate-200 bg-white text-slate-700",
    indigo: "border-indigo-100 bg-indigo-50/70 text-indigo-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-800",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3.5 shadow-sm sm:p-4 ${styles}`}>
      <div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{label}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/80 shadow-sm">{icon}</span></div>
      <p className="truncate text-lg font-black sm:text-xl">{value}</p>
    </div>
  );
}

function ProfileInfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3 py-3 text-sm sm:grid-cols-[130px_minmax(0,1fr)]">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-400">{icon}{label}</span>
      <span className="min-w-0 break-words font-bold text-slate-700">{value}</span>
    </div>
  );
}

function CompactCount({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-500">{icon}{label}</span>
      <span className="text-base font-black text-slate-800">{value.toLocaleString("ar-EG-u-nu-latn")}</span>
    </div>
  );
}

function AccountSummary({ label, value, tone }: { label: string; value: string; tone: "amber" | "emerald" | "indigo" }) {
  const classes = {
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
  }[tone];
  return <div className={`rounded-2xl border p-4 ${classes}`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>;
}
