import { FinancialHistory } from "./FinancialHistory";
import { useEffect, useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import { Wrench, Plus, Search, Clock, CheckCircle, AlertCircle, Copy, MessageCircle, Printer, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PrintModal } from "./PrintTemplate";
import type { PrintData } from "./PrintTemplate";
import { buildEgyptWhatsAppUrl } from "../lib/utils";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { isRepairStatus, REPAIR_TRANSITIONS, type RepairStatus } from "../../shared/businessRules";
import { getErrorMessage } from "../lib/errors";

const statusConfig: Record<RepairStatus, { label: string; badge: string; icon: LucideIcon }> = {
  received: { label: "مستلم", badge: "badge-info", icon: Clock },
  in_progress: { label: "قيد الإصلاح", badge: "badge-warning", icon: Wrench },
  ready: { label: "جاهز للاستلام", badge: "badge-success", icon: CheckCircle },
  delivered: { label: "تم التسليم", badge: "badge-purple", icon: CheckCircle },
  cancelled: { label: "ملغي", badge: "badge-danger", icon: AlertCircle },
};

export function RepairsPage() {
  const canCreate = usePermission("create_repairs");
  const canEdit = usePermission("edit_repairs");
  const canPrint = usePermission("print_repairs");
  const canRefund = usePermission("refund_collections");
  const canViewBranches = usePermission("view_branches");
  const [showForm, setShowForm] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const branches = useQuery(
    api.branches.list,
    canViewBranches ? {} : "skip",
  ) ?? [];
  const repairs = useQuery(api.repairs.list) ?? [];
  const customers = useQuery(api.customers.repairPicker, canCreate ? {} : "skip") ?? [];
  const partPickerGate = canCreate && showForm ? {} : "skip";
  const partOptions = useQuery(
    api.repairs.partPicker,
    partPickerGate !== "skip"
      ? {
          branchId: selectedBranchId
            ? selectedBranchId as Id<"branches">
            : undefined,
        }
      : "skip",
  ) ?? [];
  const [editTarget, setEditTarget] = useState<Doc<"repairs"> | null>(null);
  const technicianOptions = useQuery(
    api.repairs.technicianPicker,
    canEdit && (showForm || editTarget)
      ? {
          branchId: editTarget?.branchId ??
            (selectedBranchId
              ? selectedBranchId as Id<"branches">
              : undefined),
        }
      : "skip",
  ) ?? [];
  const createRepair = useMutation(api.repairs.create);
  const updateDetails = useMutation(api.repairs.updateDetails);
  const transitionStatus = useMutation(api.repairs.transitionStatus);
  const rotateTrackingToken = useMutation(api.repairs.rotateTrackingToken);
  const recordPayment = useMutation(api.repairs.recordPayment);
  const refundPayment = useMutation(api.repairs.refundPayment);
  const canCollect = usePermission("record_collections");
  const collectionAccounts = useQuery(api.finance.collectionAccountPicker, canCollect ? {} : "skip") ?? [];
  const refundAccounts = useQuery(api.finance.refundAccountPicker, canRefund ? {} : "skip") ?? [];
  const [accountId, setAccountId] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [printRepair, setPrintRepair] = useState<PrintData | null>(null);
  const [printTargetId, setPrintTargetId] = useState<Id<"repairs"> | null>(null);
  const printableRepair = useQuery(
    api.repairs.repairForPrint,
    canPrint && printTargetId ? { id: printTargetId } : "skip",
  );
  const [historyTarget, setHistoryTarget] = useState<Doc<"repairs"> | null>(null);
  const history = usePaginatedQuery(
    api.repairs.historyPaginated,
    historyTarget ? { repairId: historyTarget._id } : "skip",
    { initialNumItems: 10 },
  );
  const [transitionTarget, setTransitionTarget] = useState<Doc<"repairs"> | null>(null);
  const [transitionNext, setTransitionNext] = useState<RepairStatus | null>(null);
  const [transitionForm, setTransitionForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    reason: "",
    diagnosis: "",
    qualityCheckNotes: "",
    warrantyDays: "0",
  });
  const [transitionRequestId, setTransitionRequestId] = useState(
    () => crypto.randomUUID(),
  );
  const [editForm, setEditForm] = useState({
    technicianProfileId: "",
    diagnosis: "",
    serialNumber: "",
    accessories: "",
    intakeCondition: "",
    qualityCheckNotes: "",
    expectedDate: "",
    notes: "",
  });
  const [updatingId, setUpdatingId] = useState<Id<"repairs"> | null>(null);
  const [form, setForm] = useState({
    customerName: "", customerPhone: "", customerId: "",
    deviceType: "موبايل", deviceBrand: "", deviceModel: "",
    problem: "", laborCost: "", deposit: "",
    expectedDate: "", notes: "", technicianProfileId: "",
    serialNumber: "", accessories: "", intakeCondition: "",
  });
  const [parts, setParts] = useState<Array<{
    productId: string;
    quantity: string;
  }>>([]);

  const partsTotal = parts.reduce((sum, row) => {
    const product = partOptions.find((part) => part._id === row.productId);
    return sum + (product?.sellPrice ?? 0) * Number(row.quantity || 0);
  }, 0);

  useEffect(() => {
    if (!printableRepair) return;
    setPrintRepair(printableRepair);
    setPrintTargetId(null);
  }, [printableRepair]);

  useEffect(() => {
    if (!selectedBranchId && branches.length === 1) {
      setSelectedBranchId(branches[0]._id);
    }
  }, [branches, selectedBranchId]);

  const filtered = repairs.filter(r =>
    r.customerName.toLowerCase().includes(search.toLowerCase()) ||
    r.repairNumber.includes(search) ||
    r.deviceBrand.toLowerCase().includes(search.toLowerCase())
  ).filter(r => !filterStatus || r.status === filterStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (Number(form.deposit) > 0 && !accountId) { toast.error("اختر حساب تحصيل العربون"); return; }
    const completedParts = parts.filter((part) => part.productId);
    if (
      completedParts.some(
        (part) =>
          !Number.isInteger(Number(part.quantity)) ||
          Number(part.quantity) <= 0,
      )
    ) {
      toast.error("كمية قطعة الغيار يجب أن تكون عددًا صحيحًا أكبر من صفر");
      return;
    }
    const selectedParts = completedParts
      .map((part) => ({
        productId: part.productId as Id<"products">,
        quantity: Number(part.quantity),
      }));
    if (new Set(selectedParts.map((part) => part.productId)).size !== selectedParts.length) {
      toast.error("لا يمكن تكرار قطعة الغيار");
      return;
    }
    if (Number(form.deposit) > Number(form.laborCost || 0) + partsTotal) {
      toast.error("العربون لا يمكن أن يتجاوز إجمالي أمر الصيانة");
      return;
    }
    setSaving(true);
    try {
      await createRepair({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerId: form.customerId ? form.customerId as Id<"customers"> : undefined,
        deviceType: form.deviceType,
        deviceBrand: form.deviceBrand,
        deviceModel: form.deviceModel,
        problem: form.problem,
        laborCost: Number(form.laborCost),
        parts: selectedParts,
        creationRequestId: requestId,
        initialDeposit: Number(form.deposit) > 0 ? { amount: Number(form.deposit), accountId: accountId as Id<"financialAccounts">, paymentDate: new Date().toISOString().slice(0, 10), requestId } : undefined,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
        serialNumber: form.serialNumber || undefined,
        accessories: form.accessories || undefined,
        intakeCondition: form.intakeCondition || undefined,
        technicianProfileId: form.technicianProfileId
          ? form.technicianProfileId as Id<"userProfiles">
          : undefined,
        branchId: selectedBranchId
          ? selectedBranchId as Id<"branches">
          : undefined,
      });
      toast.success("تم إضافة طلب الصيانة بنجاح");
      setRequestId(crypto.randomUUID());
      setShowForm(false);
      setParts([]);
      setForm({ customerName: "", customerPhone: "", customerId: "", deviceType: "موبايل", deviceBrand: "", deviceModel: "", problem: "", laborCost: "", deposit: "", expectedDate: "", notes: "", technicianProfileId: "", serialNumber: "", accessories: "", intakeCondition: "" });
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إضافة طلب الصيانة"));
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = (repair: Doc<"repairs">, next: RepairStatus) => {
    setTransitionTarget(repair);
    setTransitionNext(next);
    setTransitionRequestId(crypto.randomUUID());
    setTransitionForm({
      date: new Date().toISOString().slice(0, 10),
      reason: "",
      diagnosis: repair.diagnosis ?? "",
      qualityCheckNotes: repair.qualityCheckNotes ?? "",
      warrantyDays: String(repair.warrantyDays ?? 0),
    });
  };

  const submitTransition = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!transitionTarget || !transitionNext || updatingId) return;
    setUpdatingId(transitionTarget._id);
    try {
      await transitionStatus({
        id: transitionTarget._id,
        status: transitionNext,
        date: transitionForm.date,
        requestId: transitionRequestId,
        reason: transitionForm.reason.trim() || undefined,
        diagnosis: transitionForm.diagnosis.trim() || undefined,
        qualityCheckNotes:
          transitionForm.qualityCheckNotes.trim() || undefined,
        warrantyDays:
          transitionNext === "delivered"
            ? Number(transitionForm.warrantyDays || 0)
            : undefined,
      });
      toast.success("تم تحديث حالة الصيانة");
      setTransitionTarget(null);
      setTransitionNext(null);
      setTransitionRequestId(crypto.randomUUID());
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث حالة الصيانة"));
    } finally {
      setUpdatingId(null);
    }
  };

  const openEdit = (repair: Doc<"repairs">) => {
    setEditTarget(repair);
    setEditForm({
      technicianProfileId: repair.assignedTechnicianProfileId ?? "",
      diagnosis: repair.diagnosis ?? "",
      serialNumber: repair.serialNumber ?? "",
      accessories: repair.accessories ?? "",
      intakeCondition: repair.intakeCondition ?? "",
      qualityCheckNotes: repair.qualityCheckNotes ?? "",
      expectedDate: repair.expectedDate ?? "",
      notes: repair.notes ?? "",
    });
  };

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editTarget || updatingId) return;
    setUpdatingId(editTarget._id);
    try {
      await updateDetails({
        id: editTarget._id,
        technicianProfileId: editForm.technicianProfileId
          ? editForm.technicianProfileId as Id<"userProfiles">
          : undefined,
        diagnosis: editForm.diagnosis,
        serialNumber: editForm.serialNumber,
        accessories: editForm.accessories,
        intakeCondition: editForm.intakeCondition,
        qualityCheckNotes: editForm.qualityCheckNotes,
        expectedDate: editForm.expectedDate,
        notes: editForm.notes,
      });
      toast.success("تم تحديث بيانات الصيانة");
      setEditTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث بيانات الصيانة"));
    } finally {
      setUpdatingId(null);
    }
  };

  const collectRepair = async (repair: Doc<"repairs">) => {
    const amount = Number(prompt("قيمة التحصيل")); const selected = collectionAccounts[0]; if (!amount || !selected) return toast.error("اختر حساباً متاحاً وأدخل مبلغاً صحيحاً");
    try { await recordPayment({ repairId: repair._id, amount, accountId: selected._id, paymentDate: new Date().toISOString().slice(0, 10), requestId: crypto.randomUUID() }); toast.success("تم التحصيل"); } catch (error) { toast.error(getErrorMessage(error, "تعذر التحصيل")); }
  };
  const refundRepair = async (repair: Doc<"repairs">) => {
    const amount = Number(prompt("قيمة الاسترداد")); const reason = prompt("سبب الاسترداد")?.trim(); const selected = refundAccounts[0]; if (!amount || !reason || !selected) return;
    try { await refundPayment({ repairId: repair._id, amount, accountId: selected._id, date: new Date().toISOString().slice(0, 10), reason, requestId: crypto.randomUUID() }); toast.success("تم الاسترداد"); } catch (error) { toast.error(getErrorMessage(error, "تعذر الاسترداد")); }
  };

  const handleStatusSelection = (repair: Doc<"repairs">, value: string) => {
    if (!isRepairStatus(value) || !isRepairStatus(repair.status)) return;
    if (!REPAIR_TRANSITIONS[repair.status].includes(value)) return;
    applyStatus(repair, value);
  };

  const handleSelectCustomer = (id: string) => {
    const c = customers.find(c => c._id === id);
    if (c) {
      setForm({ ...form, customerId: id, customerName: c.name, customerPhone: c.phone });
    }
  };

  const handleRotateTrackingToken = async (id: string, repairNumber: string) => {
    if (!confirm("سيتم إلغاء رابط التتبع القديم وإنشاء رابط جديد. هل تريد المتابعة؟")) return;
    try {
      const trackingToken = await rotateTrackingToken({ id: id as Id<"repairs"> });
      const url = `${window.location.origin}${window.location.pathname}#track=${trackingToken}`;
      await navigator.clipboard.writeText(url);
      toast.success(`تم تجديد رابط ${repairNumber} ونسخه`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجديد رابط التتبع");
    }
  };

  const openNewRepair = () => {
    if (canViewBranches && branches.length > 0 && !selectedBranchId) {
      toast.error("اختر فرع أمر الصيانة أولًا");
      return;
    }
    setRequestId(crypto.randomUUID()); setParts([]); setAccountId(""); setShowForm(true);
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
        <div className="flex items-center gap-2">
          {canViewBranches && branches.length > 0 && (
            <select
              className="form-input min-w-40"
              value={selectedBranchId}
              onChange={(event) => {
                setSelectedBranchId(event.target.value);
                setParts([]);
              }}
              aria-label="فرع أمر الصيانة"
            >
              <option value="">اختر الفرع</option>
              {branches.map((branch: { _id: Id<"branches">; name: string }) => (
                <option key={branch._id} value={branch._id}>{branch.name}</option>
              ))}
            </select>
          )}
          {canCreate && <button onClick={openNewRepair} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            طلب صيانة جديد
          </button>}
        </div>
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
          const currentStatus: RepairStatus = isRepairStatus(r.status) ? r.status : "received";
          const status = statusConfig[currentStatus];
          const StatusIcon = status.icon;
          return (
            <div key={r._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono text-xs text-indigo-600 font-bold">{r.repairNumber}</p><FinancialHistory referenceType="repair" referenceId={String(r._id)} />
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
                {r.serialNumber && <p className="text-xs text-slate-500 mt-0.5">السيريال: {r.serialNumber}</p>}
                {r.accessories && <p className="text-xs text-slate-500 mt-0.5">الملحقات: {r.accessories}</p>}
                <p className="text-xs text-slate-600 mt-1.5 font-medium">المشكلة: {r.problem}</p>
                {r.diagnosis && <p className="text-xs text-indigo-700 mt-1.5 font-medium">التشخيص: {r.diagnosis}</p>}
              </div>

              {r.parts.length > 0 && (
                <div className="mb-3 rounded-xl border border-slate-100 px-3 py-2">
                  <p className="mb-1 text-xs font-bold text-slate-600">قطع الغيار</p>
                  {r.parts.map((part, index) => (
                    <div
                      key={`${part.productId ?? part.name}-${index}`}
                      className="flex justify-between gap-2 text-xs text-slate-500"
                    >
                      <span>{part.name} × {part.quantity}</span>
                      <span>{(part.lineTotal ?? part.cost * part.quantity).toLocaleString("ar-EG")} ج.م</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mb-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">التكلفة</p>
                  <p className="font-bold text-slate-800">{r.totalCost.toLocaleString("ar-EG")} ج.م</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-slate-500">المتبقي</p>
                  <p className={`font-bold ${r.remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {r.remaining.toLocaleString("ar-EG")} ج.م
                  </p>
                </div>
                {r.technicianName && (
                  <div className="text-left">
                    <p className="text-xs text-slate-500">الفني</p>
                    <p className="text-xs font-medium text-slate-700">{r.technicianName}</p>
                  </div>
                )}
              </div>

              {r.status === "delivered" && (
                <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  تم التسليم {r.deliveredDate ?? "—"}
                  {r.warrantyDays !== undefined && (
                    <span> — ضمان {r.warrantyDays} يوم حتى {r.warrantyUntil ?? "—"}</span>
                  )}
                </div>
              )}

              {r.trackingToken && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-indigo-500 mb-0.5">رمز التتبع</p>
                      <p className="font-mono font-black text-indigo-700 text-xs tracking-wide break-all">{r.trackingToken}</p>
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
                      {canEdit && (
                        <button
                          onClick={() => void handleRotateTrackingToken(r._id, r.repairNumber)}
                          className="p-1.5 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors text-amber-700"
                          title="تجديد رابط التتبع وإلغاء الرابط القديم"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a
                        href={buildEgyptWhatsAppUrl(r.customerPhone, `مرحباً ${r.customerName}،\nرابط متابعة طلب الصيانة الخاص بك:\n${window.location.origin}${window.location.pathname}#track=${r.trackingToken}\n\nرقم الطلب: ${r.repairNumber}`)}
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
                {canCollect && r.remaining > 0 && <button className="btn-secondary text-xs" onClick={() => void collectRepair(r)}>تحصيل دفعة</button>}
                {canRefund && r.deposit > 0 && <button className="btn-secondary text-xs" onClick={() => void refundRepair(r)}>استرداد مبلغ</button>}
                {canEdit && ["received", "in_progress"].includes(r.status) && (
                  <button className="btn-secondary text-xs" onClick={() => openEdit(r)}>
                    التفاصيل
                  </button>
                )}
                <button className="btn-secondary text-xs" onClick={() => setHistoryTarget(r)}>
                  السجل
                </button>
                {canEdit && r.status !== "delivered" && r.status !== "cancelled" && (
                  <select
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                    value=""
                    disabled={updatingId !== null}
                    onChange={e => handleStatusSelection(r, e.target.value)}
                  >
                    <option value="" disabled>{updatingId === r._id ? "جارٍ التحديث..." : "تغيير الحالة"}</option>
                    {REPAIR_TRANSITIONS[currentStatus].map(next => <option key={next} value={next}>{statusConfig[next].label}</option>)}
                  </select>
                )}
                {canPrint && <button
                  onClick={() => { if (canPrint) setPrintTargetId(r._id); }}
                  className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors"
                  title="طباعة"
                >
                  <Printer className="w-4 h-4" />
                </button>}
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
      {canPrint && printRepair && (
        <PrintModal
          type="repair"
          data={printRepair}
          onClose={() => setPrintRepair(null)}
        />
      )}

      {transitionTarget && transitionNext && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">
              {statusConfig[transitionNext].label} — {transitionTarget.repairNumber}
            </h2>
            <p className="my-2 text-sm text-slate-600">
              تُحفظ العملية في سجل الحالات، ويبقى معرف الطلب ثابتًا عند إعادة المحاولة.
            </p>
            <form className="space-y-4" onSubmit={submitTransition}>
              <div>
                <label className="form-label">تاريخ العملية *</label>
                <input
                  required
                  type="date"
                  className="form-input"
                  value={transitionForm.date}
                  onChange={(event) => setTransitionForm({
                    ...transitionForm,
                    date: event.target.value,
                  })}
                />
              </div>
              {transitionNext === "ready" && (
                <>
                  <div>
                    <label className="form-label">التشخيص النهائي *</label>
                    <textarea
                      required
                      className="form-input"
                      rows={3}
                      value={transitionForm.diagnosis}
                      onChange={(event) => setTransitionForm({
                        ...transitionForm,
                        diagnosis: event.target.value,
                      })}
                    />
                  </div>
                  <div>
                    <label className="form-label">ملاحظات اختبار الجودة</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={transitionForm.qualityCheckNotes}
                      onChange={(event) => setTransitionForm({
                        ...transitionForm,
                        qualityCheckNotes: event.target.value,
                      })}
                    />
                  </div>
                </>
              )}
              {transitionNext === "delivered" && (
                <div>
                  <label className="form-label">مدة الضمان بالأيام</label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    step="1"
                    className="form-input"
                    value={transitionForm.warrantyDays}
                    onChange={(event) => setTransitionForm({
                      ...transitionForm,
                      warrantyDays: event.target.value,
                    })}
                  />
                </div>
              )}
              {transitionNext === "cancelled" && (
                <div>
                  <label className="form-label">سبب الإلغاء *</label>
                  <textarea
                    required
                    className="form-input"
                    rows={3}
                    value={transitionForm.reason}
                    onChange={(event) => setTransitionForm({
                      ...transitionForm,
                      reason: event.target.value,
                    })}
                  />
                </div>
              )}
              <div className="flex gap-3">
                <button
                  className="btn-primary flex-1"
                  disabled={updatingId !== null}
                >
                  {updatingId ? "جارٍ الحفظ..." : "تأكيد الانتقال"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={updatingId !== null}
                  onClick={() => {
                    setTransitionTarget(null);
                    setTransitionNext(null);
                  }}
                >
                  تراجع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">بيانات الصيانة {editTarget.repairNumber}</h2>
            <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={saveDetails}>
              <div>
                <label className="form-label">الفني المسؤول</label>
                <select className="form-input" value={editForm.technicianProfileId} onChange={(event) => setEditForm({...editForm, technicianProfileId: event.target.value})}>
                  <option value="">اختر الفني</option>
                  {technicianOptions.map((technician) => <option key={technician._id} value={technician._id}>{technician.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">تاريخ التسليم المتوقع</label>
                <input type="date" className="form-input" value={editForm.expectedDate} onChange={(event) => setEditForm({...editForm, expectedDate: event.target.value})} />
              </div>
              <div>
                <label className="form-label">الرقم المسلسل</label>
                <input className="form-input" value={editForm.serialNumber} onChange={(event) => setEditForm({...editForm, serialNumber: event.target.value})} />
              </div>
              <div>
                <label className="form-label">الملحقات المستلمة</label>
                <input className="form-input" value={editForm.accessories} onChange={(event) => setEditForm({...editForm, accessories: event.target.value})} />
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">حالة الجهاز عند الاستلام</label>
                <textarea className="form-input" rows={2} value={editForm.intakeCondition} onChange={(event) => setEditForm({...editForm, intakeCondition: event.target.value})} />
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">التشخيص</label>
                <textarea className="form-input" rows={3} value={editForm.diagnosis} onChange={(event) => setEditForm({...editForm, diagnosis: event.target.value})} />
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">اختبار الجودة</label>
                <textarea className="form-input" rows={2} value={editForm.qualityCheckNotes} onChange={(event) => setEditForm({...editForm, qualityCheckNotes: event.target.value})} />
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">ملاحظات</label>
                <textarea className="form-input" rows={2} value={editForm.notes} onChange={(event) => setEditForm({...editForm, notes: event.target.value})} />
              </div>
              <div className="flex gap-3 sm:col-span-2">
                <button className="btn-primary flex-1" disabled={updatingId !== null}>{updatingId ? "جارٍ الحفظ..." : "حفظ التفاصيل"}</button>
                <button type="button" className="btn-secondary" disabled={updatingId !== null} onClick={() => setEditTarget(null)}>إغلاق</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">سجل {historyTarget.repairNumber}</h2>
              <button className="btn-secondary" onClick={() => setHistoryTarget(null)}>إغلاق</button>
            </div>
            <div className="mt-4 space-y-3">
              {history.results.map((entry) => (
                <div key={entry._id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-slate-800">
                      {entry.fromStatus ? `${statusConfig[entry.fromStatus].label} ← ` : ""}
                      {statusConfig[entry.toStatus].label}
                    </span>
                    <span className="text-xs text-slate-500">{entry.date}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">بواسطة {entry.employeeName}</p>
                  {entry.technicianName && <p className="mt-1 text-xs">الفني: {entry.technicianName}</p>}
                  {entry.diagnosis && <p className="mt-1 text-xs">التشخيص: {entry.diagnosis}</p>}
                  {entry.reason && <p className="mt-1 text-xs text-red-700">السبب: {entry.reason}</p>}
                </div>
              ))}
              {history.results.length === 0 && <p className="py-8 text-center text-sm text-slate-400">لا توجد حركات.</p>}
              {history.status === "CanLoadMore" && (
                <button className="btn-secondary w-full" onClick={() => history.loadMore(10)}>تحميل المزيد</button>
              )}
            </div>
          </div>
        </div>
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
                <div>
                  <label className="form-label">الرقم المسلسل</label>
                  <input className="form-input" value={form.serialNumber} onChange={e => setForm({...form, serialNumber: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">الملحقات المستلمة</label>
                  <input className="form-input" value={form.accessories} onChange={e => setForm({...form, accessories: e.target.value})} placeholder="دراع، كابل، شنطة..." />
                </div>
                <div className="sm:col-span-2">
                  <label className="form-label">حالة الجهاز عند الاستلام</label>
                  <textarea className="form-input" rows={2} value={form.intakeCondition} onChange={e => setForm({...form, intakeCondition: e.target.value})} />
                </div>
                <div className="sm:col-span-2">
                  <label className="form-label">وصف المشكلة *</label>
                  <textarea className="form-input" required rows={2} value={form.problem} onChange={e => setForm({...form, problem: e.target.value})} placeholder="اشرح المشكلة بالتفصيل..." />
                </div>
                <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800">قطع الغيار</p>
                      <p className="text-xs text-slate-500">يُحتسب السعر والمخزون من بيانات الفرع على الخادم</p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => setParts((current) => [
                        ...current,
                        { productId: "", quantity: "1" },
                      ])}
                    >
                      إضافة قطعة
                    </button>
                  </div>
                  {parts.map((row, index) => {
                    const selected = partOptions.find(
                      (part) => part._id === row.productId,
                    );
                    return (
                      <div
                        key={`${index}-${row.productId}`}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_auto]"
                      >
                        <select
                          className="form-input"
                          value={row.productId}
                          onChange={(event) =>
                            setParts((current) =>
                              current.map((part, partIndex) =>
                                partIndex === index
                                  ? { ...part, productId: event.target.value }
                                  : part,
                              ),
                            )
                          }
                        >
                          <option value="">اختر قطعة الغيار</option>
                          {partOptions.map((part) => (
                            <option key={part._id} value={part._id}>
                              {part.name} — متاح {part.stock} {part.unit} — {part.sellPrice.toLocaleString("ar-EG")} ج.م
                            </option>
                          ))}
                        </select>
                        <input
                          className="form-input"
                          type="number"
                          min="1"
                          step="1"
                          value={row.quantity}
                          onChange={(event) =>
                            setParts((current) =>
                              current.map((part, partIndex) =>
                                partIndex === index
                                  ? { ...part, quantity: event.target.value }
                                  : part,
                              ),
                            )
                          }
                          aria-label="كمية قطعة الغيار"
                        />
                        <button
                          type="button"
                          className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                          onClick={() =>
                            setParts((current) =>
                              current.filter((_, partIndex) => partIndex !== index),
                            )
                          }
                        >
                          حذف
                        </button>
                        {selected && (
                          <p className="text-xs text-slate-500 sm:col-span-3">
                            إجمالي السطر: {(selected.sellPrice * Number(row.quantity || 0)).toLocaleString("ar-EG")} ج.م
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {parts.length === 0 && (
                    <p className="text-xs text-slate-400">لا توجد قطع غيار مضافة.</p>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-3 text-sm font-bold">
                    <span>إجمالي قطع الغيار</span>
                    <span>{partsTotal.toLocaleString("ar-EG")} ج.م</span>
                  </div>
                </div>
                <div>
                  <label className="form-label">تكلفة العمالة (ج.م)</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.laborCost} onChange={e => setForm({...form, laborCost: e.target.value})} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">العربون (ج.م)</label>
                  <input className="form-input" type="number" min="0" step="0.01" max={Number(form.laborCost || 0) + partsTotal} disabled={!canCollect} value={form.deposit} onChange={e => setForm({...form, deposit: e.target.value})} placeholder="0" />
                  {canCollect && Number(form.deposit) > 0 && <select className="form-input mt-2" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">اختر حساب التحصيل</option>{collectionAccounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}</select>}
                </div>
                <div className="sm:col-span-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
                  إجمالي أمر الصيانة: {(Number(form.laborCost || 0) + partsTotal).toLocaleString("ar-EG")} ج.م
                </div>
                <div>
                  <label className="form-label">الفني المسؤول</label>
                  <select className="form-input" value={form.technicianProfileId} onChange={e => setForm({...form, technicianProfileId: e.target.value})}>
                    <option value="">يُعيّن لاحقًا</option>
                    {technicianOptions.map((technician) => <option key={technician._id} value={technician._id}>{technician.name}</option>)}
                  </select>
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
                <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">حفظ طلب الصيانة</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
