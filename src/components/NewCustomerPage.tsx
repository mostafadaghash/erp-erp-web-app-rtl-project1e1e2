import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  StickyNote,
  Tags,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import {
  type ContactFormValues,
  validateContactForm,
} from "../lib/contactForm";
import { getErrorMessage } from "../lib/errors";

const EMPTY_FORM: ContactFormValues = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export function NewCustomerPage({
  onClose,
  onSaved,
}: {
  onClose: (reason: "saved" | "cancel") => void;
  onSaved?: () => void;
}) {
  const canViewBranches = usePermission("view_branches");
  const canCreateCategories = usePermission("edit_customers");
  const me = useQuery(api.employees.me);
  const branchesQuery = useQuery(
    api.branches.list,
    canViewBranches && !me?.branchId ? {} : "skip",
  );
  const categories = useQuery(api.contactCategories.list, { type: "customer" }) ?? [];
  const createCustomer = useMutation(api.customers.create);
  const createCategory = useMutation(api.contactCategories.create);

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [form, setForm] = useState<ContactFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const branches = (branchesQuery ?? []).filter((branch) => branch.isActive);
  const effectiveBranchId = me?.branchId ??
    (selectedBranchId ? selectedBranchId as Id<"branches"> : null);
  const validation = validateContactForm(form);

  useEffect(() => {
    if (me?.branchId || selectedBranchId || branches.length !== 1) return;
    const onlyBranch = branches[0];
    if (onlyBranch) setSelectedBranchId(String(onlyBranch._id));
  }, [branches, me?.branchId, selectedBranchId]);

  const updateField = (field: keyof ContactFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveCustomer = async (keepOpen: boolean) => {
    if (saving) return;
    setAttempted(true);

    if (!effectiveBranchId) {
      toast.error("اختر فرع العميل أولًا");
      return;
    }
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }

    setSaving(true);
    try {
      await createCustomer({
        ...validation.payload,
        branchId: effectiveBranchId,
        categoryId: categoryId ? categoryId as Id<"customerCategories"> : undefined,
      });
      toast.success("تمت إضافة العميل بنجاح");

      if (keepOpen) {
        setForm(EMPTY_FORM);
        setCategoryId("");
        setAttempted(false);
        onSaved?.();
        return;
      }
      onClose("saved");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إضافة العميل"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    const name = categoryName.trim();
    if (!name || savingCategory) return;

    setSavingCategory(true);
    try {
      const newCategoryId = await createCategory({ type: "customer", name });
      setCategoryId(String(newCategoryId));
      setCategoryName("");
      setShowCategoryForm(false);
      toast.success("تمت إضافة التصنيف");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إضافة التصنيف"));
    } finally {
      setSavingCategory(false);
    }
  };

  const fieldError = (field: keyof ContactFormValues) =>
    attempted && !validation.ok ? validation.errors[field] : undefined;

  return (
    <div data-testid="new-customer-page" className="mx-auto w-full max-w-6xl p-4 lg:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="erp-kicker">العملاء</p>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
            <UserPlus className="h-6 w-6 text-[var(--brand-primary)]" />
            إضافة عميل جديد
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            سجّل بيانات العميل الأساسية مرة واحدة لتظهر في الفواتير والحسابات والصيانة والشحن.
          </p>
        </div>
        <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => onClose("cancel")} disabled={saving}>
          <ArrowRight className="h-4 w-4" />
          قائمة العملاء
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveCustomer(false);
        }}
        className="space-y-5"
      >
        <section className="professional-panel overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
            <h3 className="flex items-center gap-2 font-black text-slate-800">
              <UserRound className="h-4 w-4 text-[var(--brand-primary)]" />
              البيانات الأساسية
            </h3>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="اسم العميل *" error={fieldError("name")}>
              <input
                data-testid="new-customer-name"
                autoFocus
                className={`form-input ${fieldError("name") ? "border-rose-300" : ""}`}
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="مثال: أحمد محمد"
                maxLength={100}
                disabled={saving}
              />
            </Field>

            <Field label="رقم الهاتف *" error={fieldError("phone")}>
              <div className="relative">
                <Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="new-customer-phone"
                  className={`form-input pr-10 ${fieldError("phone") ? "border-rose-300" : ""}`}
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  inputMode="tel"
                  dir="ltr"
                  placeholder="01000000000"
                  disabled={saving}
                />
              </div>
            </Field>

            <Field label="البريد الإلكتروني" error={fieldError("email")}>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="new-customer-email"
                  className={`form-input pr-10 ${fieldError("email") ? "border-rose-300" : ""}`}
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  type="email"
                  dir="ltr"
                  placeholder="customer@example.com"
                  maxLength={254}
                  disabled={saving}
                />
              </div>
            </Field>

            <Field label="التصنيف">
              <div className="flex gap-2">
                <select
                  data-testid="new-customer-category"
                  className="form-input min-w-0 flex-1"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  disabled={saving}
                >
                  <option value="">بدون تصنيف</option>
                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>{category.name}</option>
                  ))}
                </select>
                {canCreateCategories && (
                  <button
                    type="button"
                    className="btn-secondary shrink-0 px-3"
                    onClick={() => setShowCategoryForm((value) => !value)}
                    title="إضافة تصنيف جديد"
                    disabled={saving}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Field>
          </div>
        </section>

        {showCategoryForm && canCreateCategories && (
          <section className="professional-panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="تصنيف جديد" className="flex-1">
                <div className="relative">
                  <Tags className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="form-input pr-10"
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void handleCreateCategory();
                    }}
                    placeholder="مثال: عملاء جملة"
                    maxLength={80}
                    disabled={savingCategory}
                  />
                </div>
              </Field>
              <div className="flex gap-2">
                <button type="button" className="btn-primary" onClick={() => void handleCreateCategory()} disabled={!categoryName.trim() || savingCategory}>
                  {savingCategory ? "جارٍ الحفظ…" : "حفظ التصنيف"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setShowCategoryForm(false); setCategoryName(""); }}>
                  إلغاء
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="professional-panel overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
            <h3 className="flex items-center gap-2 font-black text-slate-800">
              <MapPin className="h-4 w-4 text-[var(--brand-primary)]" />
              العنوان والفرع
            </h3>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="العنوان" error={fieldError("address")}>
              <div className="relative">
                <MapPin className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                <textarea
                  data-testid="new-customer-address"
                  className={`form-input min-h-24 resize-y pr-10 ${fieldError("address") ? "border-rose-300" : ""}`}
                  value={form.address}
                  onChange={(event) => updateField("address", event.target.value)}
                  placeholder="المحافظة، المدينة، المنطقة، الشارع..."
                  maxLength={300}
                  disabled={saving}
                />
              </div>
            </Field>

            <Field label="فرع العميل *">
              {me?.branchId ? (
                <div className="flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  فرع العمل الحالي
                </div>
              ) : canViewBranches ? (
                <select
                  data-testid="new-customer-branch"
                  className="form-input"
                  value={selectedBranchId}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                  disabled={saving || branchesQuery === undefined}
                >
                  <option value="">اختر الفرع</option>
                  {branches.map((branch) => (
                    <option key={branch._id} value={branch._id}>{branch.name}</option>
                  ))}
                </select>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  لا يوجد فرع عمل متاح لهذا الحساب.
                </div>
              )}
              {!effectiveBranchId && attempted && (
                <p className="mt-1 text-xs font-bold text-rose-600">اختر فرع العميل قبل الحفظ</p>
              )}
            </Field>
          </div>
        </section>

        <section className="professional-panel overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
            <h3 className="flex items-center gap-2 font-black text-slate-800">
              <StickyNote className="h-4 w-4 text-[var(--brand-primary)]" />
              ملاحظات العميل
            </h3>
          </div>
          <div className="p-5">
            <Field label="ملاحظات داخلية" error={fieldError("notes")}>
              <textarea
                data-testid="new-customer-notes"
                className={`form-input min-h-28 resize-y ${fieldError("notes") ? "border-rose-300" : ""}`}
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="أي ملاحظات مهمة عن العميل تظهر لفريق العمل..."
                maxLength={1000}
                disabled={saving}
              />
            </Field>
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
              يبدأ حساب العميل المالي برصيد صفر. المديونيات والتحصيلات والمرتجعات تُسجّل تلقائيًا في حساب العميل من المستندات المالية بعد إنشائه.
            </div>
          </div>
        </section>

        <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="btn-secondary" onClick={() => onClose("cancel")} disabled={saving}>
            إلغاء والعودة للقائمة
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-secondary flex items-center justify-center gap-2"
              onClick={() => void saveCustomer(true)}
              disabled={saving || !effectiveBranchId}
            >
              <Plus className="h-4 w-4" />
              حفظ وإضافة عميل آخر
            </button>
            <button
              data-testid="new-customer-save"
              type="submit"
              className="btn-primary flex items-center justify-center gap-2 sm:min-w-40"
              disabled={saving || !effectiveBranchId}
            >
              <Save className="h-4 w-4" />
              {saving ? "جارٍ الحفظ…" : "حفظ العميل"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="form-label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-bold text-rose-600">{error}</span>}
    </label>
  );
}
