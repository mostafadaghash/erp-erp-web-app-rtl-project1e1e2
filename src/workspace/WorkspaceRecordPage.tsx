import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Boxes, FileText, Package, ShoppingCart, Truck, UserRound, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCurrency } from "../lib/utils";

export type WorkspaceRecordType = "product" | "customer" | "supplier" | "invoice" | "order";

export interface WorkspaceRecordLookup {
  kind: "sku" | "phone" | "invoiceNumber";
  value: string;
  branchId?: string;
}

export interface WorkspaceRecordTarget {
  type: WorkspaceRecordType;
  title: string;
  group: string;
  id?: string;
  lookup?: WorkspaceRecordLookup;
}

export function workspaceRecordIdentity(target: WorkspaceRecordTarget): string {
  if (target.id) return `${target.type}:${target.id}`;
  const lookup = target.lookup;
  return `${target.type}:${lookup?.kind ?? "unknown"}:${lookup?.value ?? target.title}:${lookup?.branchId ?? ""}`;
}

export function WorkspaceRecordPage({
  target,
  onOpenRecord,
}: {
  target: WorkspaceRecordTarget;
  onOpenRecord: (target: WorkspaceRecordTarget) => void;
}) {
  const productById = useQuery(
    api.products.get,
    target.type === "product" && target.id ? { id: target.id as Id<"products"> } : "skip",
  );
  const productMatches = useQuery(
    api.products.list,
    target.type === "product" && !target.id && target.lookup?.kind === "sku"
      ? {
          search: target.lookup.value,
          branchId: target.lookup.branchId ? target.lookup.branchId as Id<"branches"> : undefined,
        }
      : "skip",
  );
  const customerById = useQuery(
    api.customers.profile,
    target.type === "customer" && target.id ? { id: target.id as Id<"customers"> } : "skip",
  );
  const me = useQuery(api.employees.me, target.type === "customer" && !target.id ? {} : "skip");
  const customerMatches = useQuery(
    api.customers.list,
    target.type === "customer" && !target.id && target.lookup?.kind === "phone"
      ? {
          branchId: target.lookup.branchId
            ? target.lookup.branchId as Id<"branches">
            : me?.branchId,
        }
      : "skip",
  );
  const supplierById = useQuery(
    api.suppliers.profile,
    target.type === "supplier" && target.id ? { id: target.id as Id<"suppliers"> } : "skip",
  );
  const supplierMatches = useQuery(
    api.suppliers.list,
    target.type === "supplier" && !target.id && target.lookup?.kind === "phone" ? {} : "skip",
  );
  const invoiceById = useQuery(
    api.invoices.get,
    target.type === "invoice" && target.id ? { id: target.id as Id<"invoices"> } : "skip",
  );
  const invoiceMatches = useQuery(
    api.invoices.list,
    target.type === "invoice" && !target.id && target.lookup?.kind === "invoiceNumber" ? {} : "skip",
  );
  const orderDetails = useQuery(
    api.orders.details,
    target.type === "order" && target.id ? { id: target.id as Id<"orders"> } : "skip",
  );

  const resolvedProduct = useMemo(() => {
    if (target.type !== "product") return undefined;
    if (target.id) return productById;
    const lookup = target.lookup?.value;
    return productMatches?.find((row) => row.sku === lookup) ?? null;
  }, [productById, productMatches, target]);

  const resolvedCustomer = useMemo(() => {
    if (target.type !== "customer") return undefined;
    if (target.id) return customerById;
    const customer = customerMatches?.find((row) => row.phone === target.lookup?.value);
    return customer ? { customer, balance: null, invoices: [], orders: [], repairs: [], deliveries: [], ledger: [] } : customerMatches ? null : undefined;
  }, [customerById, customerMatches, target]);

  const resolvedSupplier = useMemo(() => {
    if (target.type !== "supplier") return undefined;
    if (target.id) return supplierById;
    const supplier = supplierMatches?.find((row) => row.phone === target.lookup?.value);
    return supplier ? { supplier, receipts: [], returns: [], payments: [], ledger: [], balances: [] } : supplierMatches ? null : undefined;
  }, [supplierById, supplierMatches, target]);

  const resolvedInvoice = useMemo(() => {
    if (target.type !== "invoice") return undefined;
    if (target.id) return invoiceById;
    return invoiceMatches?.find((row) => row.invoiceNumber === target.lookup?.value) ?? (invoiceMatches ? null : undefined);
  }, [invoiceById, invoiceMatches, target]);

  if (target.type === "product") {
    if (resolvedProduct === undefined) return <LoadingRecord />;
    if (!resolvedProduct) return <MissingRecord />;
    return <ProductRecord product={resolvedProduct} onOpenRecord={onOpenRecord} />;
  }
  if (target.type === "customer") {
    if (resolvedCustomer === undefined) return <LoadingRecord />;
    if (!resolvedCustomer) return <MissingRecord />;
    return <CustomerRecord profile={resolvedCustomer} onOpenRecord={onOpenRecord} />;
  }
  if (target.type === "supplier") {
    if (resolvedSupplier === undefined) return <LoadingRecord />;
    if (!resolvedSupplier) return <MissingRecord />;
    return <SupplierRecord profile={resolvedSupplier} />;
  }
  if (target.type === "invoice") {
    if (resolvedInvoice === undefined) return <LoadingRecord />;
    if (!resolvedInvoice) return <MissingRecord />;
    return <InvoiceRecord invoice={resolvedInvoice} onOpenRecord={onOpenRecord} />;
  }
  if (orderDetails === undefined) return <LoadingRecord />;
  if (!orderDetails) return <MissingRecord />;
  return <OrderRecord details={orderDetails} onOpenRecord={onOpenRecord} />;
}

function ProductRecord({ product, onOpenRecord }: { product: any; onOpenRecord: (target: WorkspaceRecordTarget) => void }) {
  const { formatCurrency } = useCurrency();
  return (
    <RecordLayout icon={<Package className="h-6 w-6" />} kicker="كارت الصنف" title={product.name} subtitle={product.sku}>
      <MetricGrid rows={[
        ["SKU", product.sku],
        ["المخزون", `${product.stock} ${product.unit}`],
        ["الحد الأدنى", product.minStock],
        ["سعر البيع", product.sellPrice === undefined ? "—" : formatCurrency(product.sellPrice)],
        ["سعر التكلفة", product.costPrice === undefined ? "—" : formatCurrency(product.costPrice)],
        ["الضمان", product.warrantyMonths === undefined ? "—" : `${product.warrantyMonths} شهر`],
        ["الحالة", product.isActive === false ? "معطل" : "نشط"],
      ]} />
      {product.description && <TextPanel title="الوصف" value={product.description} />}
      {product.supplierId && (
        <RelationButton
          icon={<Truck className="h-4 w-4" />}
          label="فتح المورد المرتبط"
          onClick={() => onOpenRecord({ type: "supplier", id: String(product.supplierId), title: "المورد المرتبط", group: "المشتريات" })}
        />
      )}
    </RecordLayout>
  );
}

function CustomerRecord({ profile, onOpenRecord }: { profile: any; onOpenRecord: (target: WorkspaceRecordTarget) => void }) {
  const { formatCurrency } = useCurrency();
  const customer = profile.customer;
  return (
    <RecordLayout icon={<UserRound className="h-6 w-6" />} kicker="بطاقة العميل" title={customer.name} subtitle={customer.phone}>
      <MetricGrid rows={[
        ["الهاتف", customer.phone],
        ["البريد", customer.email || "—"],
        ["التصنيف", customer.categoryName || "—"],
        ["إجمالي المشتريات", formatCurrency(profile.balance?.totalPurchases ?? 0)],
        ["المديونية", formatCurrency(profile.balance?.receivableBalance ?? 0)],
        ["رصيد مقدم", formatCurrency(profile.balance?.advanceBalance ?? 0)],
      ]} />
      {customer.address && <TextPanel title="العنوان" value={customer.address} />}
      {customer.notes && <TextPanel title="الملاحظات" value={customer.notes} />}
      {profile.invoices?.length > 0 && (
        <RelationList title="فواتير العميل" icon={<FileText className="h-4 w-4" />}>
          {profile.invoices.slice(0, 12).map((invoice: any) => (
            <RelationButton
              key={invoice._id}
              label={`${invoice.invoiceNumber} — ${formatCurrency(invoice.netTotal ?? invoice.total)}`}
              onClick={() => onOpenRecord({ type: "invoice", id: String(invoice._id), title: `فاتورة ${invoice.invoiceNumber}`, group: "المبيعات" })}
            />
          ))}
        </RelationList>
      )}
      {profile.orders?.length > 0 && (
        <RelationList title="أوامر البيع" icon={<ShoppingCart className="h-4 w-4" />}>
          {profile.orders.slice(0, 12).map((order: any) => (
            <RelationButton
              key={order._id}
              label={order.orderNumber}
              onClick={() => onOpenRecord({ type: "order", id: String(order._id), title: `أمر بيع ${order.orderNumber}`, group: "المبيعات" })}
            />
          ))}
        </RelationList>
      )}
    </RecordLayout>
  );
}

function SupplierRecord({ profile }: { profile: any }) {
  const { formatCurrency } = useCurrency();
  const supplier = profile.supplier;
  const balance = (profile.balances ?? []).reduce((sum: number, row: any) => sum + (row.balance ?? 0), 0);
  return (
    <RecordLayout icon={<Truck className="h-6 w-6" />} kicker="بطاقة المورد" title={supplier.name} subtitle={supplier.phone}>
      <MetricGrid rows={[
        ["الهاتف", supplier.phone],
        ["البريد", supplier.email || "—"],
        ["التصنيف", supplier.categoryName || "—"],
        ["الرصيد", formatCurrency(balance)],
        ["عمليات الاستلام", profile.receipts?.length ?? 0],
        ["المرتجعات", profile.returns?.length ?? 0],
      ]} />
      {supplier.address && <TextPanel title="العنوان" value={supplier.address} />}
      {supplier.notes && <TextPanel title="الملاحظات" value={supplier.notes} />}
    </RecordLayout>
  );
}

function InvoiceRecord({ invoice, onOpenRecord }: { invoice: any; onOpenRecord: (target: WorkspaceRecordTarget) => void }) {
  const { formatCurrency } = useCurrency();
  return (
    <RecordLayout icon={<FileText className="h-6 w-6" />} kicker="فاتورة مبيعات محفوظة" title={invoice.invoiceNumber} subtitle={invoice.customerName}>
      <MetricGrid rows={[
        ["الإجمالي", formatCurrency(invoice.total)],
        ["الصافي", formatCurrency(invoice.netTotal ?? invoice.total)],
        ["المدفوع", formatCurrency(invoice.paid)],
        ["المتبقي", formatCurrency(invoice.remaining)],
        ["الحالة", invoice.status],
        ["طريقة الدفع", invoice.paymentMethodCode ?? invoice.paymentMethod ?? "—"],
      ]} />
      {invoice.customerId && (
        <RelationButton
          icon={<Users className="h-4 w-4" />}
          label={`العميل: ${invoice.customerName}`}
          onClick={() => onOpenRecord({ type: "customer", id: String(invoice.customerId), title: `العميل: ${invoice.customerName}`, group: "العملاء" })}
        />
      )}
      <RelationList title="الأصناف" icon={<Boxes className="h-4 w-4" />}>
        {invoice.items.map((item: any, index: number) => (
          <RelationButton
            key={`${item.productId}-${index}`}
            label={`${item.productName} × ${item.quantity}`}
            onClick={() => onOpenRecord({ type: "product", id: String(item.productId), title: item.productName, group: "المخزون" })}
          />
        ))}
      </RelationList>
      {invoice.notes && <TextPanel title="الملاحظات" value={invoice.notes} />}
    </RecordLayout>
  );
}

function OrderRecord({ details, onOpenRecord }: { details: any; onOpenRecord: (target: WorkspaceRecordTarget) => void }) {
  const { formatCurrency } = useCurrency();
  const order = details.order;
  return (
    <RecordLayout icon={<ShoppingCart className="h-6 w-6" />} kicker="أمر بيع" title={order.orderNumber} subtitle={order.customerName}>
      <MetricGrid rows={[
        ["الإجمالي", formatCurrency(order.total)],
        ["العربون", formatCurrency(order.deposit)],
        ["المتبقي", formatCurrency(order.remaining)],
        ["الحالة", order.status],
        ["التاريخ المتوقع", order.expectedDate || "—"],
      ]} />
      {order.customerId && (
        <RelationButton
          icon={<Users className="h-4 w-4" />}
          label={`العميل: ${order.customerName}`}
          onClick={() => onOpenRecord({ type: "customer", id: String(order.customerId), title: `العميل: ${order.customerName}`, group: "العملاء" })}
        />
      )}
      {details.invoice?._id && (
        <RelationButton
          icon={<FileText className="h-4 w-4" />}
          label={`الفاتورة: ${details.invoice.invoiceNumber}`}
          onClick={() => onOpenRecord({ type: "invoice", id: String(details.invoice._id), title: `فاتورة ${details.invoice.invoiceNumber}`, group: "المبيعات" })}
        />
      )}
      <RelationList title="الأصناف" icon={<Boxes className="h-4 w-4" />}>
        {order.items.map((item: any, index: number) => (
          item.productId ? (
            <RelationButton
              key={`${item.productId}-${index}`}
              label={`${item.productName} × ${item.quantity}`}
              onClick={() => onOpenRecord({ type: "product", id: String(item.productId), title: item.productName, group: "المخزون" })}
            />
          ) : <div key={index} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">{item.productName} × {item.quantity}</div>
        ))}
      </RelationList>
    </RecordLayout>
  );
}

function RecordLayout({ icon, kicker, title, subtitle, children }: { icon: React.ReactNode; kicker: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 lg:p-6" data-testid="workspace-record-page">
      <header className="professional-panel flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white">{icon}</span>
        <div className="min-w-0">
          <p className="erp-kicker">{kicker}</p>
          <h2 className="truncate text-2xl font-black text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </header>
      {children}
    </div>
  );
}

function MetricGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="professional-panel p-4">
          <p className="text-xs font-bold text-slate-400">{label}</p>
          <div className="mt-2 break-words text-base font-black text-slate-800">{value}</div>
        </div>
      ))}
    </section>
  );
}

function TextPanel({ title, value }: { title: string; value: string }) {
  return <section className="professional-panel p-5"><h3 className="font-black text-slate-900">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{value}</p></section>;
}

function RelationList({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="professional-panel p-5"><h3 className="mb-3 flex items-center gap-2 font-black text-slate-900">{icon}{title}</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</div></section>;
}

function RelationButton({ icon, label, onClick }: { icon?: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50" onClick={onClick}>{icon}<span className="truncate">{label}</span></button>;
}

function LoadingRecord() {
  return <div className="grid min-h-[50vh] place-items-center p-6 text-sm font-bold text-slate-400">جارٍ تحميل السجل...</div>;
}

function MissingRecord() {
  return <div className="grid min-h-[50vh] place-items-center p-6"><div className="text-center"><Package className="mx-auto h-12 w-12 text-slate-300"/><h2 className="mt-3 font-black text-slate-800">السجل غير متاح</h2><p className="mt-1 text-sm text-slate-500">قد يكون محذوفًا أو خارج صلاحيات الفرع الحالي.</p></div></div>;
}
