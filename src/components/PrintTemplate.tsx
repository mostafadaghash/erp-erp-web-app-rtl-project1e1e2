import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// ─── أنواع البيانات ────────────────────────────────────────────────────────────
interface InvoiceData {
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: string;
  status: string;
  notes?: string;
  _creationTime: number;
}

interface OrderData {
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  total: number;
  deposit: number;
  remaining: number;
  status: string;
  expectedDate?: string;
  notes?: string;
  _creationTime: number;
}

interface RepairData {
  repairNumber: string;
  customerName: string;
  customerPhone: string;
  deviceType: string;
  deviceBrand: string;
  deviceModel: string;
  problem: string;
  diagnosis?: string;
  parts: Array<{ name: string; cost: number; quantity: number }>;
  laborCost: number;
  totalCost: number;
  deposit: number;
  remaining: number;
  status: string;
  technicianName?: string;
  receivedDate: string;
  expectedDate?: string;
  notes?: string;
  _creationTime: number;
}

export type PrintType = "invoice" | "order" | "repair";
export type PrintData = InvoiceData | OrderData | RepairData;

interface PrintTemplateProps {
  type: PrintType;
  data: PrintData;
  onClose: () => void;
}

// ─── مساعدات ──────────────────────────────────────────────────────────────────
const paymentMethodLabel: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل بنكي",
  credit: "آجل",
};

const statusLabel: Record<string, string> = {
  paid: "مدفوعة",
  partial: "جزئي",
  pending: "معلقة",
  confirmed: "مؤكد",
  ready: "جاهز للاستلام",
  delivered: "تم التسليم",
  cancelled: "ملغي",
  received: "مستلم",
  diagnosing: "قيد الفحص",
  in_progress: "قيد الإصلاح",
  waiting_parts: "انتظار قطع",
  completed: "مكتمل",
};

function formatDate(ts: number | string) {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

// ─── قالب الفاتورة ─────────────────────────────────────────────────────────────
function InvoiceTemplate({ data, settings }: { data: InvoiceData; settings: any }) {
  const storeName = settings?.storeName ?? "المتجر";
  const storePhone = settings?.phone ?? "";
  const storeAddress = settings?.address ?? "";
  const taxRate = settings?.taxRate ?? 0;

  return (
    <div className="print-page">
      {/* رأس الفاتورة */}
      <div className="print-header">
        {settings?.logoUrl && (
          <img src={settings.logoUrl} alt="شعار المتجر" className="print-logo" />
        )}
        <div className="print-store-info">
          <h1 className="print-store-name">{storeName}</h1>
          {storePhone && <p className="print-store-detail">هاتف: {storePhone}</p>}
          {storeAddress && <p className="print-store-detail">{storeAddress}</p>}
        </div>
        <div className="print-doc-info">
          <div className="print-doc-badge">فاتورة مبيعات</div>
          <p className="print-doc-number">{data.invoiceNumber}</p>
          <p className="print-doc-date">{formatDate(data._creationTime)}</p>
          <span className={`print-status-badge ${data.status === "paid" ? "status-paid" : data.status === "partial" ? "status-partial" : "status-pending"}`}>
            {statusLabel[data.status] ?? data.status}
          </span>
        </div>
      </div>

      {/* بيانات العميل */}
      <div className="print-customer-box">
        <div className="print-customer-label">بيانات العميل</div>
        <div className="print-customer-grid">
          <div>
            <span className="print-field-label">الاسم: </span>
            <span className="print-field-value">{data.customerName}</span>
          </div>
          {data.customerPhone && (
            <div>
              <span className="print-field-label">الهاتف: </span>
              <span className="print-field-value">{data.customerPhone}</span>
            </div>
          )}
          <div>
            <span className="print-field-label">طريقة الدفع: </span>
            <span className="print-field-value">{paymentMethodLabel[data.paymentMethod] ?? data.paymentMethod}</span>
          </div>
        </div>
      </div>

      {/* جدول المنتجات */}
      <table className="print-table">
        <thead>
          <tr>
            <th className="print-th" style={{ width: "40%" }}>المنتج</th>
            <th className="print-th" style={{ width: "15%", textAlign: "center" }}>الكمية</th>
            <th className="print-th" style={{ width: "20%", textAlign: "center" }}>سعر الوحدة</th>
            {data.items.some(i => (i.discount ?? 0) > 0) && (
              <th className="print-th" style={{ width: "10%", textAlign: "center" }}>خصم</th>
            )}
            <th className="print-th" style={{ width: "20%", textAlign: "center" }}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? "print-tr-even" : ""}>
              <td className="print-td">{item.productName}</td>
              <td className="print-td" style={{ textAlign: "center" }}>{item.quantity}</td>
              <td className="print-td" style={{ textAlign: "center" }}>{item.unitPrice.toLocaleString("ar-EG")} ج.م</td>
              {data.items.some(it => (it.discount ?? 0) > 0) && (
                <td className="print-td" style={{ textAlign: "center", color: "#dc2626" }}>
                  {(item.discount ?? 0) > 0 ? `${item.discount} ج.م` : "—"}
                </td>
              )}
              <td className="print-td" style={{ textAlign: "center", fontWeight: "bold" }}>{item.total.toLocaleString("ar-EG")} ج.م</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* الإجماليات */}
      <div className="print-totals">
        <div className="print-totals-box">
          <div className="print-total-row">
            <span>المجموع الفرعي</span>
            <span>{data.subtotal.toLocaleString("ar-EG")} ج.م</span>
          </div>
          {data.discount > 0 && (
            <div className="print-total-row" style={{ color: "#dc2626" }}>
              <span>الخصم</span>
              <span>- {data.discount.toLocaleString("ar-EG")} ج.م</span>
            </div>
          )}
          {data.tax > 0 && (
            <div className="print-total-row">
              <span>ضريبة القيمة المضافة ({taxRate}%)</span>
              <span>{data.tax.toLocaleString("ar-EG")} ج.م</span>
            </div>
          )}
          <div className="print-total-final">
            <span>الإجمالي</span>
            <span>{data.total.toLocaleString("ar-EG")} ج.م</span>
          </div>
          <div className="print-total-row" style={{ color: "#059669" }}>
            <span>المدفوع</span>
            <span>{data.paid.toLocaleString("ar-EG")} ج.م</span>
          </div>
          {data.remaining > 0 && (
            <div className="print-total-row" style={{ color: "#d97706", fontWeight: "bold" }}>
              <span>المتبقي</span>
              <span>{data.remaining.toLocaleString("ar-EG")} ج.م</span>
            </div>
          )}
        </div>
      </div>

      {/* ملاحظات */}
      {data.notes && (
        <div className="print-notes">
          <span className="print-field-label">ملاحظات: </span>
          {data.notes}
        </div>
      )}

      {/* التذييل */}
      <div className="print-footer">
        <p>شكراً لتعاملكم مع {storeName}</p>
        {storePhone && <p>للاستفسار: {storePhone}</p>}
      </div>
    </div>
  );
}

// ─── قالب الأوردر ──────────────────────────────────────────────────────────────
function OrderTemplate({ data, settings }: { data: OrderData; settings: any }) {
  const storeName = settings?.storeName ?? "المتجر";
  const storePhone = settings?.phone ?? "";
  const storeAddress = settings?.address ?? "";

  return (
    <div className="print-page">
      {/* رأس */}
      <div className="print-header">
        {settings?.logoUrl && (
          <img src={settings.logoUrl} alt="شعار المتجر" className="print-logo" />
        )}
        <div className="print-store-info">
          <h1 className="print-store-name">{storeName}</h1>
          {storePhone && <p className="print-store-detail">هاتف: {storePhone}</p>}
          {storeAddress && <p className="print-store-detail">{storeAddress}</p>}
        </div>
        <div className="print-doc-info">
          <div className="print-doc-badge" style={{ background: "#7c3aed" }}>إيصال أوردر</div>
          <p className="print-doc-number">{data.orderNumber}</p>
          <p className="print-doc-date">{formatDate(data._creationTime)}</p>
          <span className={`print-status-badge ${
            data.status === "delivered" ? "status-paid" :
            data.status === "ready" ? "status-partial" : "status-pending"
          }`}>
            {statusLabel[data.status] ?? data.status}
          </span>
        </div>
      </div>

      {/* بيانات العميل */}
      <div className="print-customer-box">
        <div className="print-customer-label">بيانات العميل</div>
        <div className="print-customer-grid">
          <div>
            <span className="print-field-label">الاسم: </span>
            <span className="print-field-value">{data.customerName}</span>
          </div>
          {data.customerPhone && (
            <div>
              <span className="print-field-label">الهاتف: </span>
              <span className="print-field-value">{data.customerPhone}</span>
            </div>
          )}
          {data.expectedDate && (
            <div>
              <span className="print-field-label">تاريخ الاستلام المتوقع: </span>
              <span className="print-field-value">{data.expectedDate}</span>
            </div>
          )}
        </div>
      </div>

      {/* جدول المنتجات */}
      <table className="print-table">
        <thead>
          <tr>
            <th className="print-th" style={{ width: "45%" }}>المنتج / الوصف</th>
            <th className="print-th" style={{ width: "15%", textAlign: "center" }}>الكمية</th>
            <th className="print-th" style={{ width: "20%", textAlign: "center" }}>سعر الوحدة</th>
            <th className="print-th" style={{ width: "20%", textAlign: "center" }}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? "print-tr-even" : ""}>
              <td className="print-td">
                <div>{item.productName}</div>
                {item.notes && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{item.notes}</div>}
              </td>
              <td className="print-td" style={{ textAlign: "center" }}>{item.quantity}</td>
              <td className="print-td" style={{ textAlign: "center" }}>{item.unitPrice.toLocaleString("ar-EG")} ج.م</td>
              <td className="print-td" style={{ textAlign: "center", fontWeight: "bold" }}>
                {(item.quantity * item.unitPrice).toLocaleString("ar-EG")} ج.م
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* الإجماليات */}
      <div className="print-totals">
        <div className="print-totals-box">
          <div className="print-total-final">
            <span>إجمالي الطلب</span>
            <span>{data.total.toLocaleString("ar-EG")} ج.م</span>
          </div>
          <div className="print-total-row" style={{ color: "#059669" }}>
            <span>العربون المدفوع</span>
            <span>{data.deposit.toLocaleString("ar-EG")} ج.م</span>
          </div>
          {data.remaining > 0 && (
            <div className="print-total-row" style={{ color: "#d97706", fontWeight: "bold", fontSize: "15px" }}>
              <span>المبلغ المتبقي عند الاستلام</span>
              <span>{data.remaining.toLocaleString("ar-EG")} ج.م</span>
            </div>
          )}
        </div>
      </div>

      {/* ملاحظات */}
      {data.notes && (
        <div className="print-notes">
          <span className="print-field-label">ملاحظات: </span>
          {data.notes}
        </div>
      )}

      {/* توقيع */}
      <div className="print-signature-row">
        <div className="print-signature-box">
          <div className="print-signature-line"></div>
          <p>توقيع العميل</p>
        </div>
        <div className="print-signature-box">
          <div className="print-signature-line"></div>
          <p>توقيع الموظف</p>
        </div>
      </div>

      {/* التذييل */}
      <div className="print-footer">
        <p>هذا الإيصال يُثبت استلام العربون — {storeName}</p>
        {storePhone && <p>للاستفسار: {storePhone}</p>}
      </div>
    </div>
  );
}

// ─── قالب الصيانة ──────────────────────────────────────────────────────────────
function RepairTemplate({ data, settings }: { data: RepairData; settings: any }) {
  const storeName = settings?.storeName ?? "المتجر";
  const storePhone = settings?.phone ?? "";
  const storeAddress = settings?.address ?? "";

  return (
    <div className="print-page">
      {/* رأس */}
      <div className="print-header">
        {settings?.logoUrl && (
          <img src={settings.logoUrl} alt="شعار المتجر" className="print-logo" />
        )}
        <div className="print-store-info">
          <h1 className="print-store-name">{storeName}</h1>
          {storePhone && <p className="print-store-detail">هاتف: {storePhone}</p>}
          {storeAddress && <p className="print-store-detail">{storeAddress}</p>}
        </div>
        <div className="print-doc-info">
          <div className="print-doc-badge" style={{ background: "#0891b2" }}>أمر صيانة</div>
          <p className="print-doc-number">{data.repairNumber}</p>
          <p className="print-doc-date">استلام: {data.receivedDate}</p>
          <span className={`print-status-badge ${
            data.status === "completed" || data.status === "delivered" ? "status-paid" :
            data.status === "in_progress" ? "status-partial" : "status-pending"
          }`}>
            {statusLabel[data.status] ?? data.status}
          </span>
        </div>
      </div>

      {/* بيانات العميل والجهاز */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        <div className="print-customer-box" style={{ margin: 0 }}>
          <div className="print-customer-label">بيانات العميل</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div>
              <span className="print-field-label">الاسم: </span>
              <span className="print-field-value">{data.customerName}</span>
            </div>
            <div>
              <span className="print-field-label">الهاتف: </span>
              <span className="print-field-value">{data.customerPhone}</span>
            </div>
          </div>
        </div>
        <div className="print-customer-box" style={{ margin: 0 }}>
          <div className="print-customer-label">بيانات الجهاز</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div>
              <span className="print-field-label">النوع: </span>
              <span className="print-field-value">{data.deviceType}</span>
            </div>
            <div>
              <span className="print-field-label">الماركة: </span>
              <span className="print-field-value">{data.deviceBrand}</span>
            </div>
            <div>
              <span className="print-field-label">الموديل: </span>
              <span className="print-field-value">{data.deviceModel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* المشكلة والتشخيص */}
      <div className="print-problem-box">
        <div style={{ marginBottom: "8px" }}>
          <span className="print-field-label">المشكلة المُبلَّغ عنها: </span>
          <span>{data.problem}</span>
        </div>
        {data.diagnosis && (
          <div>
            <span className="print-field-label">التشخيص: </span>
            <span>{data.diagnosis}</span>
          </div>
        )}
        {data.technicianName && (
          <div style={{ marginTop: "8px" }}>
            <span className="print-field-label">الفني المسؤول: </span>
            <span>{data.technicianName}</span>
          </div>
        )}
        {data.expectedDate && (
          <div style={{ marginTop: "4px" }}>
            <span className="print-field-label">التاريخ المتوقع للتسليم: </span>
            <span>{data.expectedDate}</span>
          </div>
        )}
      </div>

      {/* قطع الغيار */}
      {data.parts.length > 0 && (
        <>
          <div className="print-section-title">قطع الغيار والمواد</div>
          <table className="print-table">
            <thead>
              <tr>
                <th className="print-th" style={{ width: "50%" }}>القطعة</th>
                <th className="print-th" style={{ width: "20%", textAlign: "center" }}>الكمية</th>
                <th className="print-th" style={{ width: "15%", textAlign: "center" }}>التكلفة</th>
                <th className="print-th" style={{ width: "15%", textAlign: "center" }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {data.parts.map((part, i) => (
                <tr key={i} className={i % 2 === 0 ? "print-tr-even" : ""}>
                  <td className="print-td">{part.name}</td>
                  <td className="print-td" style={{ textAlign: "center" }}>{part.quantity}</td>
                  <td className="print-td" style={{ textAlign: "center" }}>{part.cost.toLocaleString("ar-EG")} ج.م</td>
                  <td className="print-td" style={{ textAlign: "center", fontWeight: "bold" }}>
                    {(part.cost * part.quantity).toLocaleString("ar-EG")} ج.م
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* الإجماليات */}
      <div className="print-totals">
        <div className="print-totals-box">
          {data.parts.length > 0 && (
            <div className="print-total-row">
              <span>تكلفة القطع</span>
              <span>{data.parts.reduce((s, p) => s + p.cost * p.quantity, 0).toLocaleString("ar-EG")} ج.م</span>
            </div>
          )}
          <div className="print-total-row">
            <span>أجرة الإصلاح</span>
            <span>{data.laborCost.toLocaleString("ar-EG")} ج.م</span>
          </div>
          <div className="print-total-final">
            <span>الإجمالي</span>
            <span>{data.totalCost.toLocaleString("ar-EG")} ج.م</span>
          </div>
          {data.deposit > 0 && (
            <div className="print-total-row" style={{ color: "#059669" }}>
              <span>العربون المدفوع</span>
              <span>{data.deposit.toLocaleString("ar-EG")} ج.م</span>
            </div>
          )}
          {data.remaining > 0 && (
            <div className="print-total-row" style={{ color: "#d97706", fontWeight: "bold" }}>
              <span>المتبقي</span>
              <span>{data.remaining.toLocaleString("ar-EG")} ج.م</span>
            </div>
          )}
        </div>
      </div>

      {/* ملاحظات */}
      {data.notes && (
        <div className="print-notes">
          <span className="print-field-label">ملاحظات: </span>
          {data.notes}
        </div>
      )}

      {/* توقيع */}
      <div className="print-signature-row">
        <div className="print-signature-box">
          <div className="print-signature-line"></div>
          <p>توقيع العميل (استلام)</p>
        </div>
        <div className="print-signature-box">
          <div className="print-signature-line"></div>
          <p>توقيع الفني</p>
        </div>
      </div>

      {/* التذييل */}
      <div className="print-footer">
        <p>يُرجى الاحتفاظ بهذا الإيصال لاستلام الجهاز — {storeName}</p>
        {storePhone && <p>للاستفسار: {storePhone}</p>}
      </div>
    </div>
  );
}

// ─── المكوّن الرئيسي: نافذة الطباعة ──────────────────────────────────────────
export function PrintModal({ type, data, onClose }: PrintTemplateProps) {
  const settings = useQuery(api.settings.getPublic);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* نافذة المعاينة */}
      <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto no-print">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-4">
          {/* شريط الأدوات */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">معاينة الطباعة</p>
                <p className="text-xs text-slate-500">
                  {type === "invoice" ? "فاتورة مبيعات" : type === "order" ? "إيصال أوردر" : "أمر صيانة"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                طباعة
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* منطقة المعاينة */}
          <div className="p-6 bg-slate-100">
            <div className="bg-white shadow-lg rounded-lg overflow-hidden">
              {type === "invoice" && (
                <InvoiceTemplate data={data as InvoiceData} settings={settings} />
              )}
              {type === "order" && (
                <OrderTemplate data={data as OrderData} settings={settings} />
              )}
              {type === "repair" && (
                <RepairTemplate data={data as RepairData} settings={settings} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* محتوى الطباعة الفعلي */}
      <div className="print-only" style={{ display: "none" }}>
        {type === "invoice" && (
          <InvoiceTemplate data={data as InvoiceData} settings={settings} />
        )}
        {type === "order" && (
          <OrderTemplate data={data as OrderData} settings={settings} />
        )}
        {type === "repair" && (
          <RepairTemplate data={data as RepairData} settings={settings} />
        )}
      </div>
    </>
  );
}
