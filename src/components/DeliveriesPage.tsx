import { useMemo, useRef, useState } from "react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import { getErrorMessage } from "../lib/errors";
import { toast } from "sonner";
import { Printer, Truck, X } from "lucide-react";

const requestId = () => crypto.randomUUID();
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

type Modal =
  | "create"
  | "ship"
  | "deliver"
  | "return"
  | "cancel"
  | "reverse-confirmation"
  | "settle"
  | "reverse-settlement"
  | null;

type Selected = {
  _id: Id<"deliveries">;
  deliveryNumber: string;
  status: string;
  codAmount?: number;
  branchId?: Id<"branches">;
};

export function DeliveriesPage() {
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
    canSettle&&activeBranch&&accountId
      ? { branchId: activeBranch, sourceAccountId: accountId as Id<"financialAccounts"> }
      : "skip",
  );
  const stats = useQuery(api.deliveries.getStats, activeBranch ? { branchId: activeBranch } : {});
  const settlements = usePaginatedQuery(
    api.deliveries.listSettlements,
    canViewSettlements && activeBranch ? { branchId: activeBranch } : "skip",
    { initialNumItems: 10 },
  );

  const chosenOrder = options?.find((order) => String(order.orderId) === orderId);
  const chosenInvoice = chosenOrder?.invoices.find((invoice) => String(invoice.invoiceId) === invoiceId);
  const gross = useMemo(
    () =>
      unsettled
        ?.filter((delivery) => checked.has(String(delivery._id)))
        .reduce((sum, delivery) => sum + (delivery.codAmount ?? 0), 0) ?? 0,
    [unsettled, checked],
  );

  const createDelivery = useMutation(api.deliveries.createFromOrderInvoice);
  const updateStatus = useMutation(api.deliveries.updateStatus);
  const confirmDelivered = useMutation(api.deliveries.confirmDelivered);
  const createSettlement = useMutation(api.deliveries.createCodSettlement);
  const reverseSettlement = useMutation(api.deliveries.reverseCodSettlement);
  const reverseConfirmation = useMutation(api.deliveries.reverseConfirmation);

  const resetOperationState=()=>{setOrderId("");setInvoiceId("");setCity("");setAddress("");setCompany("");setTracking("");setFee("0");setDate(new Date().toISOString().slice(0,10));setReason("");setAccountId("");setDestinationId("");setChecked(new Set<string>());setSelectedSettlementId(null);setReversalReason("")};
  const open=(kind:Modal,row?:Selected)=>{resetOperationState();setSelected(row??null);operationRequestId.current=requestId();setModal(kind)};
  const openSettlementReversal=(settlementId:Id<"codSettlements">)=>{resetOperationState();setSelectedSettlementId(settlementId);setReversalReason("");operationRequestId.current=requestId();setModal("reverse-settlement")};
  const handleBranchChange=(value:string)=>{setBranchId(value?value as Id<"branches">:undefined);resetOperationState();setSelected(null);setModal(null);operationRequestId.current=requestId()};
  const close = () => {
    if (!busy) setModal(null);
  };

  const run=async(action:()=>Promise<unknown>,message:string)=>{if(busy)return;setBusy(true);try{await action();toast.success(message);resetOperationState();setSelected(null);operationRequestId.current=requestId();setModal(null)}catch(error){toast.error(getErrorMessage(error,"تعذر تنفيذ العملية"))}finally{setBusy(false)}};

  const feeAmount = Number(fee);
  const validationReason = (() => {
    if (!modal) return null;

    if (modal === "create") {
      if (!activeBranch) return "اختر الفرع";
      if (!chosenOrder) return "اختر طلبًا جاهزًا";
      if (!chosenInvoice) return "اختر الفاتورة المؤهلة";
      if (!city.trim()) return "أدخل المدينة";
      if (!address.trim()) return "أدخل عنوان التوصيل";
      if (!company.trim()) return "أدخل شركة الشحن";
      if (!Number.isFinite(feeAmount) || feeAmount < 0) return "أدخل رسوم ناقل صحيحة";
      if (!isIsoDate(date)) return "اختر تاريخًا صالحًا";
      return null;
    }

    if (!selected && modal !== "settle" && modal !== "reverse-settlement") {
      return "اختر سجل التوصيل";
    }

    if (modal === "deliver") {
      if ((selected?.codAmount ?? 0) > 0 && !accountId) return "اختر حساب تأكيد COD";
      if (!isIsoDate(date)) return "اختر تاريخ التسليم";
      return null;
    }

    if (modal === "return" || modal === "cancel" || modal === "reverse-confirmation") {
      if (!reason.trim()) return "أدخل السبب الإلزامي";
      if (modal === "reverse-confirmation" && !isIsoDate(date)) return "اختر تاريخ العكس";
      return null;
    }

    if (modal === "settle") {
      if (!activeBranch) return "اختر الفرع";
      if (!accountId) return "اختر حساب مصدر التسوية";
      if (!destinationId) return "اختر حساب وجهة التسوية";
      if (accountId === destinationId) return "يجب اختلاف حساب المصدر عن الوجهة";
      if (checked.size === 0) return "اختر شحنة COD واحدة على الأقل";
      if (gross <= 0) return "إجمالي COD المحدد يجب أن يكون أكبر من صفر";
      if (!Number.isFinite(feeAmount) || feeAmount < 0) return "أدخل رسوم تسوية صحيحة";
      if (feeAmount > gross) return "لا يمكن أن تتجاوز الرسوم إجمالي COD";
      if (!isIsoDate(date)) return "اختر تاريخ التسوية";
      return null;
    }

    if (modal === "reverse-settlement") {
      if (!selectedSettlementId) return "اختر التسوية";
      if (!reversalReason.trim()) return "أدخل سبب عكس التسوية";
      if (!isIsoDate(date)) return "اختر تاريخ العكس";
      return null;
    }

    return null;
  })();

  const openPrintWindow = (title: string, body: string) => {
    const popup = window.open("", "_blank");
    if (!popup) throw new Error("تعذر فتح نافذة الطباعة");
    popup.document.write(
      `<html dir="rtl"><head><title>${title}</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:8px}.signatures{display:flex;justify-content:space-between;margin-top:48px}</style></head><body><h1>${title}</h1>${body}<div class="signatures"><span>توقيع الناقل: __________</span><span>توقيع المحاسب: __________</span></div></body></html>`,
    );
    popup.document.close();
    popup.print();
  };

  const printDelivery = async (row: Selected) => {
    if (busy || !canPrint) return;
    setBusy(true);
    try {
      const dto = await convex.query(api.deliveries.printDelivery, { deliveryId: row._id });
      openPrintWindow(
        `سند توصيل ${dto.deliveryNumber}`,
        `<p>الطلب: ${dto.orderNumber ?? "—"} | الفاتورة: ${dto.invoiceNumber ?? "—"}</p><p>العميل: ${dto.customerName} — ${dto.city}</p><table><tbody>${dto.items.map((item) => `<tr><td>${item.productName}</td><td>${item.quantity}</td><td>${item.unitPrice}</td></tr>`).join("")}</tbody></table><p>الإجمالي: ${dto.totalAmount} | المدفوع: ${dto.prepaidAmount ?? 0} | COD: ${dto.codAmount ?? 0}</p><p>الحالة: ${dto.status}</p>`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذرت الطباعة"));
    } finally {
      setBusy(false);
    }
  };

  const printSettlement = async (settlementId: Id<"codSettlements">) => {
    if (busy || !canPrint) return;
    setBusy(true);
    try {
      const dto = await convex.query(api.deliveries.printCodSettlement, { settlementId });
      openPrintWindow(
        `سند تسوية ${dto.settlementNumber}`,
        `<p>التاريخ: ${dto.date} | الحالة: ${dto.status}</p><p>المصدر: ${dto.sourceAccountName} | الوجهة: ${dto.destinationAccountName}</p><table><tbody>${dto.items.map((item) => `<tr><td>${item.deliveryNumber}</td><td>${item.invoiceNumber}</td><td>${item.codAmount}</td></tr>`).join("")}</tbody></table><p>الإجمالي: ${dto.grossAmount} | الرسوم: ${dto.feeAmount} | الصافي: ${dto.netAmount}</p>${dto.reversalReason ? `<p>سبب العكس: ${dto.reversalReason}</p>` : ""}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذرت طباعة التسوية"));
    } finally {
      setBusy(false);
    }
  };

  const rows = deliveries.results;

  return (
    <div dir="rtl" className="p-6 space-y-5">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-black flex gap-2">
            <Truck />
            التوصيل والتحصيل COD
          </h1>
          <p className="text-slate-500">دورة موثقة من الطلب والفاتورة حتى التسوية</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => open("create")}>
            إنشاء من طلب وفاتورة
          </button>
        )}
      </header>

      {branches && (
        <select
          className="form-input max-w-xs"
          value={activeBranch ?? ""}
          onChange={(event) => handleBranchChange(event.target.value)}
        >
          <option value="">اختر الفرع</option>
          {branches
            .filter((branch) => branch.isActive)
            .map((branch) => (
              <option key={branch._id} value={branch._id}>
                {branch.name}
              </option>
            ))}
        </select>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["COD لدى شركات الشحن", stats?.codWithCarriers],
          ["COD تمت تسويته", stats?.codSettled],
          ["COD معكوس", stats?.codReversed],
          ["رسوم شركات الشحن", stats?.carrierFees],
        ].map(([label, value]) => (
          <div className="bg-white rounded-xl p-3" key={label}>
            <div>{label}</div>
            <strong>{value ?? 0}</strong>
          </div>
        ))}
      </section>

      <div className="overflow-x-auto bg-white rounded-xl">
        <table className="w-full">
          <thead>
            <tr>
              <th>السند</th>
              <th>العميل</th>
              <th>الحالة</th>
              <th>COD</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((delivery) => (
              <tr key={delivery._id}>
                <td>{delivery.deliveryNumber}</td>
                <td>{delivery.customerName}</td>
                <td>{delivery.status}</td>
                <td>{delivery.codAmount ?? 0}</td>
                <td className="flex gap-1 flex-wrap">
                  {canEdit && delivery.status === "pending" && (
                    <>
                      <button onClick={() => open("ship", delivery)}>تأكيد الشحن</button>
                      <button onClick={() => open("cancel", delivery)}>إلغاء</button>
                    </>
                  )}
                  {canEdit && delivery.status === "shipped" && (
                    <button onClick={() => open("return", delivery)}>إرجاع قبل التسليم</button>
                  )}
                  {canConfirm && delivery.status === "shipped" && (
                    <button onClick={() => open("deliver", delivery)}>تأكيد التسليم</button>
                  )}
                  {canReverse && delivery.status === "delivered" && (
                    <button onClick={() => open("reverse-confirmation", delivery)}>عكس التأكيد</button>
                  )}
                  {canPrint && (
                    <button onClick={() => void printDelivery(delivery)}>
                      <Printer size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {deliveries.status === "CanLoadMore" && (
          <button onClick={() => deliveries.loadMore(20)}>المزيد</button>
        )}
      </div>

      {canSettle && (
        <button className="btn-primary" onClick={() => open("settle")}>
          إنشاء تسوية COD مجمعة
        </button>
      )}

      {canViewSettlements && (
        <section>
          <h2 className="font-bold">التسويات</h2>
          {settlements.results.map((settlement) => (
            <div key={settlement._id} className="flex gap-3">
              <span>
                {settlement.settlementNumber} — {settlement.status} — {settlement.netAmount}
              </span>
              {canReverse && settlement.status === "posted" && (
                <button onClick={() => openSettlementReversal(settlement._id)}>عكس التسوية</button>
              )}
              {canPrint && (
                <button onClick={() => void printSettlement(settlement._id)}>
                  <Printer size={16} /> طباعة التسوية
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-5 w-[min(95vw,650px)] space-y-3">
            <button onClick={close}>
              <X />
            </button>
            <h2 className="text-xl font-black">
              {{
                create: "إنشاء سند توصيل",
                ship: "تأكيد الشحن",
                deliver: "تأكيد التسليم والتحصيل",
                return: "إرجاع قبل التسليم",
                cancel: "إلغاء التوصيل",
                "reverse-confirmation": "عكس تأكيد التسليم",
                settle: "تسوية COD مجمعة",
                "reverse-settlement": "عكس تسوية COD",
              }[modal]}
            </h2>

            {modal === "create" && (
              <>
                <select
                  className="form-input"
                  value={orderId}
                  onChange={(event) => {
                    setOrderId(event.target.value);
                    setInvoiceId("");
                  }}
                >
                  <option value="">اختر طلباً جاهزاً</option>
                  {options?.map((order) => (
                    <option key={order.orderId} value={order.orderId}>
                      {order.orderNumber} — {order.customerName}
                    </option>
                  ))}
                </select>
                <select
                  className="form-input"
                  value={invoiceId}
                  onChange={(event) => setInvoiceId(event.target.value)}
                >
                  <option value="">اختر الفاتورة المؤهلة</option>
                  {chosenOrder?.invoices.map((invoice) => (
                    <option key={invoice.invoiceId} value={invoice.invoiceId}>
                      {invoice.invoiceNumber}
                    </option>
                  ))}
                </select>
                {chosenInvoice && (
                  <div className="bg-slate-50 p-3">
                    العميل: {chosenOrder?.customerName} | الإجمالي: {chosenInvoice.netTotal} | المدفوع:{" "}
                    {chosenInvoice.paid} | COD: {chosenInvoice.remaining}
                    <ul>
                      {chosenOrder?.items.map((item, index) => (
                        <li key={index}>
                          {item.productName} × {item.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <input
                  className="form-input"
                  placeholder="المدينة"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
                <input
                  className="form-input"
                  placeholder="العنوان"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
                <input
                  className="form-input"
                  placeholder="شركة الشحن"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                />
                <input
                  className="form-input"
                  placeholder="رقم التتبع"
                  value={tracking}
                  onChange={(event) => setTracking(event.target.value)}
                />
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  placeholder="تكلفة الناقل المتوقعة"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                />
                <p className="text-amber-700">
                  تكلفة الناقل لا تضاف للعميل؛ يجب إدراج أي شحن يتحمله العميل داخل الفاتورة.
                </p>
              </>
            )}

            {modal === "deliver" && (
              <select
                className="form-input"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">اختر حساب تأكيد COD</option>
                {confirmationAccounts?.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.name} ({account.type})
                  </option>
                ))}
              </select>
            )}

            {modal === "settle" && (
              <select
                className="form-input"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);setChecked(new Set<string>())
                }}
              >
                <option value="">اختر حساب مصدر التسوية</option>
                {settlementSources?.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.name} ({account.type})
                  </option>
                ))}
              </select>
            )}

            {modal === "settle" && (
              <>
                <div>
                  {unsettled?.map((delivery) => (
                    <label key={delivery._id} className="block">
                      <input
                        type="checkbox"
                        checked={checked.has(String(delivery._id))}
                        onChange={() =>
                          setChecked((old) => {
                            const next = new Set(old);
                            if (next.has(String(delivery._id))) next.delete(String(delivery._id));
                            else next.add(String(delivery._id));
                            return next;
                          })
                        }
                      />
                      {delivery.deliveryNumber} — {delivery.codAmount}
                    </label>
                  ))}
                </div>
                <select
                  className="form-input"
                  value={destinationId}
                  onChange={(event) => setDestinationId(event.target.value)}
                >
                  <option value="">البنك أو الخزينة الوجهة</option>
                  {destinations?.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <p>
                  Gross: {gross} | الرسوم: {fee} | Net: {gross - feeAmount}
                </p>
              </>
            )}

            {!["create", "ship", "deliver", "settle", "reverse-settlement"].includes(modal) && (
              <textarea
                className="form-input"
                placeholder="السبب الإلزامي"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}

            {modal === "reverse-settlement" && (
              <textarea
                className="form-input"
                placeholder="السبب الإلزامي"
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
              />
            )}

            {["create", "deliver", "reverse-confirmation", "settle", "reverse-settlement"].includes(
              modal,
            ) && (
              <input
                className="form-input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            )}

            {validationReason && (
              <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">
                {validationReason}
              </p>
            )}

            <button
              disabled={busy||Boolean(validationReason)}
              aria-describedby={validationReason ? "delivery-action-validation" : undefined}
              title={validationReason ?? undefined}
              className="btn-primary disabled:opacity-50"
              onClick={() => {
                if (validationReason) {
                  toast.error(validationReason);
                  return;
                }
                void run(async () => {
                  if (modal === "create" && activeBranch) {
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
                  if (modal === "ship" && selected) {
                    return updateStatus({ id: selected._id, status: "shipped" });
                  }
                  if (modal === "deliver" && selected) {
                    return confirmDelivered({
                      deliveryId: selected._id,
                      codClearingAccountId: accountId
                        ? (accountId as Id<"financialAccounts">)
                        : undefined,
                      date,
                      requestId: operationRequestId.current,
                    });
                  }
                  if ((modal === "return" || modal === "cancel") && selected) {
                    return updateStatus({
                      id: selected._id,
                      status: modal === "return" ? "returned" : "cancelled",
                      reason,
                    });
                  }
                  if (modal === "reverse-confirmation" && selected) {
                    return reverseConfirmation({
                      deliveryId: selected._id,
                      reason,
                      date,
                      requestId: operationRequestId.current,
                    });
                  }
                  if (modal === "settle" && activeBranch) {
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
                  if (modal === "reverse-settlement" && selectedSettlementId) {
                    return reverseSettlement({
                      settlementId: selectedSettlementId,
                      reason: reversalReason.trim(),
                      date,
                      requestId: operationRequestId.current,
                    });
                  }
                  throw new Error("بيانات العملية ناقصة");
                }, "تمت العملية بنجاح");
              }}
            >
              {busy ? "جارٍ التنفيذ…" : "تأكيد"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
