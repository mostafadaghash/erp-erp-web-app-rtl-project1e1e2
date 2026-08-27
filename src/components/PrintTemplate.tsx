import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";

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
  serialNumber?: string;
  accessories?: string;
  intakeCondition?: string;
  problem: string;
  diagnosis?: string;
  parts: Array<{ name: string; cost: number; quantity: number; lineTotal?: number }>;
  laborCost: number;
  totalCost: number;
  deposit: number;
  remaining: number;
  status: string;
  technicianName?: string;
  receivedDate: string;
  expectedDate?: string;
  deliveredDate?: string;
  warrantyDays?: number;
  warrantyUntil?: string;
  qualityCheckNotes?: string;
  employeeName?: string;
  history?: Array<{
    fromStatus?: string;
    toStatus: string;
    date: string;
    reason?: string;
    employeeName: string;
  }>;
  notes?: string;
  _creationTime: number;
}

export type PrintType = "invoice" | "order" | "repair";
export type InvoicePrintLayout = "a4-compact" | "a4-detailed" | "thermal-80";
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
function InvoiceTemplate({ data, settings, layout }: { data: InvoiceData; settings: any; layout: InvoicePrintLayout }) {
  const isThermal = layout === "thermal-80";
  const isDetailed = layout === "a4-detailed";
  const showDiscountColumn = !isThermal && data.items.some(i => (i.discount ?? 0) > 0);
  const storeName = settings?.storeName ?? "المتجر";
  const legalName = settings?.legalName ?? "";
  const invoiceFooter = settings?.invoiceFooter ?? "";
  const storePhone = settings?.phone ?? "";
  const storeAddress = settings?.address ?? "";
  const taxRate = settings?.taxRate ?? 0;

  return (
    <div className={`print-page print-layout-${layout}`} data-print-layout={layout}>
      {/* رأس الفاتورة */}
      <div className="print-header">
        {settings?.logoUrl && (
          <img src={settings.logoUrl} alt={`شعار ${storeName}`} className="print-logo" />
        )}
        <div className="print-store-info">
          <h1 className="print-store-name">{storeName}</h1>
          {legalName && legalName !== storeName && <p className="print-store-detail">{legalName}</p>}
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
            <th className="print-th" style={{ width: isThermal ? "55%" : "40%" }}>المنتج</th>
            <th className="print-th" style={{ width: "15%", textAlign: "center" }}>الكمية</th>
            {!isThermal && <th className="print-th" style={{ width: "20%", textAlign: "center" }}>سعر الوحدة</th>}
            {showDiscountColumn && (
              <th className="print-th" style={{ width: "10%", textAlign: "center" }}>خصم</th>
            )}
            <th className="print-th" style={{ width: isThermal ? "30%" : "20%", textAlign: "center" }}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? "print-tr-even" : ""}>
              <td className="print-td">{item.productName}</td>
              <td className="print-td" style={{ textAlign: "center" }}>{item.quantity}</td>
              {!isThermal && <td className="print-td" style={{ textAlign: "center" }}>{item.unitPrice.toLocaleString("ar-EG")} ج.م</td>}
              {showDiscountColumn && (
                <td className="print-td" style={{ textAlign: "center", color: "#dc2626" }}>
                  {(item.discount ?? 0) > 0 ? `${item.discount} ج.م` : "—"}
                </td>
              )}
              <td className="print-td" style={{ textAlign: "center", fontWeight: "bold" }}>{item.total.toLocaleString("ar-EG")} ج.م</td>
            </tr>
          ))}
          {isDetailed && Array.from({ length: Math.max(0, 12 - data.items.length) }).map((_, i) => (
            <tr key={`blank-${i}`} className="print-detail-blank-row" aria-hidden="true">
              <td className="print-td">&nbsp;</td>
              <td className="print-td">&nbsp;</td>
              <td className="print-td">&nbsp;</td>
              {showDiscountColumn && <td className="print-td">&nbsp;</td>}
              <td className="print-td">&nbsp;</td>
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
        <p>{invoiceFooter || `شكرًا لتعاملكم مع ${storeName}`}</p>
        {storePhone && <p>للاستفسار: {storePhone}</p>}
      </div>
    </div>
  );
}

// ─── قالب أمر البيع ──────────────────────────────────────────────────────────────
function OrderTemplate({ data, settings }: { data: OrderData; settings: any }) {
  const storeName = settings?.storeName ?? "المتجر";
  const legalName = settings?.legalName ?? "";
  const invoiceFooter = settings?.invoiceFooter ?? "";
  const storePhone = settings?.phone ?? "";
  const storeAddress = settings?.address ?? "";

  return (
    <div className="print-page">
      {/* رأس */}
      <div className="print-header">
        {settings?.logoUrl && (
          <img src={settings.logoUrl} alt={`شعار ${storeName}`} className="print-logo" />
        )}
        <div className="print-store-info">
          <h1 className="print-store-name">{storeName}</h1>
          {legalName && legalName !== storeName && <p className="print-store-detail">{legalName}</p>}
          {storePhone && <p className="print-store-detail">هاتف: {storePhone}</p>}
          {storeAddress && <p className="print-store-detail">{storeAddress}</p>}
        </div>
        <div className="print-doc-info">
          <div className="print-doc-badge" style={{ background: "#7c3aed" }}>أمر بيع</div>
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
          <p>توقيع المسؤول</p>
        </div>
      </div>

      {/* التذييل */}
      <div className="print-footer">
        <p>{invoiceFooter || `هذا المستند يُثبت استلام الدفعة — ${storeName}`}</p>
        {storePhone && <p>للاستفسار: {storePhone}</p>}
      </div>
    </div>
  );
}

// ─── قالب الصيانة ──────────────────────────────────────────────────────────────
function RepairTemplate({ data, settings }: { data: RepairData; settings: any }) {
  const storeName = settings?.storeName ?? "المتجر";
  const legalName = settings?.legalName ?? "";
  const invoiceFooter = settings?.invoiceFooter ?? "";
  const storePhone = settings?.phone ?? "";
  const storeAddress = settings?.address ?? "";

  return (
    <div className="print-page">
      {/* رأس */}
      <div className="print-header">
        {settings?.logoUrl && (
          <img src={settings.logoUrl} alt={`شعار ${storeName}`} className="print-logo" />
        )}
        <div className="print-store-info">
          <h1 className="print-store-name">{storeName}</h1>
          {legalName && legalName !== storeName && <p className="print-store-detail">{legalName}</p>}
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
            {data.serialNumber && (
              <div>
                <span className="print-field-label">السيريال: </span>
                <span className="print-field-value">{data.serialNumber}</span>
              </div>
            )}
            {data.accessories && (
              <div>
                <span className="print-field-label">الملحقات: </span>
                <span className="print-field-value">{data.accessories}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* المشكلة والتشخيص */}
      <div className="print-problem-box">
        <div style={{ marginBottom: "8px" }}>
          <span className="print-field-label">المشكلة المُبلَّغ عنها: </span>
          <span>{data.problem}</span>
        </div>
        {data.intakeCondition && (
          <div style={{ marginBottom: "8px" }}>
            <span className="print-field-label">حالة الجهاز عند الاستلام: </span>
            <span>{data.intakeCondition}</span>
          </div>
        )}
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
        {data.qualityCheckNotes && (
          <div style={{ marginTop: "8px" }}>
            <span className="print-field-label">اختبار الجودة: </span>
            <span>{data.qualityCheckNotes}</span>
          </div>
        )}
        {data.deliveredDate && (
          <div style={{ marginTop: "8px" }}>
            <span className="print-field-label">تاريخ التسليم: </span>
            <span>{data.deliveredDate}</span>
          </div>
        )}
        {data.warrantyDays !== undefined && (
          <div style={{ marginTop: "4px" }}>
            <span className="print-field-label">الضمان: </span>
            <span>{data.warrantyDays} يوم — حتى {data.warrantyUntil ?? "—"}</span>
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
                    {(part.lineTotal ?? part.cost * part.quantity).toLocaleString("ar-EG")} ج.م
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
              <span>{data.parts.reduce((s, p) => s + (p.lineTotal ?? p.cost * p.quantity), 0).toLocaleString("ar-EG")} ج.م</span>
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

      {data.history && data.history.length > 0 && (
        <>
          <div className="print-section-title">سجل حالات الصيانة</div>
          <table className="print-table">
            <thead>
              <tr>
                <th className="print-th">التاريخ</th>
                <th className="print-th">الانتقال</th>
                <th className="print-th">بواسطة</th>
                <th className="print-th">السبب</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((entry, index) => (
                <tr key={`${entry.date}-${entry.toStatus}-${index}`} className={index % 2 === 0 ? "print-tr-even" : ""}>
                  <td className="print-td">{entry.date}</td>
                  <td className="print-td">
                    {entry.fromStatus ? `${statusLabel[entry.fromStatus] ?? entry.fromStatus} ← ` : ""}
                    {statusLabel[entry.toStatus] ?? entry.toStatus}
                  </td>
                  <td className="print-td">{entry.employeeName}</td>
                  <td className="print-td">{entry.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

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

      {data.employeeName && (
        <p className="mt-4 text-center text-xs text-slate-500">
          محرر أمر الصيانة: {data.employeeName}
        </p>
      )}

      {/* التذييل */}
      <div className="print-footer">
        <p>{invoiceFooter || `يُرجى الاحتفاظ بهذا المستند لاستلام الجهاز — ${storeName}`}</p>
        {storePhone && <p>للاستفسار: {storePhone}</p>}
      </div>
    </div>
  );
}

// ─── المكوّن الرئيسي: نافذة الطباعة ──────────────────────────────────────────
export function PrintModal({ type, data, onClose }: PrintTemplateProps) {
  const canPrintInvoice = usePermission("print_invoices");
  const canPrintRepair = usePermission("print_repairs");
  const allowed = type === "invoice" || type === "order" ? canPrintInvoice : canPrintRepair;
  const settings = useQuery(api.settings.getPublic);
  const [invoiceLayout, setInvoiceLayout] = useState<InvoicePrintLayout>("a4-compact");

  const handlePrint = () => {
    if (!allowed) return;
    window.print();
  };

  return (
    <>
      {/* نافذة المعاينة */}
      <div className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center p-4 overflow-y-auto no-print" role="dialog" aria-modal="true" aria-label="معاينة الطباعة">
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
                  {type === "invoice" ? "فاتورة مبيعات" : type === "order" ? "أمر بيع" : "أمر صيانة"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {type === "invoice" && (
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <span className="hidden sm:inline">التصميم</span>
                  <select
                    aria-label="تصميم فاتورة الطباعة"
                    value={invoiceLayout}
                    onChange={(event) => setInvoiceLayout(event.target.value as InvoicePrintLayout)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
                  >
                    <option value="a4-compact">A4 مختصر</option>
                    <option value="a4-detailed">A4 تفصيلي</option>
                    <option value="thermal-80">حراري 80mm</option>
                  </select>
                </label>
              )}
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
                <InvoiceTemplate data={data as InvoiceData} settings={settings} layout={invoiceLayout} />
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
          <InvoiceTemplate data={data as InvoiceData} settings={settings} layout={invoiceLayout} />
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
