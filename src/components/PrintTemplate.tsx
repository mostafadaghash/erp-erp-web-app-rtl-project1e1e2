import { useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";

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
export type PrintData = InvoiceData | OrderData | RepairData;

type InvoiceLayout = "a4-classic" | "a4-compact" | "receipt-80" | "receipt-57";

interface PrintTemplateProps {
  type: PrintType;
  data: PrintData;
  onClose: () => void;
}

const INVOICE_LAYOUTS: Array<{ id: InvoiceLayout; label: string; hint: string }> = [
  { id: "a4-classic", label: "A4 كلاسيك", hint: "قالب واضح قريب من فواتير سهل" },
  { id: "a4-compact", label: "A4 مختصر", hint: "مساحات أقل وأصناف أكثر في الصفحة" },
  { id: "receipt-80", label: "حراري 80mm", hint: "لطابعات الكاشير الحرارية" },
  { id: "receipt-57", label: "حراري 57mm", hint: "للإيصالات الضيقة" },
];

const paymentMethodLabel: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل بنكي",
  credit: "آجل",
};

const statusLabel: Record<string, string> = {
  paid: "مدفوعة",
  partial: "جزئي",
  unpaid: "معلقة",
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
  partial_return: "مرتجعة جزئيًا",
  paid_returned_partial: "مدفوعة ومرتجعة جزئيًا",
  returned: "مرتجعة بالكامل",
};

const money = (value: number) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;

function formatDate(ts: number | string) {
  const date = new Date(ts);
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatTime(ts: number | string) {
  const date = new Date(ts);
  return date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const PRINT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Tahoma, Arial, sans-serif; color: #111827; direction: rtl; }
  .erp-print-sheet { width: 100%; margin: 0 auto; background: #fff; color: #111827; direction: rtl; }
  .erp-print-sheet.layout-a4-classic { width: 190mm; min-height: 270mm; padding: 8mm 9mm; font-size: 12px; }
  .erp-print-sheet.layout-a4-compact { width: 194mm; min-height: 270mm; padding: 5mm 6mm; font-size: 11px; }
  .erp-print-sheet.layout-receipt-80 { width: 76mm; padding: 3mm 2.5mm; font-size: 10px; }
  .erp-print-sheet.layout-receipt-57 { width: 53mm; padding: 2.5mm 2mm; font-size: 8.5px; }

  .erp-print-topband { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #dedede; padding: 8px 12px; margin-bottom: 8px; }
  .erp-print-title { margin: 0; font-size: 28px; line-height: 1; font-weight: 900; }
  .erp-print-store { margin: 0; font-size: 18px; font-weight: 900; text-align: left; }
  .erp-print-logo { width: 52px; height: 52px; object-fit: contain; }
  .erp-print-head { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; margin-bottom: 10px; }
  .erp-print-meta { display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; align-items: baseline; }
  .erp-print-label { font-weight: 800; white-space: nowrap; }
  .erp-print-value { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
  .erp-print-customer { text-align: center; font-weight: 800; padding-top: 3px; }
  .erp-print-store-details { text-align: left; line-height: 1.7; font-size: .92em; }

  .erp-print-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 7px; }
  .erp-print-table th, .erp-print-table td { border: 1px solid #222; padding: 5px 6px; vertical-align: middle; overflow-wrap: anywhere; }
  .erp-print-table th { background: #efefef; font-weight: 900; text-align: center; }
  .erp-print-table td { text-align: center; }
  .erp-print-table td.product { text-align: right; font-weight: 700; }
  .erp-print-table .col-no { width: 7%; }
  .erp-print-table .col-product { width: 39%; }
  .erp-print-table .col-qty { width: 12%; }
  .erp-print-table .col-price { width: 18%; }
  .erp-print-table .col-discount { width: 12%; }
  .erp-print-table .col-total { width: 20%; }

  .erp-print-summary { display: grid; grid-template-columns: 1fr minmax(230px, 38%); gap: 16px; align-items: start; margin-top: 9px; }
  .erp-print-due-text { padding-top: 8px; font-weight: 800; }
  .erp-print-totals { width: 100%; border-collapse: collapse; }
  .erp-print-totals td { border: 1px solid #222; padding: 5px 7px; }
  .erp-print-totals td:first-child { font-weight: 800; background: #f7f7f7; }
  .erp-print-totals td:last-child { text-align: left; font-weight: 900; white-space: nowrap; }
  .erp-print-total-final td { background: #e2e2e2 !important; font-size: 1.08em; }

  .erp-print-notes { border: 1px solid #222; margin-top: 10px; padding: 7px 9px; }
  .erp-print-section-title { margin: 10px 0 5px; background: #dedede; padding: 5px 8px; font-size: 1.05em; font-weight: 900; }
  .erp-print-footer { margin-top: 12px; background: #dedede; padding: 6px 10px; text-align: center; font-size: 1.05em; font-weight: 900; }
  .erp-print-footer-details { display: flex; justify-content: space-between; gap: 12px; padding-top: 6px; font-size: .9em; }
  .erp-print-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 24px; }
  .erp-print-signature { border-top: 1px solid #555; padding-top: 5px; text-align: center; }
  .erp-print-status { display: inline-block; border: 1px solid #222; border-radius: 999px; padding: 1px 8px; font-weight: 800; }

  .layout-a4-compact .erp-print-topband { padding: 5px 9px; margin-bottom: 5px; }
  .layout-a4-compact .erp-print-title { font-size: 22px; }
  .layout-a4-compact .erp-print-store { font-size: 15px; }
  .layout-a4-compact .erp-print-head { gap: 10px; margin-bottom: 5px; }
  .layout-a4-compact .erp-print-table { margin-top: 4px; }
  .layout-a4-compact .erp-print-table th, .layout-a4-compact .erp-print-table td { padding: 3px 4px; }
  .layout-a4-compact .erp-print-summary { margin-top: 5px; gap: 10px; }
  .layout-a4-compact .erp-print-totals td { padding: 3px 5px; }
  .layout-a4-compact .erp-print-footer { margin-top: 7px; padding: 4px 8px; }

  .layout-receipt-80 .erp-print-topband, .layout-receipt-57 .erp-print-topband { display: block; text-align: center; background: transparent; border-bottom: 2px solid #222; padding: 0 0 5px; }
  .layout-receipt-80 .erp-print-title, .layout-receipt-57 .erp-print-title { font-size: 16px; margin-top: 3px; }
  .layout-receipt-80 .erp-print-store, .layout-receipt-57 .erp-print-store { font-size: 15px; text-align: center; }
  .layout-receipt-80 .erp-print-logo, .layout-receipt-57 .erp-print-logo { width: 40px; height: 40px; margin: 0 auto 3px; }
  .layout-receipt-80 .erp-print-head, .layout-receipt-57 .erp-print-head { display: block; margin-bottom: 5px; }
  .layout-receipt-80 .erp-print-meta, .layout-receipt-57 .erp-print-meta { gap: 2px 5px; margin-bottom: 4px; }
  .layout-receipt-80 .erp-print-customer, .layout-receipt-57 .erp-print-customer { text-align: right; border-top: 1px dashed #222; border-bottom: 1px dashed #222; padding: 4px 0; }
  .layout-receipt-80 .erp-print-store-details, .layout-receipt-57 .erp-print-store-details { display: none; }
  .layout-receipt-80 .erp-print-table th, .layout-receipt-80 .erp-print-table td { padding: 3px 2px; }
  .layout-receipt-57 .erp-print-table th, .layout-receipt-57 .erp-print-table td { padding: 2px 1px; }
  .layout-receipt-80 .erp-print-table .col-no, .layout-receipt-57 .erp-print-table .col-no,
  .layout-receipt-80 .erp-print-table .col-discount, .layout-receipt-57 .erp-print-table .col-discount { display: none; }
  .layout-receipt-80 .erp-print-table .col-product, .layout-receipt-57 .erp-print-table .col-product { width: 43%; }
  .layout-receipt-80 .erp-print-table .col-qty, .layout-receipt-57 .erp-print-table .col-qty { width: 12%; }
  .layout-receipt-80 .erp-print-table .col-price, .layout-receipt-57 .erp-print-table .col-price { width: 20%; }
  .layout-receipt-80 .erp-print-table .col-total, .layout-receipt-57 .erp-print-table .col-total { width: 25%; }
  .layout-receipt-80 .erp-print-summary, .layout-receipt-57 .erp-print-summary { display: block; margin-top: 5px; }
  .layout-receipt-80 .erp-print-due-text, .layout-receipt-57 .erp-print-due-text { display: none; }
  .layout-receipt-80 .erp-print-totals td, .layout-receipt-57 .erp-print-totals td { padding: 3px 2px; }
  .layout-receipt-80 .erp-print-footer, .layout-receipt-57 .erp-print-footer { background: transparent; border-top: 1px dashed #222; margin-top: 6px; padding: 5px 0 0; }
  .layout-receipt-80 .erp-print-footer-details, .layout-receipt-57 .erp-print-footer-details { display: block; text-align: center; line-height: 1.5; padding-top: 3px; }
  .layout-receipt-80 .erp-print-notes, .layout-receipt-57 .erp-print-notes { margin-top: 5px; padding: 4px; }
  .layout-receipt-57 .erp-print-title { font-size: 14px; }
  .layout-receipt-57 .erp-print-store { font-size: 13px; }

  @media print {
    html, body { width: auto !important; min-width: 0 !important; }
    .erp-print-sheet { break-inside: auto; }
    .erp-print-table tr, .erp-print-totals tr { break-inside: avoid; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

function pageCss(layout: InvoiceLayout | "document") {
  if (layout === "receipt-80") return "@page { size: 80mm auto; margin: 2mm; }";
  if (layout === "receipt-57") return "@page { size: 57mm auto; margin: 1.5mm; }";
  return "@page { size: A4 portrait; margin: 8mm; }";
}

function StoreMark({ settings }: { settings: any }) {
  const storeName = settings?.storeName ?? "المتجر";
  return settings?.logoUrl ? (
    <img className="erp-print-logo" src={settings.logoUrl} alt={`شعار ${storeName}`} />
  ) : null;
}

function InvoiceTemplate({ data, settings, layout }: { data: InvoiceData; settings: any; layout: InvoiceLayout }) {
  const storeName = settings?.storeName ?? "المتجر";
  const legalName = settings?.legalName ?? "";
  const phone = settings?.phone ?? "";
  const address = settings?.address ?? "";
  const footer = settings?.invoiceFooter ?? "";
  const taxRate = settings?.taxRate ?? 0;
  const hasDiscount = data.items.some(item => (item.discount ?? 0) > 0) || data.discount > 0;

  return (
    <article className={`erp-print-sheet layout-${layout}`} dir="rtl">
      <header className="erp-print-topband">
        <div>
          <StoreMark settings={settings} />
          <h1 className="erp-print-title">فاتورة</h1>
        </div>
        <div>
          <p className="erp-print-store">{storeName}</p>
          {legalName && legalName !== storeName && <div className="erp-print-store-details">{legalName}</div>}
        </div>
      </header>

      <section className="erp-print-head">
        <div className="erp-print-meta">
          <span className="erp-print-label">رقم الفاتورة</span><span className="erp-print-value">{data.invoiceNumber}</span>
          <span className="erp-print-label">نوع الفاتورة</span><span className="erp-print-value">{paymentMethodLabel[data.paymentMethod] ?? data.paymentMethod}</span>
          <span className="erp-print-label">التاريخ</span><span className="erp-print-value">{formatDate(data._creationTime)}</span>
          <span className="erp-print-label">الوقت</span><span className="erp-print-value">{formatTime(data._creationTime)}</span>
          <span className="erp-print-label">الحالة</span><span className="erp-print-value"><span className="erp-print-status">{statusLabel[data.status] ?? data.status}</span></span>
        </div>
        <div>
          <div className="erp-print-customer">العميل: {data.customerName || "عميل نقدي"}{data.customerPhone ? ` — ${data.customerPhone}` : ""}</div>
          <div className="erp-print-store-details">
            {address && <div>{address}</div>}
            {phone && <div>هاتف: {phone}</div>}
          </div>
        </div>
      </section>

      <table className="erp-print-table">
        <thead>
          <tr>
            <th className="col-no">#</th>
            <th className="col-product">اسم الصنف</th>
            <th className="col-qty">الكمية</th>
            <th className="col-price">السعر</th>
            {hasDiscount && <th className="col-discount">الخصم</th>}
            <th className="col-total">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={`${item.productName}-${index}`}>
              <td className="col-no">{index + 1}</td>
              <td className="product col-product">{item.productName}</td>
              <td className="col-qty">{item.quantity.toLocaleString("ar-EG")}</td>
              <td className="col-price">{money(item.unitPrice)}</td>
              {hasDiscount && <td className="col-discount">{(item.discount ?? 0) > 0 ? money(item.discount ?? 0) : "—"}</td>}
              <td className="col-total"><strong>{money(item.total)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="erp-print-summary">
        <div className="erp-print-due-text">المطلوب: <strong>{money(data.remaining > 0 ? data.remaining : data.total)}</strong></div>
        <table className="erp-print-totals">
          <tbody>
            <tr><td>الإجمالي</td><td>{money(data.subtotal)}</td></tr>
            {data.discount > 0 && <tr><td>الخصم</td><td>- {money(data.discount)}</td></tr>}
            {data.tax > 0 && <tr><td>ضريبة القيمة المضافة{taxRate ? ` ${taxRate}%` : ""}</td><td>{money(data.tax)}</td></tr>}
            <tr className="erp-print-total-final"><td>الإجمالي النهائي</td><td>{money(data.total)}</td></tr>
            <tr><td>المدفوع</td><td>{money(data.paid)}</td></tr>
            <tr><td>المتبقي</td><td>{money(data.remaining)}</td></tr>
          </tbody>
        </table>
      </section>

      {data.notes && <div className="erp-print-notes"><strong>ملاحظات:</strong> {data.notes}</div>}

      <footer>
        <div className="erp-print-footer">{footer || `شكرًا لزيارتكم — ${storeName}`}</div>
        <div className="erp-print-footer-details">
          <span>{address}</span>
          <span>{phone ? `للتواصل: ${phone}` : ""}</span>
        </div>
      </footer>
    </article>
  );
}

function DocumentHeader({ title, number, date, dataStatus, settings }: { title: string; number: string; date: number | string; dataStatus: string; settings: any }) {
  const storeName = settings?.storeName ?? "المتجر";
  return (
    <>
      <header className="erp-print-topband">
        <div><StoreMark settings={settings} /><h1 className="erp-print-title">{title}</h1></div>
        <p className="erp-print-store">{storeName}</p>
      </header>
      <section className="erp-print-head">
        <div className="erp-print-meta">
          <span className="erp-print-label">رقم المستند</span><span className="erp-print-value">{number}</span>
          <span className="erp-print-label">التاريخ</span><span className="erp-print-value">{formatDate(date)}</span>
          <span className="erp-print-label">الحالة</span><span className="erp-print-value">{statusLabel[dataStatus] ?? dataStatus}</span>
        </div>
        <div className="erp-print-store-details">
          {settings?.address && <div>{settings.address}</div>}
          {settings?.phone && <div>هاتف: {settings.phone}</div>}
        </div>
      </section>
    </>
  );
}

function OrderTemplate({ data, settings }: { data: OrderData; settings: any }) {
  return (
    <article className="erp-print-sheet layout-a4-classic" dir="rtl">
      <DocumentHeader title="أمر بيع" number={data.orderNumber} date={data._creationTime} dataStatus={data.status} settings={settings} />
      <div className="erp-print-section-title">بيانات العميل</div>
      <div className="erp-print-meta">
        <span className="erp-print-label">الاسم</span><span>{data.customerName}</span>
        {data.customerPhone && <><span className="erp-print-label">الهاتف</span><span>{data.customerPhone}</span></>}
        {data.expectedDate && <><span className="erp-print-label">التاريخ المتوقع</span><span>{data.expectedDate}</span></>}
      </div>
      <table className="erp-print-table">
        <thead><tr><th className="col-no">#</th><th className="col-product">الصنف</th><th className="col-qty">الكمية</th><th className="col-price">السعر</th><th className="col-total">الإجمالي</th></tr></thead>
        <tbody>{data.items.map((item, index) => <tr key={`${item.productName}-${index}`}><td>{index + 1}</td><td className="product">{item.productName}{item.notes ? <div style={{ fontWeight: 400, fontSize: ".9em" }}>{item.notes}</div> : null}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td><strong>{money(item.quantity * item.unitPrice)}</strong></td></tr>)}</tbody>
      </table>
      <section className="erp-print-summary"><div /><table className="erp-print-totals"><tbody><tr className="erp-print-total-final"><td>إجمالي الطلب</td><td>{money(data.total)}</td></tr><tr><td>العربون</td><td>{money(data.deposit)}</td></tr><tr><td>المتبقي</td><td>{money(data.remaining)}</td></tr></tbody></table></section>
      {data.notes && <div className="erp-print-notes"><strong>ملاحظات:</strong> {data.notes}</div>}
      <div className="erp-print-signatures"><div className="erp-print-signature">توقيع العميل</div><div className="erp-print-signature">توقيع المسؤول</div></div>
      <div className="erp-print-footer">{settings?.invoiceFooter || `شكرًا لتعاملكم مع ${settings?.storeName ?? "المتجر"}`}</div>
    </article>
  );
}

function RepairTemplate({ data, settings }: { data: RepairData; settings: any }) {
  return (
    <article className="erp-print-sheet layout-a4-classic" dir="rtl">
      <DocumentHeader title="أمر صيانة" number={data.repairNumber} date={data.receivedDate || data._creationTime} dataStatus={data.status} settings={settings} />
      <div className="erp-print-section-title">العميل والجهاز</div>
      <div className="erp-print-head">
        <div className="erp-print-meta">
          <span className="erp-print-label">العميل</span><span>{data.customerName}</span>
          <span className="erp-print-label">الهاتف</span><span>{data.customerPhone}</span>
          <span className="erp-print-label">الجهاز</span><span>{[data.deviceType, data.deviceBrand, data.deviceModel].filter(Boolean).join(" — ")}</span>
          {data.serialNumber && <><span className="erp-print-label">السيريال</span><span>{data.serialNumber}</span></>}
          {data.accessories && <><span className="erp-print-label">الملحقات</span><span>{data.accessories}</span></>}
        </div>
        <div className="erp-print-meta">
          <span className="erp-print-label">المشكلة</span><span>{data.problem}</span>
          {data.intakeCondition && <><span className="erp-print-label">حالة الاستلام</span><span>{data.intakeCondition}</span></>}
          {data.diagnosis && <><span className="erp-print-label">التشخيص</span><span>{data.diagnosis}</span></>}
          {data.technicianName && <><span className="erp-print-label">الفني</span><span>{data.technicianName}</span></>}
          {data.employeeName && <><span className="erp-print-label">أنشأ الأمر</span><span>{data.employeeName}</span></>}
          {data.expectedDate && <><span className="erp-print-label">التسليم المتوقع</span><span>{data.expectedDate}</span></>}
          {data.deliveredDate && <><span className="erp-print-label">تاريخ التسليم</span><span>{data.deliveredDate}</span></>}
        </div>
      </div>

      {data.parts.length > 0 && <>
        <div className="erp-print-section-title">قطع الغيار والمواد</div>
        <table className="erp-print-table"><thead><tr><th className="col-no">#</th><th className="col-product">القطعة</th><th className="col-qty">الكمية</th><th className="col-price">التكلفة</th><th className="col-total">الإجمالي</th></tr></thead><tbody>{data.parts.map((part, index) => <tr key={`${part.name}-${index}`}><td>{index + 1}</td><td className="product">{part.name}</td><td>{part.quantity}</td><td>{money(part.cost)}</td><td><strong>{money(part.lineTotal ?? part.cost * part.quantity)}</strong></td></tr>)}</tbody></table>
      </>}

      <section className="erp-print-summary"><div>{data.qualityCheckNotes ? <div className="erp-print-notes"><strong>اختبار الجودة:</strong> {data.qualityCheckNotes}</div> : null}</div><table className="erp-print-totals"><tbody><tr><td>تكلفة القطع</td><td>{money(data.parts.reduce((sum, part) => sum + (part.lineTotal ?? part.cost * part.quantity), 0))}</td></tr><tr><td>أجرة الإصلاح</td><td>{money(data.laborCost)}</td></tr><tr className="erp-print-total-final"><td>الإجمالي</td><td>{money(data.totalCost)}</td></tr><tr><td>العربون</td><td>{money(data.deposit)}</td></tr><tr><td>المتبقي</td><td>{money(data.remaining)}</td></tr></tbody></table></section>

      {data.warrantyDays !== undefined && <div className="erp-print-notes"><strong>الضمان:</strong> {data.warrantyDays} يوم{data.warrantyUntil ? ` — حتى ${data.warrantyUntil}` : ""}</div>}
      {data.history && data.history.length > 0 && <><div className="erp-print-section-title">سجل حالات الصيانة</div><table className="erp-print-table"><thead><tr><th>التاريخ</th><th>الانتقال</th><th>بواسطة</th><th>السبب</th></tr></thead><tbody>{data.history.map((entry, index) => <tr key={`${entry.date}-${index}`}><td>{entry.date}</td><td>{entry.fromStatus ? `${statusLabel[entry.fromStatus] ?? entry.fromStatus} ← ` : ""}{statusLabel[entry.toStatus] ?? entry.toStatus}</td><td>{entry.employeeName}</td><td>{entry.reason ?? "—"}</td></tr>)}</tbody></table></>}
      {data.notes && <div className="erp-print-notes"><strong>ملاحظات:</strong> {data.notes}</div>}
      <div className="erp-print-signatures"><div className="erp-print-signature">توقيع العميل (استلام)</div><div className="erp-print-signature">توقيع الفني</div></div>
      <div className="erp-print-footer">{settings?.invoiceFooter || `يرجى الاحتفاظ بهذا المستند — ${settings?.storeName ?? "المتجر"}`}</div>
    </article>
  );
}

export function PrintModal({ type, data, onClose }: PrintTemplateProps) {
  const canPrintInvoice = usePermission("print_invoices");
  const canPrintRepair = usePermission("print_repairs");
  const allowed = type === "invoice" || type === "order" ? canPrintInvoice : canPrintRepair;
  const settings = useQuery(api.settings.getPublic);
  const previewRef = useRef<HTMLDivElement>(null);
  const [invoiceLayout, setInvoiceLayout] = useState<InvoiceLayout>("a4-classic");
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = () => {
    if (!allowed || !previewRef.current || isPrinting) return;
    setIsPrinting(true);

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    document.body.appendChild(frame);

    const printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument ?? printWindow?.document;
    if (!printWindow || !printDocument) {
      frame.remove();
      setIsPrinting(false);
      return;
    }

    const title = type === "invoice"
      ? `فاتورة ${(data as InvoiceData).invoiceNumber}`
      : type === "order"
        ? `أمر بيع ${(data as OrderData).orderNumber}`
        : `أمر صيانة ${(data as RepairData).repairNumber}`;
    const layout = type === "invoice" ? invoiceLayout : "document";

    printDocument.open();
    printDocument.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}\n${pageCss(layout)}</style></head><body>${previewRef.current.innerHTML}</body></html>`);
    printDocument.close();

    const finish = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } finally {
        window.setTimeout(() => {
          frame.remove();
          setIsPrinting(false);
        }, 1200);
      }
    };

    const waitForImages = () => {
      const images = Array.from(printDocument.images);
      if (images.length === 0 || images.every(image => image.complete)) {
        window.setTimeout(finish, 60);
        return;
      }
      let remaining = images.filter(image => !image.complete).length;
      const done = () => {
        remaining -= 1;
        if (remaining <= 0) window.setTimeout(finish, 60);
      };
      images.filter(image => !image.complete).forEach(image => {
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
      window.setTimeout(() => {
        if (remaining > 0) finish();
      }, 1500);
    };

    waitForImages();
  };

  return (
    <div className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/60 p-3" style={{ zIndex: 100 }} dir="rtl" role="dialog" aria-modal="true" aria-label="معاينة الطباعة">
      <style>{PRINT_CSS}</style>
      <div className="my-2 w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-black text-slate-800">معاينة الطباعة</div>
              <div className="text-xs text-slate-500">المعاينة أدناه هي نفس المستند الذي سيصل للطابعة فقط، دون شاشة البرنامج.</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handlePrint} disabled={!allowed || isPrinting} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                {isPrinting ? "جارٍ فتح الطباعة..." : "طباعة"}
              </button>
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">إغلاق</button>
            </div>
          </div>

          {type === "invoice" && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="invoice-print-layout-picker">
              {INVOICE_LAYOUTS.map(layout => (
                <button key={layout.id} type="button" onClick={() => setInvoiceLayout(layout.id)} className={`rounded-xl border px-3 py-2 text-right transition-colors ${invoiceLayout === layout.id ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  <div className="text-sm font-black">{layout.label}</div>
                  <div className="mt-0.5 text-[11px] opacity-70">{layout.hint}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-auto bg-slate-200 p-4 sm:p-6">
          <div className="mx-auto w-fit max-w-full bg-white shadow-xl" ref={previewRef} data-testid="print-document-preview">
            {type === "invoice" && <InvoiceTemplate data={data as InvoiceData} settings={settings} layout={invoiceLayout} />}
            {type === "order" && <OrderTemplate data={data as OrderData} settings={settings} />}
            {type === "repair" && <RepairTemplate data={data as RepairData} settings={settings} />}
          </div>
        </div>
      </div>
    </div>
  );
}
