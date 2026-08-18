import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Banknote,
  Ban,
  CheckCircle2,
  Eye,
  PackageCheck,
  Printer,
  RotateCcw,
  Truck,
  WalletCards,
  X,
} from "lucide-react";

const requestId = () => crypto.randomUUID();
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const money = new Intl.NumberFormat("ar-EG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const statusLabels: Record<string, string> = {
  pending: "قيد التجهيز",
  shipped: "في الطريق",
  delivered: "تم التسليم",
  returned: "مرتجع",
  cancelled: "ملغى",
  posted: "تمت التسوية",
  reversed: "ملغاة",
};

const statusLabel = (status: string) => statusLabels[status] ?? status;

type Modal =
  | "create"
  | "ship"
  | "deliver"
  | "return"
  | "cancel"
  | "reverse-confirmation"
  | "settle"
  | "reverse-settlement"
  | "details"
  | null;

type Selected = {
  _id: Id<"deliveries">;
  deliveryNumber: string;
  status: string;
  codAmount?: number;
  branchId?: Id<"branches">;
};

const operationSuccessMessage = (modal: Exclude<Modal, "details" | null>) =>
  ({
    create: "تم إنشاء الشحنة بنجاح",
    ship: "تم تسجيل إرسال الشحنة",
    deliver: "تم تسجيل التسليم والتحصيل بنجاح",
    return: "تم تسجيل مرتجع الشحنة",
    cancel: "تم إلغاء الشحنة",
    "reverse-confirmation": "تم إلغاء تسجيل التسليم وإعادة الشحنة للحالة السابقة",
    settle: "تمت تسوية مبالغ التحصيل بنجاح",
    "reverse-settlement": "تم إلغاء تسوية التحصيل",
  })[modal];

export function DeliveriesPage({ createRequestToken }: { createRequestToken?: number }) {
  const convex = useConvex();
  const canCreate = usePermission("create_deliveries");
  const canEdit = usePermission("edit_deliveries");
  const canConfirm = usePermission("confirm_cod_deliveries");
  const canViewSettlements = usePermission("view_cod_settlements");
  const canSettle = usePermission("settle_cod_collections");
  const canReverse = usePermission("reverse_cod_collections");
  const canPrint = usePermission("print_cod_settlements");
  const canViewBranches = usePermission("view_branches");

  const me = useQuery(api.employees.me);
  const branches = useQuery(api.branches.list, canViewBranches ? {} : "skip");

  const [branchId, setBranchId] = useState<Id<"branches"> | undefined>(me?.branchId);
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [busy, setBusy] = useState(false);

  const [orderId, setOrderId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [company, setCompany] = useState("");
  const [tracking, setTracking] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [accountId, setAccountId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selectedSettlementId, setSelectedSettlementId] = useState<Id<"codSettlements"> | null>(null);
  const [reversalReason, setReversalReason] = useState("");

  const operationRequestId = useRef(requestId());
  const activeBranch = branchId ?? me?.branchId;

  const deliveries = usePaginatedQuery(
    api.deliveries.listPaginated,
    activeBranch ? { branchId: activeBranch } : "skip",
    { initialNumItems: 20 },
  );
  const options = useQuery(
    api.deliveries.creationOptions,
    canCreate && activeBranch ? { branchId: activeBranch } : "skip",
  );
  const confirmationAccounts = useQuery(
    api.deliveries.accountPicker,
    canConfirm && activeBranch ? { branchId: activeBranch, purpose: "confirmation_cod" } : "skip",
  );
  const settlementSources = useQuery(
    api.deliveries.accountPicker,
    canSettle && activeBranch ? { branchId: activeBranch, purpose: "settlement_source" } : "skip",
  );
  const destinations = useQuery(
    api.deliveries.accountPicker,
    canSettle && activeBranch ? { branchId: activeBranch, purpose: "settlement_destination" } : "skip",
  );
  const unsettled = useQuery(
    api.deliveries.unsettled,
    canSettle && activeBranch && accountId
      ? { branchId: activeBranch, sourceAccountId: accountId as Id<"financialAccounts"> }
      : "skip",
  );
  const stats = useQuery(api.deliveries.getStats, activeBranch ? { branchId: activeBranch } : "skip");
  const settlements = usePaginatedQuery(
    api.deliveries.listSettlements,
    canViewSettlements && activeBranch ? { branchId: activeBranch } : "skip",
    { initialNumItems: 10 },
  );
  const deliveryDetails = useQuery(
    api.deliveries.get,
    modal === "details" && selected ? { id: selected._id } : "skip",
  );

  const chosenOrder = options?.find(order => String(order.orderId) === orderId);
  const chosenInvoice = chosenOrder?.invoices.find(invoice => String(invoice.invoiceId) === invoiceId);
  const gross = useMemo(
    () =>
      unsettled
        ?.filter(delivery => checked.has(String(delivery._id)))
        .reduce((sum, delivery) => sum + (delivery.codAmount ?? 0), 0) ?? 0,
    [unsettled, checked],
  );

  const createDelivery = useMutation(api.deliveries.createFromOrderInvoice);
  const updateStatus = useMutation(api.deliveries.updateStatus);
  const confirmDelivered = useMutation(api.deliveries.confirmDelivered);
  const createSettlement = useMutation(api.deliveries.createCodSettlement);
  const reverseSettlement = useMutation(api.deliveries.reverseCodSettlement);
  const reverseConfirmation = useMutation(api.deliveries.reverseConfirmation);

  const resetOperationState = () => {
    setOrderId("");
    setInvoiceId("");
    setCity("");
    setAddress("");
    setCompany("");
    setTracking("");
    setFee("0");
    setDate(new Date().toISOString().slice(0, 10));
    setReason("");
    setAccountId("");
    setDestinationId("");
    setChecked(new Set<string>());
    setSelectedSettlementId(null);
    setReversalReason("");
  };

  const open = (kind: Modal, row?: Selected) => {
    resetOperationState();
    setSelected(row ?? null);
    operationRequestId.current = requestId();
    setModal(kind);
  };

  useEffect(() => {
    if (createRequestToken && canCreate && activeBranch) open("create");
  }, [createRequestToken, canCreate, activeBranch]);

  const openSettlementReversal = (settlementId: Id<"codSettlements">) => {
    resetOperationState();
    setSelectedSettlementId(settlementId);
    operationRequestId.current = requestId();
    setModal("reverse-settlement");
  };

  const handleBranchChange = (value: string) => {
    setBranchId(value ? (value as Id<"branches">) : undefined);
    resetOperationState();
    setSelected(null);
    setModal(null);
    operationRequestId.current = requestId();
  };

  const close = () => {
    if (!busy) setModal(null);
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(message);
      resetOperationState();
      setSelected(null);
      operationRequestId.current = requestId();
      setModal(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إتمام العملية"));
    } finally {
      setBusy(false);
    }
  };

  const feeAmount = Number(fee);
  const validationReason = (() => {
    if (!modal || modal === "details") return null;

    if (modal === "create") {
      if (!activeBranch) return "اختر الفرع";
      if (!chosenOrder) return "اختر أمر البيع";
      if (!chosenInvoice) return "اختر الفاتورة";
      if (!city.trim()) return "أدخل المدينة";
      if (!address.trim()) return "أدخل عنوان التسليم";
      if (!company.trim()) return "أدخل شركة الشحن";
      if (!Number.isFinite(feeAmount) || feeAmount < 0) return "أدخل رسوم شحن صحيحة";
      if (!isIsoDate(date)) return "اختر تاريخًا صالحًا";
      return null;
    }

    if (!selected && modal !== "settle" && modal !== "reverse-settlement") {
      return "اختر الشحنة";
    }

    if (modal === "deliver") {
      if ((selected?.codAmount ?? 0) > 0 && !accountId) return "اختر حساب وسيط التحصيل";
      if (!isIsoDate(date)) return "اختر تاريخ التسليم";
      return null;
    }

    if (modal === "return" || modal === "cancel" || modal === "reverse-confirmation") {
      if (!reason.trim()) return "اكتب سبب العملية";
      if (modal === "reverse-confirmation" && !isIsoDate(date)) return "اختر تاريخ إلغاء تسجيل التسليم";
      return null;
    }

    if (modal === "settle") {
      if (!activeBranch) return "اختر الفرع";
      if (!accountId) return "اختر حساب مبالغ التحصيل";
      if (!destinationId) return "اختر الخزينة أو البنك المستلم";
      if (accountId === destinationId) return "يجب أن يختلف حساب التحصيل عن الحساب المستلم";
      if (checked.size === 0) return "اختر شحنة واحدة على الأقل";
      if (gross <= 0) return "إجمالي المبلغ المحدد يجب أن يكون أكبر من صفر";
      if (!Number.isFinite(feeAmount) || feeAmount < 0) return "أدخل رسوم التسوية بصورة صحيحة";
      if (feeAmount > gross) return "لا يمكن أن تتجاوز الرسوم إجمالي المبالغ المحددة";
      if (!isIsoDate(date)) return "اختر تاريخ التسوية";
      return null;
    }

    if (modal === "reverse-settlement") {
      if (!selectedSettlementId) return "اختر التسوية";
      if (!reversalReason.trim()) return "اكتب سبب إلغاء التسوية";
      if (!isIsoDate(date)) return "اختر تاريخ إلغاء التسوية";
      return null;
    }

    return null;
  })();

  const openPrintWindow = (title: string, bodyHtml: string) => {
    const popup = window.open("", "_blank");
    if (!popup) throw new Error("تعذر فتح نافذة الطباعة");
    popup.opener = null;
    popup.document.body.innerHTML = `<html dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:8px}.signatures{display:flex;justify-content:space-between;margin-top:48px}</style></head><body><h1>${escapeHtml(title)}</h1>${bodyHtml}<div class="signatures"><span>توقيع شركة الشحن: __________</span><span>توقيع المحاسب: __________</span></div></body></html>`;
    popup.document.close();
    popup.print();
  };

  const printDelivery = async (row: Selected) => {
    if (busy || !canPrint) return;
    setBusy(true);
    try {
      const dto = await convex.query(api.deliveries.printDelivery, { deliveryId: row._id });
      const itemRows = dto.items
        .map(item => `<tr><td>${escapeHtml(item.productName)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(money.format(item.unitPrice))}</td></tr>`)
        .join("");
      openPrintWindow(
        `سند شحن ${dto.deliveryNumber}`,
        `<p>أمر البيع: ${escapeHtml(dto.orderNumber ?? "—")} | الفاتورة: ${escapeHtml(dto.invoiceNumber ?? "—")}</p><p>العميل: ${escapeHtml(dto.customerName)} — ${escapeHtml(dto.city)}</p><p>العنوان: ${escapeHtml(dto.address)}</p><p>شركة الشحن: ${escapeHtml(dto.shippingCompany)} | رقم التتبع: ${escapeHtml(dto.trackingNumber ?? "—")}</p><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th></tr></thead><tbody>${itemRows}</tbody></table><p>الإجمالي: ${escapeHtml(money.format(dto.totalAmount))} | المدفوع مقدمًا: ${escapeHtml(money.format(dto.prepaidAmount ?? 0))} | المطلوب تحصيله: ${escapeHtml(money.format(dto.codAmount ?? 0))}</p><p>الحالة: ${escapeHtml(statusLabel(dto.status))}</p>`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذرت طباعة سند الشحن"));
    } finally {
      setBusy(false);
    }
  };

  const printSettlement = async (settlementId: Id<"codSettlements">) => {
    if (busy || !canPrint) return;
    setBusy(true);
    try {
      const dto = await convex.query(api.deliveries.printCodSettlement, { settlementId });
      const itemRows = dto.items
        .map(item => `<tr><td>${escapeHtml(item.deliveryNumber)}</td><td>${escapeHtml(item.invoiceNumber)}</td><td>${escapeHtml(money.format(item.codAmount))}</td></tr>`)
        .join("");
      openPrintWindow(
        `سند تسوية ${dto.settlementNumber}`,
        `<p>التاريخ: ${escapeHtml(dto.date)} | الحالة: ${escapeHtml(statusLabel(dto.status))}</p><p>حساب التحصيل: ${escapeHtml(dto.sourceAccountName)} | الحساب المستلم: ${escapeHtml(dto.destinationAccountName)}</p><table><thead><tr><th>رقم الشحنة</th><th>الفاتورة</th><th>المبلغ المحصل</th></tr></thead><tbody>${itemRows}</tbody></table><p>الإجمالي: ${escapeHtml(money.format(dto.grossAmount))} | الرسوم: ${escapeHtml(money.format(dto.feeAmount))} | الصافي: ${escapeHtml(money.format(dto.netAmount))}</p>${dto.reversalReason ? `<p>سبب الإلغاء: ${escapeHtml(dto.reversalReason)}</p>` : ""}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذرت طباعة التسوية"));
    } finally {
      setBusy(false);
    }
  };

  const rows = deliveries.results;
  const deliveryLoading = Boolean(activeBranch && deliveries.status === "LoadingFirstPage");
  const deliveryEmpty = Boolean(activeBranch && deliveries.status !== "LoadingFirstPage" && rows.length === 0);
  const settlementLoading = Boolean(activeBranch && settlements.status === "LoadingFirstPage");
  const settlementEmpty = Boolean(activeBranch && settlements.status !== "LoadingFirstPage" && settlements.results.length === 0);

  const statusClass = (status: string) => {
    if (status === "delivered" || status === "posted") return "badge-success";
    if (status === "shipped" || status === "pending") return "badge-info";
    if (status === "returned") return "badge-warning";
    return "badge-danger";
  };

  const metricCards = [
    {
      label: "قيد التحصيل لدى شركات الشحن",
      value: stats?.codWithCarriers,
      icon: Truck,
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "تمت تسويته",
      value: stats?.codSettled,
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "أُلغي تحصيله",
      value: stats?.codReversed,
      icon: RotateCcw,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "رسوم شركات الشحن",
      value: stats?.carrierFees,
      icon: CircleDollarSign,
      tone: "bg-rose-50 text-rose-700",
    },
  ];

  return (
    <div dir="rtl" className="space-y-6 p-4 lg:p-6" data-testid="deliveries-page">
      <header className="erp-page-header">
        <div>
          <div className="erp-page-title">
            <Truck className="h-6 w-6 text-emerald-600" />
            إدارة الشحن والتوصيل
          </div>
          <p className="erp-page-subtitle">
            متابعة الشحنات من التجهيز وحتى التسليم وتسوية مبالغ التحصيل
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {branches && (
            <select
              data-testid="delivery-branch-select"
              className="form-input min-w-52"
              value={activeBranch ?? ""}
              onChange={event => handleBranchChange(event.target.value)}
              aria-label="فرع الشحن"
            >
              <option value="">اختر الفرع</option>
              {branches.filter(branch => branch.isActive).map(branch => (
                <option key={branch._id} value={branch._id}>{branch.name}</option>
              ))}
            </select>
          )}
          {canCreate && (
            <button
              data-testid="delivery-create-open"
              className="btn-primary"
              onClick={() => open("create")}
              disabled={!activeBranch}
            >
              شحنة جديدة
            </button>
          )}
        </div>
      </header>

      {!activeBranch && (
        <div role="status" className="erp-info-state">
          اختر الفرع لعرض الشحنات والتسويات الخاصة به.
        </div>
      )}

      <section className="erp-metric-grid">
        {metricCards.map(card => {
          const Icon = card.icon;
          return (
            <div className="erp-metric-card" key={card.label}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="erp-metric-label">{card.label}</p>
                  <p className="erp-metric-value">
                    {stats === undefined ? "…" : money.format(Number(card.value ?? 0))}
                  </p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="erp-section">
        <div className="erp-section-header">
          <div>
            <h2 className="erp-section-title">الشحنات</h2>
            <p className="mt-1 text-xs text-slate-400">متابعة حالة كل شحنة والمبلغ المطلوب تحصيله</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th>رقم الشحنة</th>
                <th>العميل</th>
                <th>الحالة</th>
                <th>المبلغ المطلوب تحصيله</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {deliveryLoading && (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">جارٍ تحميل الشحنات…</td></tr>
              )}
              {deliveryEmpty && (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">لا توجد شحنات مسجلة في هذا الفرع.</td></tr>
              )}
              {rows.map(delivery => (
                <tr
                  key={delivery._id}
                  data-testid="delivery-row"
                  data-delivery-number={delivery.deliveryNumber}
                  data-customer-name={delivery.customerName}
                  data-status={delivery.status}
                >
                  <td className="font-mono text-xs font-bold text-blue-700">{delivery.deliveryNumber}</td>
                  <td className="font-bold text-slate-800">{delivery.customerName}</td>
                  <td><span className={`badge ${statusClass(delivery.status)}`}>{statusLabel(delivery.status)}</span></td>
                  <td className="font-black text-slate-800">{money.format(delivery.codAmount ?? 0)}</td>
                  <td>
                    <div className="erp-actions">
                      <button className="erp-action" onClick={() => open("details", delivery)} title="تفاصيل الشحنة">
                        <Eye size={15} /> تفاصيل
                      </button>
                      {canEdit && delivery.status === "pending" && (
                        <>
                          <button data-testid="delivery-ship-open" className="erp-action erp-action-primary" onClick={() => open("ship", delivery)}>
                            <Truck size={15} /> تسجيل الإرسال
                          </button>
                          <button className="erp-action erp-action-danger" onClick={() => open("cancel", delivery)}>
                            <Ban size={15} /> إلغاء الشحنة
                          </button>
                        </>
                      )}
                      {canEdit && delivery.status === "shipped" && (
                        <button className="erp-action" onClick={() => open("return", delivery)}>
                          <RotateCcw size={15} /> تسجيل مرتجع
                        </button>
                      )}
                      {canConfirm && delivery.status === "shipped" && (
                        <button data-testid="delivery-confirm-open" className="erp-action erp-action-primary" onClick={() => open("deliver", delivery)}>
                          <PackageCheck size={15} /> تسجيل التسليم
                        </button>
                      )}
                      {canReverse && delivery.status === "delivered" && (
                        <button className="erp-action erp-action-danger" onClick={() => open("reverse-confirmation", delivery)}>
                          <RotateCcw size={15} /> إلغاء تسجيل التسليم
                        </button>
                      )}
                      {canPrint && (
                        <button className="erp-action" onClick={() => void printDelivery(delivery)} title="طباعة سند الشحن">
                          <Printer size={15} /> طباعة
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(deliveries.status === "CanLoadMore" || deliveries.status === "LoadingMore") && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button
              disabled={deliveries.status === "LoadingMore"}
              onClick={() => deliveries.loadMore(20)}
              className="erp-action"
            >
              {deliveries.status === "LoadingMore" ? "جارٍ تحميل المزيد…" : "عرض المزيد"}
            </button>
          </div>
        )}
      </section>

      {canViewSettlements && (
        <section className="erp-section">
          <div className="erp-section-header">
            <div>
              <h2 className="erp-section-title">تسويات مبالغ التحصيل</h2>
              <p className="mt-1 text-xs text-slate-400">نقل المبالغ المحصلة من حساب شركة الشحن إلى الخزينة أو البنك</p>
            </div>
            {canSettle && (
              <button
                data-testid="delivery-settlement-open"
                className="btn-primary"
                onClick={() => open("settle")}
                disabled={!activeBranch}
              >
                تسوية مبالغ التحصيل
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {settlementLoading && <p role="status" className="p-5 text-slate-500">جارٍ تحميل التسويات…</p>}
            {settlementEmpty && <p className="p-5 text-slate-500">لا توجد تسويات مسجلة في هذا الفرع.</p>}
            {settlements.results.map(settlement => (
              <div key={settlement._id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-700">{settlement.settlementNumber}</span>
                    <span className={`badge ${statusClass(settlement.status)}`}>{statusLabel(settlement.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">صافي التسوية: <strong className="text-slate-800">{money.format(settlement.netAmount)}</strong></p>
                </div>
                <div className="erp-actions">
                  {canReverse && settlement.status === "posted" && (
                    <button className="erp-action erp-action-danger" onClick={() => openSettlementReversal(settlement._id)}>
                      <RotateCcw size={15} /> إلغاء التسوية
                    </button>
                  )}
                  {canPrint && (
                    <button className="erp-action" onClick={() => void printSettlement(settlement._id)}>
                      <Printer size={15} /> طباعة التسوية
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {(settlements.status === "CanLoadMore" || settlements.status === "LoadingMore") && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button
                className="erp-action"
                disabled={settlements.status === "LoadingMore"}
                onClick={() => settlements.loadMore(10)}
              >
                {settlements.status === "LoadingMore" ? "جارٍ تحميل المزيد…" : "عرض المزيد من التسويات"}
              </button>
            </div>
          )}
        </section>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div
            data-testid="delivery-action-modal"
            data-modal={modal}
            className="w-[min(96vw,720px)] max-h-[90vh] space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {{
                    create: "إنشاء شحنة جديدة",
                    ship: "تسجيل إرسال الشحنة",
                    deliver: "تسجيل التسليم والتحصيل",
                    return: "تسجيل مرتجع الشحنة",
                    cancel: "إلغاء الشحنة",
                    "reverse-confirmation": "إلغاء تسجيل التسليم",
                    settle: "تسوية مبالغ التحصيل",
                    "reverse-settlement": "إلغاء تسوية التحصيل",
                    details: "تفاصيل الشحنة",
                  }[modal]}
                </h2>
                {modal === "reverse-confirmation" && (
                  <p className="mt-1 text-sm text-slate-500">يُستخدم عند تسجيل التسليم بالخطأ لإعادة الشحنة إلى حالتها السابقة.</p>
                )}
                {modal === "reverse-settlement" && (
                  <p className="mt-1 text-sm text-slate-500">يُستخدم لإلغاء تسوية مالية تم تسجيلها بالخطأ مع الاحتفاظ بسجل المراجعة.</p>
                )}
              </div>
              <button onClick={close} aria-label="إغلاق" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modal === "details" && deliveryDetails === undefined && (
              <p role="status" className="text-slate-500">جارٍ تحميل تفاصيل الشحنة…</p>
            )}
            {modal === "details" && deliveryDetails === null && (
              <p role="alert" className="bg-red-50 p-3 text-red-700">تعذر العثور على الشحنة المطلوبة.</p>
            )}
            {modal === "details" && deliveryDetails && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                  <p><strong>رقم الشحنة:</strong> {deliveryDetails.deliveryNumber}</p>
                  <p><strong>الحالة:</strong> {statusLabel(deliveryDetails.status)}</p>
                  <p><strong>أمر البيع:</strong> {deliveryDetails.orderNumber ?? "—"}</p>
                  <p><strong>الفاتورة:</strong> {deliveryDetails.invoiceNumber ?? "—"}</p>
                  <p><strong>العميل:</strong> {deliveryDetails.customerName}</p>
                  <p><strong>الهاتف:</strong> {deliveryDetails.customerPhone}</p>
                  <p><strong>المدينة:</strong> {deliveryDetails.city}</p>
                  <p><strong>العنوان:</strong> {deliveryDetails.address}</p>
                  <p><strong>شركة الشحن:</strong> {deliveryDetails.shippingCompany}</p>
                  <p><strong>رقم التتبع:</strong> {deliveryDetails.trackingNumber ?? "—"}</p>
                  <p><strong>الإجمالي:</strong> {money.format(deliveryDetails.totalAmount)}</p>
                  <p><strong>المدفوع مقدمًا:</strong> {money.format(deliveryDetails.prepaidAmount ?? 0)}</p>
                  <p><strong>المطلوب تحصيله:</strong> {money.format(deliveryDetails.codAmount ?? 0)}</p>
                  <p><strong>رسوم الشحن:</strong> {money.format(deliveryDetails.shippingCost ?? 0)}</p>
                  <p><strong>موعد التسليم المتوقع:</strong> {deliveryDetails.expectedDate ?? "—"}</p>
                  <p><strong>تاريخ التسليم:</strong> {deliveryDetails.deliveredDate ?? "—"}</p>
                </div>
                <div>
                  <h3 className="mb-2 font-black text-slate-800">الأصناف</h3>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3">
                    {deliveryDetails.items.map((item, index) => (
                      <li key={`${item.productName}-${index}`} className="py-2.5 text-sm">
                        {item.productName} × {item.quantity} — {money.format(item.unitPrice)}
                      </li>
                    ))}
                  </ul>
                </div>
                {deliveryDetails.notes && <p><strong>ملاحظات:</strong> {deliveryDetails.notes}</p>}
                {canPrint && selected && (
                  <button className="btn-primary" onClick={() => void printDelivery(selected)} disabled={busy}>
                    <Printer size={16} /> طباعة سند الشحن
                  </button>
                )}
              </div>
            )}

            {modal === "create" && (
              <div className="space-y-3">
                {options === undefined && <p role="status" className="text-slate-500">جارٍ تحميل أوامر البيع الجاهزة للشحن…</p>}
                {options?.length === 0 && <p className="text-slate-500">لا توجد أوامر بيع جاهزة للشحن حاليًا.</p>}
                <div>
                  <label className="form-label">أمر البيع</label>
                  <select
                    data-testid="delivery-order-select"
                    className="form-input"
                    value={orderId}
                    onChange={event => {
                      setOrderId(event.target.value);
                      setInvoiceId("");
                    }}
                  >
                    <option value="">اختر أمر البيع</option>
                    {options?.map(order => (
                      <option key={order.orderId} value={order.orderId}>{order.orderNumber} — {order.customerName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">فاتورة البيع</label>
                  <select data-testid="delivery-invoice-select" className="form-input" value={invoiceId} onChange={event => setInvoiceId(event.target.value)}>
                    <option value="">اختر الفاتورة</option>
                    {chosenOrder?.invoices.map(invoice => (
                      <option key={invoice.invoiceId} value={invoice.invoiceId}>{invoice.invoiceNumber}</option>
                    ))}
                  </select>
                </div>
                {chosenInvoice && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                    <p><strong>العميل:</strong> {chosenOrder?.customerName}</p>
                    <p><strong>إجمالي الفاتورة:</strong> {money.format(chosenInvoice.netTotal)}</p>
                    <p><strong>المدفوع مقدمًا:</strong> {money.format(chosenInvoice.paid)}</p>
                    <p><strong>المطلوب تحصيله عند التسليم:</strong> {money.format(chosenInvoice.remaining)}</p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="form-label">المدينة</label><input data-testid="delivery-city" className="form-input" value={city} onChange={event => setCity(event.target.value)} /></div>
                  <div><label className="form-label">عنوان التسليم</label><input data-testid="delivery-address" className="form-input" value={address} onChange={event => setAddress(event.target.value)} /></div>
                  <div><label className="form-label">شركة الشحن</label><input data-testid="delivery-company" className="form-input" value={company} onChange={event => setCompany(event.target.value)} /></div>
                  <div><label className="form-label">رقم التتبع</label><input data-testid="delivery-tracking" className="form-input" value={tracking} onChange={event => setTracking(event.target.value)} /></div>
                  <div><label className="form-label">رسوم شركة الشحن المتوقعة</label><input data-testid="delivery-carrier-fee" className="form-input" type="number" step="0.01" min="0" value={fee} onChange={event => setFee(event.target.value)} /></div>
                </div>
                <p className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-800">رسوم شركة الشحن مصروف تشغيلي مستقل. أي مبلغ شحن يتحمله العميل يجب أن يكون مسجلًا داخل فاتورة البيع.</p>
              </div>
            )}

            {modal === "deliver" && (
              <div className="space-y-3">
                {(selected?.codAmount ?? 0) > 0 && confirmationAccounts === undefined && (
                  <p role="status" className="text-slate-500">جارٍ تحميل حسابات التحصيل…</p>
                )}
                {(selected?.codAmount ?? 0) > 0 && confirmationAccounts?.length === 0 && (
                  <p role="alert" className="bg-amber-50 p-3 text-amber-800">لا يوجد حساب وسيط للتحصيل متاح لهذا الفرع.</p>
                )}
                <div>
                  <label className="form-label">حساب وسيط التحصيل</label>
                  <select data-testid="delivery-confirmation-account" className="form-input" value={accountId} onChange={event => setAccountId(event.target.value)}>
                    <option value="">اختر الحساب</option>
                    {confirmationAccounts?.map(account => (
                      <option key={account._id} value={account._id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {modal === "settle" && (
              <div className="space-y-3">
                {settlementSources === undefined && <p role="status" className="text-slate-500">جارٍ تحميل حسابات التحصيل…</p>}
                {settlementSources?.length === 0 && <p role="alert" className="bg-amber-50 p-3 text-amber-800">لا يوجد حساب تحصيل متاح للتسوية.</p>}
                <div>
                  <label className="form-label">حساب مبالغ التحصيل</label>
                  <select
                    data-testid="delivery-settlement-source"
                    className="form-input"
                    value={accountId}
                    onChange={event => {
                      setAccountId(event.target.value);
                      setChecked(new Set<string>());
                    }}
                  >
                    <option value="">اختر الحساب</option>
                    {settlementSources?.map(account => (
                      <option key={account._id} value={account._id}>{account.name}</option>
                    ))}
                  </select>
                </div>

                {accountId && unsettled === undefined && <p role="status" className="text-slate-500">جارٍ تحميل الشحنات غير المسواة…</p>}
                {accountId && unsettled?.length === 0 && <p className="text-slate-500">لا توجد مبالغ معلقة على هذا الحساب.</p>}
                <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                  {unsettled?.map(delivery => (
                    <label key={delivery._id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                      <span className="flex items-center gap-2">
                        <input
                          data-testid="delivery-settlement-item"
                          data-delivery-number={delivery.deliveryNumber}
                          type="checkbox"
                          checked={checked.has(String(delivery._id))}
                          onChange={() =>
                            setChecked(old => {
                              const next = new Set(old);
                              if (next.has(String(delivery._id))) next.delete(String(delivery._id));
                              else next.add(String(delivery._id));
                              return next;
                            })
                          }
                        />
                        <span className="font-mono text-xs">{delivery.deliveryNumber}</span>
                      </span>
                      <strong>{money.format(delivery.codAmount ?? 0)}</strong>
                    </label>
                  ))}
                </div>

                {destinations === undefined && <p role="status" className="text-slate-500">جارٍ تحميل الخزائن والبنوك…</p>}
                {destinations?.length === 0 && <p role="alert" className="bg-amber-50 p-3 text-amber-800">لا توجد خزينة أو حساب بنكي متاح لاستلام التسوية.</p>}
                <div>
                  <label className="form-label">إيداع المبلغ في</label>
                  <select data-testid="delivery-settlement-destination" className="form-input" value={destinationId} onChange={event => setDestinationId(event.target.value)}>
                    <option value="">اختر الخزينة أو البنك</option>
                    {destinations?.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">رسوم شركة الشحن</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={fee} onChange={event => setFee(event.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-sm">
                  <div><span className="block text-xs text-slate-500">الإجمالي</span><strong>{money.format(gross)}</strong></div>
                  <div><span className="block text-xs text-slate-500">الرسوم</span><strong>{money.format(Number.isFinite(feeAmount) ? feeAmount : 0)}</strong></div>
                  <div><span className="block text-xs text-slate-500">الصافي</span><strong className="text-emerald-700">{money.format(gross - (Number.isFinite(feeAmount) ? feeAmount : 0))}</strong></div>
                </div>
              </div>
            )}

            {!["create", "ship", "deliver", "settle", "reverse-settlement", "details"].includes(modal) && (
              <div>
                <label className="form-label">سبب العملية</label>
                <textarea className="form-input min-h-24" placeholder="اكتب السبب بوضوح" value={reason} onChange={event => setReason(event.target.value)} />
              </div>
            )}

            {modal === "reverse-settlement" && (
              <div>
                <label className="form-label">سبب إلغاء التسوية</label>
                <textarea className="form-input min-h-24" placeholder="اكتب السبب بوضوح" value={reversalReason} onChange={event => setReversalReason(event.target.value)} />
              </div>
            )}

            {["create", "deliver", "reverse-confirmation", "settle", "reverse-settlement"].includes(modal) && (
              <div>
                <label className="form-label">التاريخ</label>
                <input data-testid="delivery-action-date" className="form-input" type="date" value={date} onChange={event => setDate(event.target.value)} />
              </div>
            )}

            {modal !== "details" && validationReason && (
              <p id="delivery-action-validation" role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">
                {validationReason}
              </p>
            )}

            {modal !== "details" && (
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={close} className="erp-action" disabled={busy}>إلغاء</button>
                <button
                  data-testid="delivery-action-submit"
                  disabled={busy || Boolean(validationReason)}
                  aria-describedby={validationReason ? "delivery-action-validation" : undefined}
                  title={validationReason ?? undefined}
                  className="btn-primary disabled:opacity-50"
                  onClick={() => {
                    if (validationReason) {
                      toast.error(validationReason);
                      return;
                    }
                    const operation = modal;
                    if (!operation || operation === "details") return;
                    void run(async () => {
                      if (operation === "create" && activeBranch) {
                        return createDelivery({
                          orderId: orderId as Id<"orders">,
                          invoiceId: invoiceId as Id<"invoices">,
                          city,
                          address,
                          shippingCompany: company,
                          trackingNumber: tracking || undefined,
                          expectedCarrierFee: feeAmount,
                          branchId: activeBranch,
                          date,
                          requestId: operationRequestId.current,
                        });
                      }
                      if (operation === "ship" && selected) return updateStatus({ id: selected._id, status: "shipped" });
                      if (operation === "deliver" && selected) {
                        return confirmDelivered({
                          deliveryId: selected._id,
                          codClearingAccountId: accountId ? (accountId as Id<"financialAccounts">) : undefined,
                          date,
                          requestId: operationRequestId.current,
                        });
                      }
                      if ((operation === "return" || operation === "cancel") && selected) {
                        return updateStatus({ id: selected._id, status: operation === "return" ? "returned" : "cancelled", reason });
                      }
                      if (operation === "reverse-confirmation" && selected) {
                        return reverseConfirmation({ deliveryId: selected._id, reason, date, requestId: operationRequestId.current });
                      }
                      if (operation === "settle" && activeBranch) {
                        return createSettlement({
                          deliveryIds: [...checked] as Id<"deliveries">[],
                          sourceAccountId: accountId as Id<"financialAccounts">,
                          destinationAccountId: destinationId as Id<"financialAccounts">,
                          feeAmount,
                          date,
                          branchId: activeBranch,
                          requestId: operationRequestId.current,
                        });
                      }
                      if (operation === "reverse-settlement" && selectedSettlementId) {
                        return reverseSettlement({
                          settlementId: selectedSettlementId,
                          reason: reversalReason.trim(),
                          date,
                          requestId: operationRequestId.current,
                        });
                      }
                      throw new Error("تعذر إكمال العملية المطلوبة");
                    }, operationSuccessMessage(operation));
                  }}
                >
                  {busy ? "جارٍ الحفظ…" : "حفظ"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
