import { useState } from "react";
import {
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  BookOpen,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { ContactFormModal } from "./ContactFormModal";
import {
  type ContactFormValues,
  validateContactForm,
} from "../lib/contactForm";

type SupplierForm = ContactFormValues;

type SupplierCard = {
  _id: Id<"suppliers">;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
};

const emptyForm: SupplierForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

const ledgerTypeLabels: Record<string, string> = {
  opening_balance: "رصيد افتتاحي",
  purchase_receipt: "استلام شراء",
  purchase_return: "مرتجع شراء",
  supplier_payment: "دفعة مورد",
  supplier_refund: "رد من المورد",
  adjustment: "تسوية",
  reversal: "عكس",
};

export function SuppliersPage() {
  const canCreate = usePermission("create_suppliers");
  const canEdit = usePermission("edit_suppliers");
  const canSetActive = usePermission("delete_suppliers");
  const canViewSupplierLedger = usePermission("view_supplier_ledger");
  const me = useQuery(api.employees.me);
  const suppliersQuery = useQuery(api.suppliers.list);
  const suppliers = suppliersQuery ?? [];
  const branches = useQuery(
    api.suppliers.availableBranches,
    canViewSupplierLedger ? {} : "skip",
  );
  const createSupplier = useMutation(api.suppliers.create);
  const updateSupplier = useMutation(api.suppliers.update);
  const setSupplierActive = useMutation(api.suppliers.setActive);

  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] =
    useState<Id<"branches"> | null>(null);
  const [ledgerTarget, setLedgerTarget] = useState<SupplierCard | null>(null);
  const [editingId, setEditingId] = useState<Id<"suppliers"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"suppliers"> | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const formValidation = validateContactForm(form);

  const effectiveBranch = me?.branchId ?? selectedBranch;
  const requiresLedgerBranchSelection = Boolean(
    canViewSupplierLedger &&
      me &&
      !me.branchId &&
      (branches?.length ?? 0) > 0 &&
      !selectedBranch,
  );
  const supplierBalanceArgs =
    canViewSupplierLedger && effectiveBranch
      ? { branchId: effectiveBranch }
      : "skip";
  const supplierBalances = useQuery(
    api.suppliers.branchBalances,
    supplierBalanceArgs,
  );
  const ledgerArgs =
    canViewSupplierLedger && effectiveBranch && ledgerTarget
      ? {
          supplierId: ledgerTarget._id,
          branchId: effectiveBranch,
        }
      : "skip";
  const {
    results: ledgerEntries,
    status: ledgerStatus,
    loadMore: loadMoreLedger,
  } = usePaginatedQuery(api.suppliers.ledger, ledgerArgs, {
    initialNumItems: 15,
  });

  const balanceFor = (supplierId: Id<"suppliers">) =>
    supplierBalances?.find((balance) => balance.supplierId === supplierId)
      ?.balance;
  const hasSupplierBalanceScope =
    supplierBalances !== undefined && Boolean(effectiveBranch);
  const filtered = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      supplier.phone.includes(search.trim()),
  );
  const supplierBranchStatus = (() => {
    if (!canViewSupplierLedger) return null;
    if (me === undefined || (!me.branchId && branches === undefined)) {
      return "جارٍ تحميل فروع الأرصدة";
    }
    if (!me?.branchId && (branches?.length ?? 0) === 0) {
      return "لا توجد فروع نشطة لعرض أرصدة الموردين";
    }
    if (requiresLedgerBranchSelection) {
      return "اختر فرعًا لعرض أرصدة ودفاتر الموردين";
    }
    if (effectiveBranch && supplierBalances === undefined) {
      return "جارٍ تحميل أرصدة الموردين للفرع المحدد";
    }
    return null;
  })();

  const handleSupplierBranchChange = (value: string) => {
    setSelectedBranch(value ? value as Id<"branches"> : null);
    setLedgerTarget(null);
  };

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

  const openEdit = (supplier: SupplierCard) => {
    setEditingId(supplier._id);
    setForm({
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!formValidation.ok) {
      toast.error(formValidation.reason);
      return;
    }
    const { payload, normalizedForm } = formValidation;
    setForm(normalizedForm);
    setSaving(true);
    try {
      if (editingId) {
        await updateSupplier({ id: editingId, ...payload });
        toast.success("تم تحديث بيانات المورد");
      } else {
        await createSupplier(payload);
        toast.success("تمت إضافة المورد");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          editingId ? "تعذر تحديث المورد" : "تعذر إضافة المورد",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (
    id: Id<"suppliers">,
    name: string,
    isActive: boolean,
  ) => {
    if (updatingId) return;
    const message = isActive
      ? `هل تريد إعادة تفعيل المورد ${name}؟`
      : `هل تريد تعطيل المورد ${name}؟ لن يظهر في المعاملات الجديدة.`;
    if (!window.confirm(message)) return;
    setUpdatingId(id);
    try {
      await setSupplierActive({ id, isActive });
      toast.success(isActive ? "تمت إعادة تفعيل المورد" : "تم تعطيل المورد");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          isActive ? "تعذر إعادة تفعيل المورد" : "تعذر تعطيل المورد",
        ),
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-600" />
            الموردون
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {suppliersQuery === undefined
              ? "جارٍ تحميل الموردين"
              : `${suppliers.length} مورد`}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openCreate}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            مورد جديد
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="form-input pr-10"
            placeholder="بحث بالاسم أو الهاتف..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {canViewSupplierLedger && !me?.branchId && branches && branches.length > 0 && (
          <select
            className="form-input sm:max-w-xs"
            aria-label="فرع أرصدة الموردين"
            value={selectedBranch ?? ""}
            onChange={(event) => handleSupplierBranchChange(event.target.value)}
          >
            <option value="">اختر فرع الأرصدة</option>
            {branches.map((branch) => (
              <option key={branch._id} value={branch._id}>
                {branch.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {supplierBranchStatus && (
        <p
          role="status"
          className="rounded-xl bg-slate-100 p-3 text-sm font-medium text-slate-700"
        >
          {supplierBranchStatus}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((supplier) => (
          <article
            key={supplier._id}
            className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md ${
              supplier.isActive === false ? "opacity-70 grayscale-[25%]" : ""
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800">{supplier.name}</p>
                <span
                  className={`badge ${
                    supplier.isActive === false
                      ? "badge-danger"
                      : "badge-success"
                  }`}
                >
                  {supplier.isActive === false ? "معطل" : "نشط"}
                </span>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {supplier.phone}
                </p>
              </div>
            </div>
            {supplier.email && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                <Mail className="w-3 h-3" />
                {supplier.email}
              </p>
            )}
            {supplier.address && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                <MapPin className="w-3 h-3" />
                {supplier.address}
              </p>
            )}
            {canViewSupplierLedger && (
              <div className="pt-3 border-t border-slate-100 flex justify-between gap-3">
                <p className="text-xs text-slate-500">الرصيد المستحق</p>
                <p className="font-bold text-sm text-amber-600 text-left">
                  {requiresLedgerBranchSelection
                    ? "اختر فرع الأرصدة"
                    : effectiveBranch && supplierBalances === undefined
                      ? "جارٍ تحميل رصيد الفرع"
                      : hasSupplierBalanceScope
                        ? `${(balanceFor(supplier._id) ?? 0).toLocaleString("ar-EG")} ج.م`
                        : "—"}
                </p>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {canEdit && (
                <button
                  onClick={() => openEdit(supplier)}
                  className="btn-secondary text-xs flex items-center justify-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  تعديل
                </button>
              )}
              {canViewSupplierLedger && hasSupplierBalanceScope && (
                <button
                  onClick={() => setLedgerTarget(supplier)}
                  className="btn-secondary text-xs flex items-center justify-center gap-1"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  دفتر المورد
                </button>
              )}
            </div>
            {canSetActive && (
              <button
                disabled={updatingId !== null}
                onClick={() =>
                  void handleSetActive(
                    supplier._id,
                    supplier.name,
                    supplier.isActive === false,
                  )
                }
                className={`mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold ${
                  supplier.isActive === false
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {updatingId === supplier._id
                  ? "جارٍ التحديث..."
                  : supplier.isActive === false
                    ? "إعادة تفعيل المورد"
                    : "تعطيل المورد"}
              </button>
            )}
          </article>
        ))}
        {suppliersQuery === undefined && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            جارٍ تحميل الموردين
          </div>
        )}
        {suppliersQuery !== undefined && suppliers.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد موردون
          </div>
        )}
        {suppliers.length > 0 && filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا توجد نتائج مطابقة للبحث
          </div>
        )}
      </div>

      {showForm && (
        <ContactFormModal
          title={editingId ? "تعديل بيانات المورد" : "إضافة مورد جديد"}
          nameLabel="اسم المورد *"
          form={form}
          saving={saving}
          validation={formValidation}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}

      {ledgerTarget && effectiveBranch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <section className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <header className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  دفتر المورد — {ledgerTarget.name}
                </h2>
                <p className="text-sm text-slate-500">
                  الرصيد الحالي:{" "}
                  {(balanceFor(ledgerTarget._id) ?? 0).toLocaleString("ar-EG")} ج.م
                </p>
              </div>
              <button
                onClick={() => setLedgerTarget(null)}
                className="p-2 hover:bg-slate-100 rounded-lg"
                aria-label="إغلاق دفتر المورد"
              >
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="overflow-y-auto divide-y">
              {ledgerStatus === "LoadingFirstPage" && (
                <p className="p-8 text-center text-slate-400">جارٍ تحميل دفتر المورد</p>
              )}
              {ledgerEntries.map((entry) => (
                <article key={entry._id} className="p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-bold">
                        {ledgerTypeLabels[entry.type] ?? entry.type}
                      </p>
                      <p className="text-xs text-slate-500">
                        {entry.entryNumber} · {entry.referenceNumber}
                      </p>
                    </div>
                    <div className="text-left">
                      <p
                        className={
                          entry.amountDelta >= 0
                            ? "font-bold text-amber-700"
                            : "font-bold text-emerald-700"
                        }
                      >
                        {entry.amountDelta.toLocaleString("ar-EG")} ج.م
                      </p>
                      <p className="text-xs text-slate-500">{entry.date}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-slate-600">{entry.description}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    الرصيد: {entry.balanceBefore.toLocaleString("ar-EG")} ←{" "}
                    {entry.balanceAfter.toLocaleString("ar-EG")}
                    {entry.status === "reversed" ? " · معكوس" : ""}
                  </p>
                </article>
              ))}
              {ledgerEntries.length === 0 && ledgerStatus === "Exhausted" && (
                <p className="p-8 text-center text-slate-400">
                  لا توجد حركات لهذا المورد في الفرع المحدد
                </p>
              )}
            </div>
            {ledgerStatus === "CanLoadMore" && (
              <footer className="p-4 border-t">
                <button
                  onClick={() => loadMoreLedger(15)}
                  className="btn-secondary w-full"
                >
                  تحميل المزيد
                </button>
              </footer>
            )}
            {ledgerStatus === "LoadingMore" && (
              <footer className="p-4 border-t text-center text-sm text-slate-400">
                جارٍ تحميل المزيد
              </footer>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

