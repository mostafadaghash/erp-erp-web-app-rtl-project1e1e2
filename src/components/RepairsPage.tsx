import { FinancialHistory } from "./FinancialHistory";
import { useEffect, useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { toast } from "sonner";
import {
  Wrench,
  Plus,
  Search,
  Clock,
  CheckCircle,
  AlertCircle,
  Copy,
  MessageCircle,
  Printer,
  RefreshCw,
  Eye,
  Pencil,
  History as HistoryIcon,
  Banknote,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PrintModal } from "./PrintTemplate";
import type { PrintData } from "./PrintTemplate";
import { RepairWorkEditDialog } from "./RepairWorkEditDialog";
import { buildEgyptWhatsAppUrl } from "../lib/utils";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { isRepairStatus, REPAIR_TRANSITIONS, type RepairStatus } from "../../shared/businessRules";
import { getErrorMessage } from "../lib/errors";

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const isMoney = (value: number) =>
  Number.isFinite(value) && value >= 0 && Math.round(value * 100) / 100 === value;
const money = (value: number) => `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;

const statusConfig: Record<RepairStatus, { label: string; badge: string; icon: LucideIcon }> = {
  received: { label: "تم الاستلام", badge: "badge-info", icon: Clock },
  under_inspection: { label: "تحت الفحص", badge: "badge-info", icon: Search },
  awaiting_approval: { label: "بانتظار موافقة العميل", badge: "badge-warning", icon: Clock },
  in_progress: { label: "جاري الإصلاح", badge: "badge-warning", icon: Wrench },
  ready: { label: "جاهز للتسليم", badge: "badge-success", icon: CheckCircle },
  delivered: { label: "تم التسليم", badge: "badge-purple", icon: CheckCircle },
  cancelled: { label: "ملغي", badge: "badge-danger", icon: AlertCircle },
};

const emptyRepairForm = () => ({
  customerName: "", customerPhone: "", customerId: "",
  deviceType: "موبايل", deviceBrand: "", deviceModel: "",
  problem: "", laborCost: "", deposit: "",
  expectedDate: "", notes: "", technicianProfileId: "",
  serialNumber: "", accessories: "", intakeCondition: "",
});

export function RepairsPage({ createRequestToken }: { createRequestToken?: number }) {
  const canCreate = usePermission("create_repairs");
  const canEdit = usePermission("edit_repairs");
  const canPrint = usePermission("print_repairs");
  const canRefund = usePermission("refund_collections");
  const canCollect = usePermission("record_collections");
  const canViewBranches = usePermission("view_branches");
  const [showForm, setShowForm] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const branchesQuery = useQuery(api.branches.list, canViewBranches ? {} : "skip");
  const branches = branchesQuery ?? [];
  const repairBranchArgs = selectedBranchId
    ? { branchId: selectedBranchId as Id<"branches"> }
    : {};
  const requiresBranchSelection = canViewBranches && branches.length > 0 && !selectedBranchId;
  const repairsQuery = useQuery(api.repairs.list, repairBranchArgs);
  const repairs = repairsQuery ?? [];

  const customerPickerArgs = canCreate && !requiresBranchSelection ? repairBranchArgs : "skip";
  const customersQuery = useQuery(api.customers.repairPicker, customerPickerArgs);
  const customers = customersQuery ?? [];
  const partPickerGate = canCreate && showForm && !requiresBranchSelection ? {} : "skip";
  const partOptions = useQuery(
    api.repairs.partPicker,
    partPickerGate !== "skip"
      ? { branchId: selectedBranchId ? selectedBranchId as Id<"branches"> : undefined }
      : "skip",
  ) ?? [];

  const [editTarget, setEditTarget] = useState<Doc<"repairs"> | null>(null);
  const [workTarget, setWorkTarget] = useState<Doc<"repairs"> | null>(null);
  const [detailTarget, setDetailTarget] = useState<Doc<"repairs"> | null>(null);
  const technicianOptions = useQuery(
    api.repairs.technicianPicker,
    canEdit && (showForm || editTarget)
      ? {
          branchId: editTarget?.branchId ??
            (selectedBranchId ? selectedBranchId as Id<"branches"> : undefined),
        }
      : "skip",
  ) ?? [];

  const createRepair = useMutation(api.repairs.create);
  const updateDetails = useMutation(api.repairs.updateDetails);
  const transitionStatus = useMutation(api.repairs.transitionStatus);
  const rotateTrackingToken = useMutation(api.repairs.rotateTrackingToken);
  const recordPayment = useMutation(api.repairs.recordPayment);
  const refundPayment = useMutation(api.repairs.refundPayment);

  const [collectionTarget, setCollectionTarget] = useState<Doc<"repairs"> | null>(null);
  const [refundTarget, setRefundTarget] = useState<Doc<"repairs"> | null>(null);
  const collectionAccounts = useQuery(
    api.finance.collectionAccountPicker,
    canCollect && (showForm || collectionTarget) ? {} : "skip",
  ) ?? [];
  const refundAccounts = useQuery(
    api.finance.refundAccountPicker,
    canRefund && refundTarget ? {} : "skip",
  ) ?? [];

  const [accountId, setAccountId] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [financialBusy, setFinancialBusy] = useState<"collection" | "refund" | null>(null);
  const [collectionRequestId, setCollectionRequestId] = useState(() => crypto.randomUUID());
  const [refundRequestId, setRefundRequestId] = useState(() => crypto.randomUUID());
  const [collectionForm, setCollectionForm] = useState({
    amount: "", accountId: "", date: new Date().toISOString().slice(0, 10), notes: "",
  });
  const [refundForm, setRefundForm] = useState({
    amount: "", accountId: "", date: new Date().toISOString().slice(0, 10), reason: "",
  });

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [printRepair, setPrintRepair] = useState<PrintData | null>(null);
  const [printTargetId, setPrintTargetId] = useState<Id<"repairs"> | null>(null);
  const [trackingBusyId, setTrackingBusyId] = useState<Id<"repairs"> | null>(null);
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
    reason: "", diagnosis: "", qualityCheckNotes: "", warrantyDays: "0",
  });
  const [transitionRequestId, setTransitionRequestId] = useState(() => crypto.randomUUID());

  const [editForm, setEditForm] = useState({
    technicianProfileId: "", diagnosis: "", serialNumber: "", accessories: "",
    intakeCondition: "", qualityCheckNotes: "", expectedDate: "", notes: "",
  });
  const [updatingId, setUpdatingId] = useState<Id<"repairs"> | null>(null);
  const [form, setForm] = useState(emptyRepairForm);
  const [parts, setParts] = useState<Array<{ productId: string; quantity: string }>>([]);

  const resetCreateState = () => {
    setParts([]);
    setAccountId("");
    setRequestId(crypto.randomUUID());
    setForm(emptyRepairForm());
  };
  const closeCreateForm = () => {
    if (saving) return;
    resetCreateState();
    setShowForm(false);
  };
  const handleBranchChange = (value: string) => {
    setSelectedBranchId(value);
    resetCreateState();
    setShowForm(false);
    setEditTarget(null);
    setWorkTarget(null);
    setDetailTarget(null);
    setHistoryTarget(null);
    setTransitionTarget(null);
    setTransitionNext(null);
    setCollectionTarget(null);
    setRefundTarget(null);
    setPrintTargetId(null);
    setPrintRepair(null);
  };
  const initialDepositAccounts = selectedBranchId
    ? collectionAccounts.filter((account) => account.branchId === selectedBranchId)
    : collectionAccounts;
  const targetCollectionAccounts = collectionTarget
    ? collectionAccounts.filter((account) => account.branchId === collectionTarget.branchId)
    : [];
  const targetRefundAccounts = refundTarget
    ? refundAccounts.filter((account) => account.branchId === refundTarget.branchId)
    : [];

  const partsTotal = parts.reduce((sum, row) => {
    const product = partOptions.find((part) => part._id === row.productId);
    return sum + (product?.sellPrice ?? 0) * Number(row.quantity || 0);
  }, 0);
  const laborCostAmount = Number(form.laborCost || 0);
  const depositAmount = Number(form.deposit || 0);
  const completedPartRows = parts.filter((part) => part.productId);

  const createValidationReason = (() => {
    if (requiresBranchSelection) return "اختر فرع أمر الصيانة";
    if (!form.customerName.trim()) return "أدخل اسم العميل";
    if (!form.customerPhone.trim()) return "أدخل رقم الهاتف";
    if (!form.deviceBrand.trim()) return "أدخل ماركة الجهاز";
    if (!form.deviceModel.trim()) return "أدخل موديل الجهاز";
    if (!form.problem.trim()) return "أدخل وصف المشكلة";
    if (!isMoney(laborCostAmount)) return "أدخل تكلفة عمالة صحيحة";
    if (parts.length > 100) return "لا يمكن إضافة أكثر من 100 قطعة لأمر الصيانة";
    if (parts.some((part) => !part.productId)) return "اختر قطعة الغيار أو احذف السطر غير المكتمل";
    if (completedPartRows.some((part) => !Number.isInteger(Number(part.quantity)) || Number(part.quantity) <= 0)) return "كمية قطعة الغيار يجب أن تكون عددًا صحيحًا أكبر من صفر";
    if (new Set(completedPartRows.map((part) => part.productId)).size !== completedPartRows.length) return "لا يمكن تكرار قطعة الغيار";
    const stockViolation = completedPartRows.find((part) => {
      const product = partOptions.find((option) => option._id === part.productId);
      return product && Number(part.quantity) > product.stock;
    });
    if (stockViolation) {
      const product = partOptions.find((option) => option._id === stockViolation.productId);
      return `كمية ${product?.name ?? "قطعة الغيار"} تتجاوز المخزون المتاح`;
    }
    if (!isMoney(depositAmount)) return "أدخل عربونًا صحيحًا";
    if (depositAmount > laborCostAmount + partsTotal) return "العربون لا يمكن أن يتجاوز إجمالي أمر الصيانة";
    if (depositAmount > 0 && !canCollect) return "لا تملك صلاحية تحصيل العربون";
    if (depositAmount > 0 && !initialDepositAccounts.some((account) => account._id === accountId)) return "اختر حساب تحصيل العربون";
    if (form.expectedDate && !isIsoDate(form.expectedDate)) return "تاريخ التسليم المتوقع غير صالح";
    return null;
  })();

  const transitionValidationReason = (() => {
    if (!transitionTarget || !transitionNext) return null;
    if (!isIsoDate(transitionForm.date)) return "اختر تاريخ عملية صالحًا";
    if (transitionNext === "in_progress" && !transitionTarget.technicianName) return "عيّن فنيًا قبل بدء الإصلاح";
    if (transitionNext === "ready" && !transitionForm.diagnosis.trim()) return "أدخل التشخيص النهائي قبل اعتماد الجاهزية";
    if (transitionNext === "cancelled") {
      if (transitionTarget.deposit > 0) return "استرد العربون بالكامل قبل إلغاء الصيانة";
      if (!transitionForm.reason.trim()) return "أدخل سبب الإلغاء";
    }
    if (transitionNext === "delivered") {
      if (transitionTarget.remaining > 0) return "حصّل المبلغ المتبقي قبل تسليم الجهاز";
      const warrantyDays = Number(transitionForm.warrantyDays || 0);
      if (!Number.isInteger(warrantyDays) || warrantyDays < 0 || warrantyDays > 365) return "مدة الضمان يجب أن تكون عدد أيام صحيحًا من صفر إلى 365";
    }
    return null;
  })();

  const collectionValidationReason = (() => {
    if (!collectionTarget) return null;
    const amount = Number(collectionForm.amount);
    if (!isMoney(amount) || amount <= 0 || amount > collectionTarget.remaining) return "مبلغ التحصيل يجب أن يكون أكبر من صفر ولا يتجاوز المتبقي";
    if (!targetCollectionAccounts.some((account) => account._id === collectionForm.accountId)) return "اختر حساب تحصيل تابعًا لفرع أمر الصيانة";
    if (!isIsoDate(collectionForm.date)) return "اختر تاريخ تحصيل صالحًا";
    return null;
  })();

  const refundValidationReason = (() => {
    if (!refundTarget) return null;
    const amount = Number(refundForm.amount);
    if (!isMoney(amount) || amount <= 0 || amount > refundTarget.deposit) return "مبلغ الاسترداد يجب أن يكون أكبر من صفر ولا يتجاوز المحصل";
    if (!refundForm.reason.trim()) return "سبب الاسترداد مطلوب";
    if (!targetRefundAccounts.some((account) => account._id === refundForm.accountId)) return "اختر حساب استرداد تابعًا لفرع أمر الصيانة";
    if (!isIsoDate(refundForm.date)) return "اختر تاريخ استرداد صالحًا";
    return null;
  })();

  const editValidationReason = editTarget && editForm.expectedDate && !isIsoDate(editForm.expectedDate)
    ? "تاريخ التسليم المتوقع غير صالح"
    : null;

  useEffect(() => {
    if (!printableRepair) return;
    setPrintRepair(printableRepair);
    setPrintTargetId(null);
  }, [printableRepair]);

  useEffect(() => {
    if (!selectedBranchId && branches.length === 1) setSelectedBranchId(branches[0]._id);
  }, [branches, selectedBranchId]);

  const filtered = repairs
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return r.customerName.toLowerCase().includes(q)
        || r.customerPhone.toLowerCase().includes(q)
        || r.repairNumber.toLowerCase().includes(q)
        || r.deviceBrand.toLowerCase().includes(q)
        || r.deviceModel.toLowerCase().includes(q)
        || r.problem.toLowerCase().includes(q);
    })
    .filter((r) => !filterStatus || r.status === filterStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (createValidationReason) { toast.error(createValidationReason); return; }
    if (Number(form.deposit) > 0 && !accountId) { toast.error("اختر حساب تحصيل العربون"); return; }
    const selectedParts = completedPartRows.map((part) => ({
      productId: part.productId as Id<"products">,
      quantity: Number(part.quantity),
    }));
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
        laborCost: Number(form.laborCost || 0),
        parts: selectedParts,
        creationRequestId: requestId,
        initialDeposit: Number(form.deposit) > 0 ? {
          amount: Number(form.deposit),
          accountId: accountId as Id<"financialAccounts">,
          paymentDate: new Date().toISOString().slice(0, 10),
          requestId,
        } : undefined,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
        serialNumber: form.serialNumber || undefined,
        accessories: form.accessories || undefined,
        intakeCondition: form.intakeCondition || undefined,
        technicianProfileId: form.technicianProfileId ? form.technicianProfileId as Id<"userProfiles"> : undefined,
        branchId: selectedBranchId ? selectedBranchId as Id<"branches"> : undefined,
      });
      toast.success("تم إنشاء أمر الصيانة بنجاح");
      resetCreateState();
      setShowForm(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إنشاء أمر الصيانة"));
    } finally {
      setSaving(false);
    }
  };

  const openStatusTransition = (repair: Doc<"repairs">, next: RepairStatus) => {
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
    if (transitionValidationReason) { toast.error(transitionValidationReason); return; }
    setUpdatingId(transitionTarget._id);
    try {
      await transitionStatus({
        id: transitionTarget._id,
        status: transitionNext,
        date: transitionForm.date,
        requestId: transitionRequestId,
        reason: transitionForm.reason.trim() || undefined,
        diagnosis: transitionForm.diagnosis.trim() || undefined,
        qualityCheckNotes: transitionForm.qualityCheckNotes.trim() || undefined,
        warrantyDays: transitionNext === "delivered" ? Number(transitionForm.warrantyDays || 0) : undefined,
      });
      toast.success(`تم تحديث ${transitionTarget.repairNumber} إلى ${statusConfig[transitionNext].label}`);
      setTransitionTarget(null);
      setTransitionNext(null);
      setTransitionRequestId(crypto.randomUUID());
      setDetailTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث حالة أمر الصيانة"));
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
    if (editValidationReason) { toast.error(editValidationReason); return; }
    setUpdatingId(editTarget._id);
    try {
      await updateDetails({
        id: editTarget._id,
        technicianProfileId: editForm.technicianProfileId ? editForm.technicianProfileId as Id<"userProfiles"> : undefined,
        diagnosis: editForm.diagnosis,
        serialNumber: editForm.serialNumber,
        accessories: editForm.accessories,
        intakeCondition: editForm.intakeCondition,
        qualityCheckNotes: editForm.qualityCheckNotes,
        expectedDate: editForm.expectedDate,
        notes: editForm.notes,
      });
      toast.success("تم تحديث بيانات أمر الصيانة");
      setEditTarget(null);
      setDetailTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث بيانات أمر الصيانة"));
    } finally {
      setUpdatingId(null);
    }
  };

  const openCollection = (repair: Doc<"repairs">) => {
    setCollectionTarget(repair);
    setCollectionRequestId(crypto.randomUUID());
    setCollectionForm({ amount: "", accountId: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  };

  const openRefund = (repair: Doc<"repairs">) => {
    setRefundTarget(repair);
    setRefundRequestId(crypto.randomUUID());
    setRefundForm({ amount: "", accountId: "", date: new Date().toISOString().slice(0, 10), reason: "" });
  };

  const submitCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!collectionTarget || financialBusy) return;
    if (collectionValidationReason) { toast.error(collectionValidationReason); return; }
    const amount = Number(collectionForm.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > collectionTarget.remaining) {
      toast.error("مبلغ التحصيل يجب أن يكون أكبر من صفر ولا يتجاوز المتبقي"); return;
    }
    const account = targetCollectionAccounts.find((candidate) => candidate._id === collectionForm.accountId);
    if (!account) { toast.error("اختر حساب تحصيل تابعًا لفرع أمر الصيانة"); return; }
    setFinancialBusy("collection");
    try {
      await recordPayment({
        repairId: collectionTarget._id,
        amount,
        accountId: account._id,
        paymentDate: collectionForm.date,
        requestId: collectionRequestId,
        notes: collectionForm.notes.trim() || undefined,
      });
      toast.success("تم تحصيل دفعة الصيانة");
      setCollectionTarget(null);
      setDetailTarget(null);
      setCollectionRequestId(crypto.randomUUID());
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحصيل دفعة الصيانة"));
    } finally {
      setFinancialBusy(null);
    }
  };

  const submitRefund = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!refundTarget || financialBusy) return;
    if (refundValidationReason) { toast.error(refundValidationReason); return; }
    const amount = Number(refundForm.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundTarget.deposit) {
      toast.error("مبلغ الاسترداد يجب أن يكون أكبر من صفر ولا يتجاوز المحصل"); return;
    }
    const reason = refundForm.reason.trim();
    if (!reason) { toast.error("سبب الاسترداد مطلوب"); return; }
    const account = targetRefundAccounts.find((candidate) => candidate._id === refundForm.accountId);
    if (!account) { toast.error("اختر حساب استرداد تابعًا لفرع أمر الصيانة"); return; }
    setFinancialBusy("refund");
    try {
      await refundPayment({
        repairId: refundTarget._id,
        amount,
        accountId: account._id,
        date: refundForm.date,
        reason,
        requestId: refundRequestId,
      });
      toast.success("تم استرداد مبلغ الصيانة");
      setRefundTarget(null);
      setDetailTarget(null);
      setRefundRequestId(crypto.randomUUID());
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر استرداد مبلغ الصيانة"));
    } finally {
      setFinancialBusy(null);
    }
  };

  const handleStatusSelection = (repair: Doc<"repairs">, value: string) => {
    if (!isRepairStatus(value) || !isRepairStatus(repair.status)) return;
    if (!REPAIR_TRANSITIONS[repair.status].includes(value)) return;
    openStatusTransition(repair, value);
  };

  const handleSelectCustomer = (id: string) => {
    const c = customers.find((customer) => customer._id === id);
    if (c) setForm({ ...form, customerId: id, customerName: c.name, customerPhone: c.phone });
  };

  const copyTrackingLink = async (id: Id<"repairs">, trackingToken: string, repairNumber: string) => {
    if (trackingBusyId !== null) return;
    setTrackingBusyId(id);
    try {
      const url = `${window.location.origin}${window.location.pathname}#track=${trackingToken}`;
      await navigator.clipboard.writeText(url);
      toast.success(`تم نسخ رابط ${repairNumber}`);
    } catch {
      toast.error("تعذر نسخ رابط التتبع. انسخه يدويًا من رمز التتبع.");
    } finally {
      setTrackingBusyId(null);
    }
  };

  const handleRotateTrackingToken = async (id: Id<"repairs">, repairNumber: string) => {
    if (trackingBusyId !== null) return;
    if (!confirm("سيتم إلغاء رابط التتبع القديم وإنشاء رابط جديد. هل تريد المتابعة؟")) return;
    setTrackingBusyId(id);
    try {
      const trackingToken = await rotateTrackingToken({ id });
      const url = `${window.location.origin}${window.location.pathname}#track=${trackingToken}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(`تم تجديد رابط ${repairNumber} ونسخه`);
      } catch {
        toast.warning("تم تجديد الرابط لكن تعذر نسخه. انسخه يدويًا من رمز التتبع الجديد.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تجديد رابط التتبع"));
    } finally {
      setTrackingBusyId(null);
    }
  };

  const openNewRepair = () => {
    if (canViewBranches && branches.length > 0 && !selectedBranchId) {
      toast.error("اختر فرع أمر الصيانة أولًا");
      return;
    }
    resetCreateState();
    setShowForm(true);
  };

  useEffect(() => {
    if (createRequestToken && canCreate) openNewRepair();
  }, [createRequestToken, canCreate]);

  return (
    <div className="p-3 lg:p-5 space-y-4" data-testid="repairs-page">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><Wrench className="h-6 w-6 text-indigo-600" /> أوامر الصيانة</h1>
            <p className="mt-1 text-sm text-slate-500">إدارة دورة الصيانة من الاستلام حتى التسليم في سجل واحد واضح</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canViewBranches && branches.length > 0 && (
              <select data-testid="repair-branch-select" className="form-input min-w-44" value={selectedBranchId} onChange={(event) => handleBranchChange(event.target.value)}>
                <option value="">اختر الفرع</option>
                {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
              </select>
            )}
            {canCreate && <button data-testid="repair-create-open" className="btn-primary flex items-center gap-2" onClick={openNewRepair}><Plus className="h-4 w-4" /> أمر صيانة جديد</button>}
          </div>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ value: "", label: "الكل" }, ...Object.entries(statusConfig).map(([value, config]) => ({ value, label: config.label }))].map((item) => (
          <button key={item.value} onClick={() => setFilterStatus(item.value)} className={`whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-bold ${filterStatus === item.value ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {item.label} <span className="mr-1 text-xs opacity-70">({item.value ? repairs.filter((r) => r.status === item.value).length : repairs.length})</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input data-testid="repair-search" className="form-input pr-10" placeholder="بحث برقم أمر الصيانة أو العميل أو الهاتف أو الجهاز أو المشكلة..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="repair-table">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-black text-slate-600">
              <tr>
                <th className="px-3 py-3 text-right">رقم الأمر</th>
                <th className="px-3 py-3 text-right">العميل</th>
                <th className="px-3 py-3 text-right">الجهاز / المشكلة</th>
                <th className="px-3 py-3 text-right">الفني</th>
                <th className="px-3 py-3 text-center">الحالة</th>
                <th className="px-3 py-3 text-center">الاستلام</th>
                <th className="px-3 py-3 text-left">الإجمالي</th>
                <th className="px-3 py-3 text-left">المتبقي</th>
                <th className="px-3 py-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const currentStatus: RepairStatus = isRepairStatus(r.status) ? r.status : "received";
                const status = statusConfig[currentStatus];
                return (
                  <tr
                    key={r._id}
                    data-testid="repair-card"
                    data-repair-number={r.repairNumber}
                    data-customer-name={r.customerName}
                    data-status={r.status}
                    className="cursor-pointer bg-white transition-colors hover:bg-indigo-50/40"
                    onClick={() => setDetailTarget(r)}
                  >
                    <td className="px-3 py-2.5 align-middle"><span className="font-mono text-xs font-black text-indigo-700">{r.repairNumber}</span></td>
                    <td className="px-3 py-2.5"><p className="font-bold text-slate-800">{r.customerName}</p><p className="text-xs text-slate-500">{r.customerPhone}</p></td>
                    <td className="max-w-[300px] px-3 py-2.5"><p className="font-semibold text-slate-800">{r.deviceBrand} {r.deviceModel} <span className="text-xs font-normal text-slate-400">({r.deviceType})</span></p><p className="truncate text-xs text-slate-500" title={r.problem}>{r.problem}</p>{r.status === "delivered" && r.warrantyDays !== undefined && <p className="text-[11px] text-emerald-700">ضمان {r.warrantyDays} يوم حتى {r.warrantyUntil ?? "—"}</p>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.technicianName ?? "غير معيّن"}</td>
                    <td className="px-3 py-2.5 text-center"><span className={`badge ${status.badge}`}>{status.label}</span></td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-600">{r.receivedDate}</td>
                    <td className="px-3 py-2.5 text-left font-black text-slate-800">{money(r.totalCost)}</td>
                    <td className={`px-3 py-2.5 text-left font-black ${r.remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}>{money(r.remaining)}</td>
                    <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100" title="فتح" onClick={() => setDetailTarget(r)}><Eye className="h-4 w-4" /></button>
                        {canEdit && !["delivered", "cancelled"].includes(r.status) && (
                          <button data-testid="repair-work-edit-open" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100" title="تعديل العمل والقطع" onClick={() => setWorkTarget(r)}><Pencil className="h-4 w-4" /></button>
                        )}
                        {canCollect && r.remaining > 0 && r.status !== "delivered" && r.status !== "cancelled" && (
                          <button data-testid="repair-collect-open" className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-sky-700 hover:bg-sky-100" title="تحصيل دفعة" onClick={() => openCollection(r)}><Banknote className="h-4 w-4" /></button>
                        )}
                        <button className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100" title="سجل الحالات" onClick={() => setHistoryTarget(r)}><HistoryIcon className="h-4 w-4" /></button>
                        {canEdit && r.status !== "delivered" && r.status !== "cancelled" && (
                          <select aria-label={`تغيير حالة ${r.repairNumber}`} className="max-w-32 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs" value="" disabled={updatingId !== null} onChange={(event) => handleStatusSelection(r, event.target.value)}>
                            <option value="" disabled>تغيير الحالة</option>
                            {REPAIR_TRANSITIONS[currentStatus].map((next) => <option key={next} value={next}>{statusConfig[next].label}</option>)}
                          </select>
                        )}
                        {canPrint && <button disabled={printTargetId !== null} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50" title={printTargetId === r._id ? "جارٍ تجهيز الطباعة..." : "طباعة"} onClick={() => { if (canPrint && printTargetId === null) setPrintTargetId(r._id); }}><Printer className="h-4 w-4" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {requiresBranchSelection && <div className="py-14 text-center text-slate-400"><Wrench className="mx-auto mb-2 h-10 w-10 opacity-30" />اختر الفرع لعرض أوامر الصيانة</div>}
        {!requiresBranchSelection && repairsQuery === undefined && <div className="py-14 text-center text-slate-400">جارٍ تحميل أوامر الصيانة</div>}
        {!requiresBranchSelection && repairsQuery !== undefined && filtered.length === 0 && (
          <div className="py-14 text-center text-slate-400">{repairs.length === 0 ? "لا توجد أوامر صيانة في هذا الفرع" : "لا توجد نتائج مطابقة للبحث أو الفلتر"}</div>
        )}
      </section>

      {detailTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-3" dir="rtl" data-testid="repair-details-dialog">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
              <div><p className="text-xs text-slate-300">أمر صيانة</p><h2 className="text-xl font-black">{detailTarget.repairNumber}</h2></div>
              <button className="rounded-lg p-2 hover:bg-white/10" onClick={() => setDetailTarget(null)}><X className="h-5 w-5" /></button>
            </header>
            <div className="p-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">العميل</p><p className="font-black">{detailTarget.customerName}</p><p className="text-xs text-slate-500">{detailTarget.customerPhone}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الجهاز</p><p className="font-black">{detailTarget.deviceBrand} {detailTarget.deviceModel}</p><p className="text-xs text-slate-500">{detailTarget.deviceType}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الفني</p><p className="font-black">{detailTarget.technicianName ?? "غير معيّن"}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الحالة</p><span className={`badge ${statusConfig[isRepairStatus(detailTarget.status) ? detailTarget.status : "received"].badge}`}>{statusConfig[isRepairStatus(detailTarget.status) ? detailTarget.status : "received"].label}</span></div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-black text-slate-800">بيانات العمل</h3>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-500">المشكلة</dt><dd className="font-medium">{detailTarget.problem}</dd></div>
                    <div><dt className="text-xs text-slate-500">التشخيص</dt><dd className="font-medium">{detailTarget.diagnosis ?? "—"}</dd></div>
                    <div><dt className="text-xs text-slate-500">السيريال</dt><dd>{detailTarget.serialNumber ?? "—"}</dd></div>
                    <div><dt className="text-xs text-slate-500">الملحقات</dt><dd>{detailTarget.accessories ?? "—"}</dd></div>
                    <div><dt className="text-xs text-slate-500">حالة الجهاز عند الاستلام</dt><dd>{detailTarget.intakeCondition ?? "—"}</dd></div>
                    <div><dt className="text-xs text-slate-500">اختبار الجودة</dt><dd>{detailTarget.qualityCheckNotes ?? "—"}</dd></div>
                  </dl>
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-black text-slate-500">القطع المستخدمة</p>
                    {detailTarget.parts.length === 0 ? <p className="text-sm text-slate-400">لا توجد قطع مسجلة</p> : detailTarget.parts.map((part, index) => <div key={`${part.productId ?? part.name}-${index}`} className="flex justify-between border-b border-slate-50 py-1.5 text-sm"><span>{part.name} × {part.quantity}</span><strong>{money(part.lineTotal ?? part.cost * part.quantity)}</strong></div>)}
                  </div>
                </section>
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-black text-slate-800">الحساب</h3>
                  <div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span>الإجمالي</span><strong>{money(detailTarget.totalCost)}</strong></div><div className="flex justify-between"><span>المحصل</span><strong className="text-emerald-700">{money(detailTarget.deposit)}</strong></div><div className="flex justify-between border-t pt-2"><span>المتبقي</span><strong className={detailTarget.remaining > 0 ? "text-amber-700" : "text-emerald-700"}>{money(detailTarget.remaining)}</strong></div></div>
                  <div className="mt-4"><FinancialHistory referenceType="repair" referenceId={String(detailTarget._id)} /></div>
                </section>
              </div>
              {detailTarget.status === "ready" && canEdit && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>تم إنهاء الإصلاح فنيًا.</strong> يمكنك ما زلت تعديل القطع المستخدمة وأجرة الصيانة قبل التسليم.</div>}
              {detailTarget.trackingToken && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <div><p className="text-xs text-indigo-500">رمز التتبع</p><p className="font-mono text-xs font-black text-indigo-800">{detailTarget.trackingToken}</p></div>
                  <div className="flex gap-2">
                    <button disabled={trackingBusyId === detailTarget._id} className="btn-secondary text-xs" onClick={() => void copyTrackingLink(detailTarget._id, detailTarget.trackingToken!, detailTarget.repairNumber)}><Copy className="h-4 w-4" /> نسخ الرابط</button>
                    {canEdit && <button disabled={trackingBusyId === detailTarget._id} className="btn-secondary text-xs" onClick={() => void handleRotateTrackingToken(detailTarget._id, detailTarget.repairNumber)}><RefreshCw className="h-4 w-4" /> تجديد</button>}
                    <a className="btn-secondary text-xs" target="_blank" rel="noopener noreferrer" href={buildEgyptWhatsAppUrl(detailTarget.customerPhone, `مرحباً ${detailTarget.customerName}،\nرابط متابعة أمر الصيانة الخاص بك:\n${window.location.origin}${window.location.pathname}#track=${detailTarget.trackingToken}\n\nرقم أمر الصيانة: ${detailTarget.repairNumber}`)}><MessageCircle className="h-4 w-4" /> واتساب</a>
                  </div>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                {canEdit && !["delivered", "cancelled"].includes(detailTarget.status) && <button className="btn-primary" data-testid="repair-work-edit-detail" onClick={() => setWorkTarget(detailTarget)}><Pencil className="h-4 w-4" /> تعديل العمل والقطع</button>}
                {canEdit && ["received", "in_progress"].includes(detailTarget.status) && <button className="btn-secondary" onClick={() => openEdit(detailTarget)}>بيانات وفني</button>}
                {canCollect && detailTarget.remaining > 0 && detailTarget.status !== "delivered" && detailTarget.status !== "cancelled" && <button className="btn-secondary" onClick={() => openCollection(detailTarget)}>تحصيل دفعة</button>}
                {canRefund && detailTarget.deposit > 0 && <button className="btn-secondary" onClick={() => openRefund(detailTarget)}>استرداد مبلغ</button>}
                <button className="btn-secondary" onClick={() => setHistoryTarget(detailTarget)}>السجل</button>
                {canPrint && <button disabled={printTargetId !== null} className="btn-secondary" onClick={() => { if (canPrint && printTargetId === null) setPrintTargetId(detailTarget._id); }}><Printer className="h-4 w-4" /> طباعة</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {workTarget && <RepairWorkEditDialog repair={workTarget} onClose={() => setWorkTarget(null)} onSaved={() => setDetailTarget(null)} />}

      {collectionTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">تحصيل دفعة — {collectionTarget.repairNumber}</h2>
            <form data-testid="repair-collection-form" className="mt-4 space-y-4" onSubmit={submitCollection}>
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="text-xs text-slate-500">الإجمالي</p><p className="font-bold">{money(collectionTarget.totalCost)}</p></div><div><p className="text-xs text-slate-500">المتبقي</p><p className="font-bold text-amber-700">{money(collectionTarget.remaining)}</p></div></div>
              <label className="block"><span className="form-label">المبلغ *</span><input data-testid="repair-collection-amount" required type="number" min="0.01" max={collectionTarget.remaining} step="0.01" className="form-input" value={collectionForm.amount} onChange={(event) => setCollectionForm({ ...collectionForm, amount: event.target.value })} /></label>
              <label className="block"><span className="form-label">حساب التحصيل *</span><select data-testid="repair-collection-account" required className="form-input" value={collectionForm.accountId} onChange={(event) => setCollectionForm({ ...collectionForm, accountId: event.target.value })}><option value="">اختر الحساب</option>{targetCollectionAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select></label>
              <label className="block"><span className="form-label">تاريخ التحصيل *</span><input data-testid="repair-collection-date" required type="date" className="form-input" value={collectionForm.date} onChange={(event) => setCollectionForm({ ...collectionForm, date: event.target.value })} /></label>
              <label className="block"><span className="form-label">ملاحظات</span><textarea rows={2} className="form-input" value={collectionForm.notes} onChange={(event) => setCollectionForm({ ...collectionForm, notes: event.target.value })} /></label>
              {collectionValidationReason && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">{collectionValidationReason}</p>}
              <div className="flex gap-3"><button data-testid="repair-collection-submit" className="btn-primary flex-1" disabled={financialBusy !== null || Boolean(collectionValidationReason)}>{financialBusy === "collection" ? "جارٍ التحصيل..." : "تأكيد التحصيل"}</button><button type="button" className="btn-secondary" disabled={financialBusy !== null} onClick={() => setCollectionTarget(null)}>إلغاء</button></div>
            </form>
          </div>
        </div>
      )}

      {refundTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">استرداد مبلغ — {refundTarget.repairNumber}</h2>
            <form className="mt-4 space-y-4" onSubmit={submitRefund}>
              <label className="block"><span className="form-label">المبلغ *</span><input required type="number" min="0.01" max={refundTarget.deposit} step="0.01" className="form-input" value={refundForm.amount} onChange={(event) => setRefundForm({ ...refundForm, amount: event.target.value })} /></label>
              <label className="block"><span className="form-label">حساب الاسترداد *</span><select required className="form-input" value={refundForm.accountId} onChange={(event) => setRefundForm({ ...refundForm, accountId: event.target.value })}><option value="">اختر الحساب</option>{targetRefundAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select></label>
              <label className="block"><span className="form-label">التاريخ *</span><input required type="date" className="form-input" value={refundForm.date} onChange={(event) => setRefundForm({ ...refundForm, date: event.target.value })} /></label>
              <label className="block"><span className="form-label">سبب الاسترداد *</span><textarea required rows={3} className="form-input" value={refundForm.reason} onChange={(event) => setRefundForm({ ...refundForm, reason: event.target.value })} /></label>
              {refundValidationReason && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">{refundValidationReason}</p>}
              <div className="flex gap-3"><button className="btn-primary flex-1" disabled={financialBusy !== null || Boolean(refundValidationReason)}>{financialBusy === "refund" ? "جارٍ الاسترداد..." : "تأكيد الاسترداد"}</button><button type="button" className="btn-secondary" disabled={financialBusy !== null} onClick={() => setRefundTarget(null)}>إلغاء</button></div>
            </form>
          </div>
        </div>
      )}

      {transitionTarget && transitionNext && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">تغيير حالة {transitionTarget.repairNumber}</h2>
            <p className="mt-1 text-sm text-slate-500">إلى: <strong>{statusConfig[transitionNext].label}</strong></p>
            <form className="mt-4 space-y-4" onSubmit={submitTransition}>
              <label className="block"><span className="form-label">تاريخ العملية *</span><input type="date" className="form-input" value={transitionForm.date} onChange={(event) => setTransitionForm({ ...transitionForm, date: event.target.value })} /></label>
              {(transitionNext === "ready" || transitionNext === "in_progress") && <label className="block"><span className="form-label">التشخيص {transitionNext === "ready" ? "*" : ""}</span><textarea rows={3} className="form-input" value={transitionForm.diagnosis} onChange={(event) => setTransitionForm({ ...transitionForm, diagnosis: event.target.value })} /></label>}
              {transitionNext === "ready" && <label className="block"><span className="form-label">اختبار الجودة</span><textarea rows={2} className="form-input" value={transitionForm.qualityCheckNotes} onChange={(event) => setTransitionForm({ ...transitionForm, qualityCheckNotes: event.target.value })} /></label>}
              {transitionNext === "delivered" && <label className="block"><span className="form-label">مدة الضمان بالأيام</span><input type="number" min="0" max="365" step="1" className="form-input" value={transitionForm.warrantyDays} onChange={(event) => setTransitionForm({ ...transitionForm, warrantyDays: event.target.value })} /></label>}
              {transitionNext === "cancelled" && <label className="block"><span className="form-label">سبب الإلغاء *</span><textarea rows={3} className="form-input" value={transitionForm.reason} onChange={(event) => setTransitionForm({ ...transitionForm, reason: event.target.value })} /></label>}
              {transitionValidationReason && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">{transitionValidationReason}</p>}
              <div className="flex gap-3"><button className="btn-primary flex-1" disabled={updatingId !== null || Boolean(transitionValidationReason)}>{updatingId ? "جارٍ الحفظ..." : "تأكيد الانتقال"}</button><button type="button" className="btn-secondary" disabled={updatingId !== null} onClick={() => { setTransitionTarget(null); setTransitionNext(null); }}>تراجع</button></div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">بيانات أمر الصيانة {editTarget.repairNumber}</h2>
            <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={saveDetails}>
              <label><span className="form-label">الفني المسؤول</span><select className="form-input" value={editForm.technicianProfileId} onChange={(event) => setEditForm({ ...editForm, technicianProfileId: event.target.value })}><option value="">اختر الفني</option>{technicianOptions.map((technician) => <option key={technician._id} value={technician._id}>{technician.name}</option>)}</select></label>
              <label><span className="form-label">تاريخ التسليم المتوقع</span><input type="date" className="form-input" value={editForm.expectedDate} onChange={(event) => setEditForm({ ...editForm, expectedDate: event.target.value })} /></label>
              <label><span className="form-label">الرقم المسلسل</span><input className="form-input" value={editForm.serialNumber} onChange={(event) => setEditForm({ ...editForm, serialNumber: event.target.value })} /></label>
              <label><span className="form-label">الملحقات المستلمة</span><input className="form-input" value={editForm.accessories} onChange={(event) => setEditForm({ ...editForm, accessories: event.target.value })} /></label>
              <label className="sm:col-span-2"><span className="form-label">حالة الجهاز عند الاستلام</span><textarea className="form-input" rows={2} value={editForm.intakeCondition} onChange={(event) => setEditForm({ ...editForm, intakeCondition: event.target.value })} /></label>
              <label className="sm:col-span-2"><span className="form-label">التشخيص</span><textarea className="form-input" rows={3} value={editForm.diagnosis} onChange={(event) => setEditForm({ ...editForm, diagnosis: event.target.value })} /></label>
              <label className="sm:col-span-2"><span className="form-label">اختبار الجودة</span><textarea className="form-input" rows={2} value={editForm.qualityCheckNotes} onChange={(event) => setEditForm({ ...editForm, qualityCheckNotes: event.target.value })} /></label>
              <label className="sm:col-span-2"><span className="form-label">ملاحظات</span><textarea className="form-input" rows={2} value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></label>
              {editValidationReason && <p role="alert" className="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">{editValidationReason}</p>}
              <div className="flex gap-3 sm:col-span-2"><button className="btn-primary flex-1" disabled={updatingId !== null || Boolean(editValidationReason)}>{updatingId ? "جارٍ الحفظ..." : "حفظ التفاصيل"}</button><button type="button" className="btn-secondary" disabled={updatingId !== null} onClick={() => setEditTarget(null)}>إغلاق</button></div>
            </form>
          </div>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-lg font-black">سجل {historyTarget.repairNumber}</h2><button className="btn-secondary" onClick={() => setHistoryTarget(null)}>إغلاق</button></div>
            <div className="mt-4 space-y-3">
              {history.status === "LoadingFirstPage" && <p className="py-8 text-center text-sm text-slate-400">جارٍ تحميل سجل الصيانة</p>}
              {history.results.map((entry) => <div key={entry._id} className="rounded-xl border border-slate-200 p-3"><div className="flex justify-between gap-3"><span className="font-bold">{entry.fromStatus ? `${statusConfig[entry.fromStatus].label} ← ` : ""}{statusConfig[entry.toStatus].label}</span><span className="text-xs text-slate-500">{entry.date}</span></div><p className="mt-1 text-xs text-slate-500">بواسطة {entry.employeeName}</p>{entry.technicianName && <p className="mt-1 text-xs">الفني: {entry.technicianName}</p>}{entry.diagnosis && <p className="mt-1 text-xs">التشخيص: {entry.diagnosis}</p>}{entry.qualityCheckNotes && <p className="mt-1 text-xs">اختبار الجودة: {entry.qualityCheckNotes}</p>}{entry.reason && <p className="mt-1 text-xs text-red-700">السبب: {entry.reason}</p>}</div>)}
              {history.status === "Exhausted" && history.results.length === 0 && <p className="py-8 text-center text-sm text-slate-400">لا توجد حركات.</p>}
              {history.status === "CanLoadMore" && <button className="btn-secondary w-full" onClick={() => history.loadMore(10)}>تحميل المزيد</button>}
              {history.status === "LoadingMore" && <p className="py-3 text-center text-sm text-slate-400">جارٍ تحميل المزيد</p>}
            </div>
          </div>
        </div>
      )}

      {canPrint && printRepair && <PrintModal type="repair" data={printRepair} onClose={() => setPrintRepair(null)} />}

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5"><h2 className="text-lg font-black">أمر صيانة جديد</h2><button onClick={closeCreateForm} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <form data-testid="repair-create-form" onSubmit={handleSubmit} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="form-label">اختر عميل</span><select data-testid="repair-customer-select" className="form-input" value={form.customerId} onChange={(event) => handleSelectCustomer(event.target.value)}><option value="">عميل جديد</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}</option>)}</select></label>
                <label><span className="form-label">اسم العميل *</span><input className="form-input" required value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} /></label>
                <label><span className="form-label">رقم الهاتف *</span><input className="form-input" required value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} /></label>
                <label><span className="form-label">نوع الجهاز *</span><select className="form-input" value={form.deviceType} onChange={(event) => setForm({ ...form, deviceType: event.target.value })}><option>موبايل</option><option>لابتوب</option><option>تابلت</option><option>بلايستيشن</option><option>أخرى</option></select></label>
                <label><span className="form-label">الماركة *</span><input data-testid="repair-device-brand" className="form-input" required value={form.deviceBrand} onChange={(event) => setForm({ ...form, deviceBrand: event.target.value })} /></label>
                <label><span className="form-label">الموديل *</span><input data-testid="repair-device-model" className="form-input" required value={form.deviceModel} onChange={(event) => setForm({ ...form, deviceModel: event.target.value })} /></label>
                <label><span className="form-label">الرقم المسلسل</span><input className="form-input" value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></label>
                <label><span className="form-label">الملحقات المستلمة</span><input className="form-input" value={form.accessories} onChange={(event) => setForm({ ...form, accessories: event.target.value })} /></label>
                <label className="sm:col-span-2"><span className="form-label">حالة الجهاز عند الاستلام</span><textarea rows={2} className="form-input" value={form.intakeCondition} onChange={(event) => setForm({ ...form, intakeCondition: event.target.value })} /></label>
                <label className="sm:col-span-2"><span className="form-label">وصف المشكلة *</span><textarea data-testid="repair-problem" rows={2} required className="form-input" value={form.problem} onChange={(event) => setForm({ ...form, problem: event.target.value })} /></label>
              </div>
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between"><div><h3 className="font-black">قطع الغيار</h3><p className="text-xs text-slate-500">يمكن تركها فارغة وإضافة القطع الفعلية لاحقًا حتى بعد انتهاء الفني وقبل التسليم.</p></div><button type="button" className="btn-secondary text-xs" onClick={() => setParts((current) => [...current, { productId: "", quantity: "1" }])}>إضافة قطعة</button></div>
                <div className="mt-3 space-y-2">{parts.map((row, index) => <div key={`${index}-${row.productId}`} className="grid gap-2 sm:grid-cols-[1fr_110px_auto]"><select className="form-input" value={row.productId} onChange={(event) => setParts((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, productId: event.target.value } : item))}><option value="">اختر قطعة الغيار</option>{partOptions.map((part) => <option key={part._id} value={part._id}>{part.name} — متاح {part.stock} — {money(part.sellPrice)}</option>)}</select><input aria-label="كمية قطعة الغيار" type="number" min="1" step="1" className="form-input" value={row.quantity} onChange={(event) => setParts((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, quantity: event.target.value } : item))} /><button type="button" className="rounded-lg px-3 text-xs font-bold text-red-600 hover:bg-red-50" onClick={() => setParts((current) => current.filter((_, rowIndex) => rowIndex !== index))}>حذف</button></div>)}</div>
                <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm font-black"><span>إجمالي القطع</span><span>{money(partsTotal)}</span></div>
              </section>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="form-label">تكلفة العمالة</span><input data-testid="repair-labor-cost" type="number" min="0" step="0.01" className="form-input" value={form.laborCost} onChange={(event) => setForm({ ...form, laborCost: event.target.value })} /></label>
                <label><span className="form-label">العربون</span><input type="number" min="0" step="0.01" className="form-input" disabled={!canCollect} value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} />{canCollect && Number(form.deposit) > 0 && <select className="form-input mt-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">اختر حساب التحصيل</option>{initialDepositAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select>}</label>
                <label><span className="form-label">الفني المسؤول</span><select className="form-input" value={form.technicianProfileId} onChange={(event) => setForm({ ...form, technicianProfileId: event.target.value })}><option value="">يُعيّن لاحقًا</option>{technicianOptions.map((technician) => <option key={technician._id} value={technician._id}>{technician.name}</option>)}</select></label>
                <label><span className="form-label">تاريخ التسليم المتوقع</span><input type="date" className="form-input" value={form.expectedDate} onChange={(event) => setForm({ ...form, expectedDate: event.target.value })} /></label>
                <label className="sm:col-span-2"><span className="form-label">ملاحظات</span><textarea data-testid="repair-notes" rows={2} className="form-input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
              </div>
              <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-800">إجمالي أمر الصيانة: {money(Number(form.laborCost || 0) + partsTotal)}</div>
              {createValidationReason && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">{createValidationReason}</p>}
              <div className="flex gap-3"><button data-testid="repair-submit" className="btn-primary flex-1" disabled={saving || Boolean(createValidationReason)}>{saving ? "جارٍ الحفظ..." : "حفظ أمر الصيانة"}</button><button type="button" className="btn-secondary" onClick={closeCreateForm}>إلغاء</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
