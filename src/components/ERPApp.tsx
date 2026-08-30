import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell, ChevronDown, Menu, Plus, ShieldX, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Permission } from "../../convex/lib/permissions";
import { PermissionProvider } from "../lib/access";
import { getBrand } from "../lib/branding";
import { AccountsHubPage } from "./AccountsHubPage";
import { AuditLogsPage } from "./AuditLogsPage";
import { BranchesPage } from "./BranchesPage";
import { CRMPage } from "./CRMPage";
import { CustomerFollowUpsPage } from "./CustomerFollowUpsPage";
import { CustomerLedgerPage } from "./CustomerLedgerPage";
import { CustomersPage } from "./CustomersPage";
import { Dashboard } from "./Dashboard";
import { DataExportPage } from "./DataExportPage";
import { DeliveriesPage } from "./DeliveriesPage";
import { EmployeesPage } from "./EmployeesPage";
import { ExpensesPage } from "./ExpensesPage";
import { GeneralLedgerPage } from "./GeneralLedgerPage";
import { InvoicesPage } from "./InvoicesPage";
import { NewCustomerPage } from "./NewCustomerPage";
import { NewInvoicePage } from "./NewInvoicePage";
import { NewPurchaseInvoicePage } from "./NewPurchaseInvoicePage";
import { OrdersPage } from "./OrdersPage";
import { ProductsPage } from "./ProductsPage";
import { PurchaseReturnsPage } from "./PurchaseReturnsPage";
import { RepairsPage } from "./RepairsPage";
import { ReportsPage } from "./ReportsPage";
import { SettingsPage } from "./SettingsPage";
import { ShipmentsPage } from "./ShipmentsPage";
import { Sidebar } from "./Sidebar";
import { SupplierPaymentsPage } from "./SupplierPaymentsPage";
import { SuppliersPage } from "./SuppliersPage";
import { TreasuryPage } from "./TreasuryPage";
import { GlobalSearch } from "./GlobalSearch";
import { InventoryWorkspacePage } from "./InventoryWorkspacePage";
import { PaymentSchedulesPage } from "./PaymentSchedulesPage";
import { QuotesPage } from "./QuotesPage";
import { VouchersPage } from "./VouchersPage";
import type { ReportKind } from "./ReportsPage";

export type Page =
  | "dashboard" | "products" | "inventory" | "customers" | "new-customer" | "follow-ups" | "invoices" | "sales-returns" | "quotes" | "credit-invoices"
  | "new-invoice" | "new-purchase-invoice" | "repairs" | "expenses" | "suppliers" | "orders"
  | "deliveries" | "shipments" | "branches" | "employees" | "crm"
  | "reports" | "settings" | "audit-logs" | "accounts-home" | "treasury"
  | "supplier-payments" | "purchase-returns" | "customer-ledger"
  | "general-ledger" | "data-export" | "vouchers" | "payment-schedules";

const FOLLOW_UP_ROLE_FALLBACK = new Set(["admin", "manager", "sales", "customer_service", "technician", "shipping"]);

const PAGE_PERMISSIONS: Partial<Record<Page, Permission>> = {
  products: "view_products",
  inventory: "view_products",
  customers: "view_customers",
  "new-customer": "create_customers",
  "follow-ups": "view_follow_ups",
  invoices: "view_invoices",
  "sales-returns": "view_sales_returns",
  "new-invoice": "create_invoices",
  "new-purchase-invoice": "create_shipments",
  quotes: "view_quotes",
  "credit-invoices": "view_invoices",
  repairs: "view_repairs",
  expenses: "view_expenses",
  suppliers: "view_suppliers",
  orders: "view_orders",
  deliveries: "view_deliveries",
  shipments: "view_shipments",
  branches: "view_branches",
  employees: "view_employees",
  crm: "view_leads",
  reports: "view_reports",
  settings: "manage_settings",
  "audit-logs": "view_audit_logs",
  "accounts-home": "view_finance",
  treasury: "view_finance",
  "supplier-payments": "view_supplier_ledger",
  "purchase-returns": "view_purchase_returns",
  "customer-ledger": "view_customer_ledger",
  "general-ledger": "view_general_ledger",
  "data-export": "export_data",
  vouchers: "view_finance",
  "payment-schedules": "view_finance",
};

const PAGE_MODULES: Partial<Record<Page, string>> = {
  invoices: "invoices",
  "sales-returns": "invoices",
  "new-invoice": "invoices",
  "new-purchase-invoice": "shipments",
  quotes: "invoices",
  "credit-invoices": "invoices",
  orders: "orders",
  deliveries: "deliveries",
  repairs: "repairs",
  expenses: "expenses",
  suppliers: "suppliers",
  shipments: "shipments",
  branches: "branches",
  employees: "employees",
  crm: "crm",
  reports: "reports",
};

const PAGE_META: Record<Page, { group: string; title: string }> = {
  dashboard: { group: "لوحة التحكم", title: "لوحة التحكم" },
  products: { group: "المخزون", title: "الأصناف والمخزون" },
  inventory: { group: "المخزون", title: "إدارة المخزون" },
  customers: { group: "العملاء", title: "قائمة العملاء" },
  "new-customer": { group: "العملاء", title: "إضافة عميل جديد" },
  "follow-ups": { group: "العملاء", title: "متابعة العملاء" },
  invoices: { group: "المبيعات", title: "المبيعات" },
  "sales-returns": { group: "المبيعات", title: "مرتجعات المبيعات" },
  "new-invoice": { group: "المبيعات", title: "فاتورة بيع جديدة" },
  "new-purchase-invoice": { group: "المشتريات", title: "فاتورة مشتريات جديدة" },
  quotes: { group: "المبيعات", title: "عروض الأسعار" },
  "credit-invoices": { group: "الحسابات", title: "الفواتير الآجلة" },
  repairs: { group: "الصيانة", title: "أوامر الصيانة" },
  expenses: { group: "الحسابات", title: "المصروفات" },
  suppliers: { group: "المشتريات", title: "الموردون" },
  orders: { group: "المبيعات", title: "أوامر البيع" },
  deliveries: { group: "الشحن والتوصيل", title: "إدارة الشحن والتحصيل" },
  shipments: { group: "المشتريات", title: "المشتريات" },
  branches: { group: "الإدارة", title: "الفروع" },
  employees: { group: "الإدارة", title: "المستخدمون والصلاحيات" },
  crm: { group: "المبيعات", title: "إدارة علاقات العملاء" },
  reports: { group: "التقارير", title: "مركز التقارير" },
  settings: { group: "الإدارة", title: "إعدادات النظام" },
  "audit-logs": { group: "الإدارة", title: "سجل المراجعة" },
  "accounts-home": { group: "الحسابات", title: "نظرة عامة" },
  treasury: { group: "الحسابات", title: "الخزائن والبنوك" },
  "supplier-payments": { group: "الحسابات", title: "حسابات الموردين" },
  "purchase-returns": { group: "المشتريات", title: "مرتجعات المشتريات" },
  "customer-ledger": { group: "الحسابات", title: "حسابات العملاء" },
  "general-ledger": { group: "الحسابات", title: "المحاسبة العامة" },
  "data-export": { group: "الإدارة", title: "تصدير البيانات" },
  vouchers: { group: "الحسابات", title: "سندات القبض والصرف" },
  "payment-schedules": { group: "الحسابات", title: "الشيكات والأقساط" },
};

type CreateTarget =
  | "new-invoice"
  | "new-purchase-invoice"
  | "orders"
  | "customers"
  | "products"
  | "shipments"
  | "deliveries"
  | "expenses"
  | "repairs"
  | "sales-returns"
  | "purchase-returns"
  | "vouchers"
  | "payment-schedules"
  | "inventory"
  | "quotes";

const CREATE_ACTIONS: Array<{ id: string; page: CreateTarget; label: string; permission: Permission; voucherKind?: "receipt" | "disbursement" }> = [
  { id: "invoice", page: "new-invoice", label: "فاتورة بيع", permission: "create_invoices" },
  { id: "purchase", page: "new-purchase-invoice", label: "فاتورة شراء", permission: "create_shipments" },
  { id: "sales-return", page: "sales-returns", label: "مرتجع بيع", permission: "create_sales_returns" },
  { id: "purchase-return", page: "purchase-returns", label: "مرتجع شراء", permission: "create_purchase_returns" },
  { id: "customer", page: "customers", label: "إضافة عميل", permission: "create_customers" },
  { id: "repair", page: "repairs", label: "أمر صيانة", permission: "create_repairs" },
  { id: "delivery", page: "deliveries", label: "طلب شحن", permission: "create_deliveries" },
  { id: "receipt", page: "vouchers", label: "سند قبض", permission: "record_collections", voucherKind: "receipt" },
  { id: "disbursement", page: "vouchers", label: "سند صرف", permission: "record_disbursements", voucherKind: "disbursement" },
  { id: "expense", page: "expenses", label: "مصروف", permission: "create_expenses" },
  { id: "stock-transfer", page: "inventory", label: "تحويل مخزني", permission: "edit_products" },
];

export function ERPApp() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [reportTarget, setReportTarget] = useState<ReportKind>("sales");
  const [voucherKind, setVoucherKind] = useState<"receipt" | "disbursement">("receipt");
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const [createRequest, setCreateRequest] = useState<{ page: Page; token: number } | null>(null);
  const [customerLedgerTarget, setCustomerLedgerTarget] = useState<{
    customerId: Id<"customers">;
    branchId: Id<"branches">;
  } | null>(null);

  const settings = useQuery(api.settings.getPublic);
  const me = useQuery(api.employees.me);
  const brand = getBrand(settings);
  const permissions = me?.permissions ?? [];
  const can = (permission: Permission) => permissions.includes(permission);
  const modules = (settings?.modules ?? {}) as Record<string, boolean | undefined>;
  const lowStock = useQuery(api.products.list, permissions.includes("view_products") ? { lowStock: true } : "skip") ?? [];

  useEffect(() => { const online = () => setIsOnline(true); const offline = () => setIsOnline(false); window.addEventListener("online", online); window.addEventListener("offline", offline); return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); }; }, []);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !quickMenuRef.current?.contains(event.target)
      ) {
        setQuickMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [quickMenuOpen]);

  const isModuleEnabled = (page: Page) => {
    const moduleName = PAGE_MODULES[page];
    return !moduleName || modules[moduleName] !== false;
  };

  const canAccessPage = (page: Page) => {
    const required = PAGE_PERMISSIONS[page];
    const hasPermission = !required || can(required);
    const hasFollowUpFallback = page === "follow-ups" && Boolean(me && FOLLOW_UP_ROLE_FALLBACK.has(me.role));
    return isModuleEnabled(page) && (hasPermission || hasFollowUpFallback);
  };

  const canSelectWorkingBranch =
    settings !== undefined &&
    me?.role === "admin" &&
    can("manage_branches") &&
    modules.branches !== false;

  const branches = useQuery(api.branches.list, canSelectWorkingBranch ? {} : "skip");
  const setWorkingBranch = useMutation(api.employees.setWorkingBranch);

  const handleWorkingBranchChange = async (branchId: string) => {
    if (!branchId) return;
    try {
      await setWorkingBranch({ branchId: branchId as Id<"branches"> });
      toast.success("تم تغيير فرع العمل");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير فرع العمل");
    }
  };

  const navigate = (page: Page) => {
    if (!canAccessPage(page)) return;
    setCurrentPage(page);
    setQuickMenuOpen(false);
    setSidebarOpen(false);
  };

  const requestCreate = (page: CreateTarget, nextVoucherKind?: "receipt" | "disbursement") => {
    if (page === "customers") {
      if (!canAccessPage("new-customer")) return;
      return navigate("new-customer");
    }
    if (!canAccessPage(page)) return;
    if (page === "new-invoice" || page === "new-purchase-invoice") return navigate(page);
    if (nextVoucherKind) setVoucherKind(nextVoucherKind);
    setCurrentPage(page);
    setCreateRequest({ page, token: Date.now() });
    setQuickMenuOpen(false);
    setSidebarOpen(false);
  };

  const openReport = (report: ReportKind) => { setReportTarget(report); navigate("reports"); };

  const openCustomerLedger = (
    customerId: Id<"customers">,
    branchId: Id<"branches">,
  ) => {
    if (!canAccessPage("customer-ledger")) return;
    setCustomerLedgerTarget({ customerId, branchId });
    navigate("customer-ledger");
  };

  if (me === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-500">جارٍ تجهيز مساحة العمل...</p>
      </div>
    );
  }

  const authorized = canAccessPage(currentPage);
  const pageMeta = PAGE_META[currentPage];
  const createActions = CREATE_ACTIONS.filter(
    (action) => can(action.permission) && isModuleEnabled(action.page),
  );
  const createToken = (page: Page) =>
    createRequest?.page === page ? createRequest.token : undefined;

  return (
    <PermissionProvider permissions={permissions}>
      <div className="flex h-screen flex-col overflow-hidden bg-slate-50" dir="rtl">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div
          className={`fixed inset-y-0 right-0 z-50 w-72 transform transition-transform duration-300 lg:static lg:h-auto lg:w-full lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          }`}
        >
          <Sidebar
            currentPage={currentPage}
            onNavigate={navigate}
            brand={brand}
            modules={modules}
            permissions={permissions}
            userName={me.name}
            role={me.role}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="erp-contextbar flex flex-shrink-0 items-center gap-3 px-4 lg:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button
                className="rounded-xl p-2.5 text-slate-600 transition hover:bg-slate-100 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="فتح القائمة الرئيسية"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400">{pageMeta.group}</p>
                <h1 className="truncate text-base font-black text-slate-900 lg:text-lg">{pageMeta.title}</h1>
              </div>
            </div>

            <GlobalSearch onNavigate={navigate} />
            <div className="mr-auto flex items-center gap-2.5">
              {canSelectWorkingBranch && (
                <select
                  data-testid="working-branch-select"
                  className={`hidden rounded-xl border bg-white px-3 py-2 text-xs md:block ${
                    me.branchId ? "border-slate-200 text-slate-700" : "border-amber-300 text-amber-700"
                  }`}
                  value={me.branchId ?? ""}
                  onChange={(event) => void handleWorkingBranchChange(event.target.value)}
                  aria-label="فرع العمل الحالي"
                >
                  <option value="" disabled>اختر فرع العمل</option>
                  {(branches ?? [])
                    .filter((branch) => branch.isActive)
                    .map((branch) => (
                      <option key={branch._id} value={branch._id}>{branch.name}</option>
                    ))}
                </select>
              )}

              <button type="button" className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600" title={`${lowStock.length} تنبيه مخزون`} onClick={() => navigate("inventory")}><Bell className="h-4 w-4" />{lowStock.length > 0 && <span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">{Math.min(lowStock.length, 99)}</span>}</button>
              <span className={`hidden items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold sm:flex ${isOnline ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`} title={isOnline ? "متصل — المزامنة تعمل" : "غير متصل — سيستأنف التحديث عند عودة الاتصال"}>{isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{isOnline ? "متصل" : "دون اتصال"}</span>

              {createActions.length > 0 && (
                <div className="relative" ref={quickMenuRef}>
                  <button
                    type="button"
                    data-testid="quick-action-menu"
                    onClick={() => setQuickMenuOpen((value) => !value)}
                    className="btn-primary flex items-center gap-2"
                    aria-expanded={quickMenuOpen}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">إنشاء جديد</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {quickMenuOpen && (
                    <div className="absolute left-0 top-[calc(100%+10px)] z-50 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                      {createActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          data-testid={`quick-action-${action.page}`}
                          onClick={() => requestCreate(action.page, action.voucherKind)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-[var(--brand-primary)]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          <main className="erp-workspace-main min-h-0 flex-1 overflow-y-auto">
            {!authorized && (
              <div className="flex min-h-[70vh] items-center justify-center p-6">
                <div className="text-center">
                  <ShieldX className="mx-auto mb-4 h-14 w-14 text-red-400" />
                  <h2 className="text-xl font-bold text-slate-800">غير مصرح بالوصول</h2>
                  <p className="mt-2 text-sm text-slate-500">لا يملك حسابك الصلاحية المطلوبة لفتح هذه الصفحة.</p>
                </div>
              </div>
            )}
            {authorized && currentPage === "dashboard" && <Dashboard onOpenReport={openReport} permissions={permissions} />}
            {authorized && currentPage === "accounts-home" && <AccountsHubPage onNavigate={navigate} permissions={permissions} />}
            {authorized && currentPage === "products" && <ProductsPage createRequestToken={createToken("products")} />}
            {authorized && currentPage === "inventory" && <InventoryWorkspacePage createRequestToken={createToken("inventory")} />}
            {authorized && currentPage === "customers" && <CustomersPage onOpenLedger={openCustomerLedger} onCreateCustomer={() => navigate("new-customer")} createRequestToken={createToken("customers")} />}
            {authorized && currentPage === "new-customer" && <NewCustomerPage onClose={() => navigate("customers")} />}
            {authorized && currentPage === "follow-ups" && <CustomerFollowUpsPage />}
            {authorized && currentPage === "invoices" && <InvoicesPage onNavigate={navigate} view="sales" />}
            {authorized && currentPage === "sales-returns" && <InvoicesPage onNavigate={navigate} view="returns" />}
            {authorized && currentPage === "credit-invoices" && <InvoicesPage onNavigate={navigate} view="sales" creditOnly />}
            {authorized && currentPage === "new-invoice" && <NewInvoicePage onNavigate={navigate} />}
            {authorized && currentPage === "new-purchase-invoice" && <NewPurchaseInvoicePage onNavigate={navigate} />}
            {authorized && currentPage === "quotes" && <QuotesPage createRequestToken={createToken("quotes")} />}
            {authorized && currentPage === "repairs" && <RepairsPage createRequestToken={createToken("repairs")} />}
            {authorized && currentPage === "expenses" && <ExpensesPage createRequestToken={createToken("expenses")} />}
            {authorized && currentPage === "suppliers" && <SuppliersPage />}
            {authorized && currentPage === "orders" && <OrdersPage createRequestToken={createToken("orders")} />}
            {authorized && currentPage === "deliveries" && <DeliveriesPage createRequestToken={createToken("deliveries")} />}
            {authorized && currentPage === "shipments" && <ShipmentsPage createRequestToken={createToken("shipments")} />}
            {authorized && currentPage === "branches" && <BranchesPage />}
            {authorized && currentPage === "employees" && <EmployeesPage />}
            {authorized && currentPage === "crm" && <CRMPage />}
            {authorized && currentPage === "reports" && <ReportsPage initialReport={reportTarget} />}
            {authorized && currentPage === "settings" && <SettingsPage />}
            {authorized && currentPage === "audit-logs" && <AuditLogsPage />}
            {authorized && currentPage === "treasury" && <TreasuryPage />}
            {authorized && currentPage === "supplier-payments" && <SupplierPaymentsPage />}
            {authorized && currentPage === "purchase-returns" && <PurchaseReturnsPage />}
            {authorized && currentPage === "customer-ledger" && (
              <CustomerLedgerPage
                initialCustomerId={customerLedgerTarget?.customerId}
                initialBranchId={customerLedgerTarget?.branchId}
              />
            )}
            {authorized && currentPage === "general-ledger" && <GeneralLedgerPage />}
            {authorized && currentPage === "data-export" && <DataExportPage permissions={permissions} />}
            {authorized && currentPage === "vouchers" && <VouchersPage initialKind={voucherKind} createRequestToken={createToken("vouchers")} />}
            {authorized && currentPage === "payment-schedules" && <PaymentSchedulesPage createRequestToken={createToken("payment-schedules")} />}
          </main>
        </div>
      </div>
    </PermissionProvider>
  );
}