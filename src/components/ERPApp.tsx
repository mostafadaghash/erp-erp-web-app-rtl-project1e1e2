import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Menu, Plus, ShieldX } from "lucide-react";
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
import { CustomerLedgerPage } from "./CustomerLedgerPage";
import { CustomersPage } from "./CustomersPage";
import { Dashboard } from "./Dashboard";
import { DataExportPage } from "./DataExportPage";
import { DeliveriesPage } from "./DeliveriesPage";
import { EmployeesPage } from "./EmployeesPage";
import { ExpensesPage } from "./ExpensesPage";
import { GeneralLedgerPage } from "./GeneralLedgerPage";
import { InvoicesPage } from "./InvoicesPage";
import { NewInvoicePage } from "./NewInvoicePage";
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

export type Page =
  | "dashboard" | "products" | "customers" | "invoices" | "sales-returns"
  | "new-invoice" | "repairs" | "expenses" | "suppliers" | "orders"
  | "deliveries" | "shipments" | "branches" | "employees" | "crm"
  | "reports" | "settings" | "audit-logs" | "accounts-home" | "treasury"
  | "supplier-payments" | "purchase-returns" | "customer-ledger"
  | "general-ledger" | "data-export";

const PAGE_PERMISSIONS: Partial<Record<Page, Permission>> = {
  products: "view_products",
  customers: "view_customers",
  invoices: "view_invoices",
  "sales-returns": "view_sales_returns",
  "new-invoice": "create_invoices",
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
};

const PAGE_MODULES: Partial<Record<Page, string>> = {
  invoices: "invoices",
  "sales-returns": "invoices",
  "new-invoice": "invoices",
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
  dashboard: { group: "الرئيسية", title: "الرئيسية" },
  products: { group: "المخزون", title: "الأصناف والمخزون" },
  customers: { group: "المبيعات", title: "العملاء" },
  invoices: { group: "المبيعات", title: "المبيعات" },
  "sales-returns": { group: "المبيعات", title: "مرتجعات المبيعات" },
  "new-invoice": { group: "المبيعات", title: "فاتورة بيع جديدة" },
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
};

type CreateTarget =
  | "new-invoice"
  | "orders"
  | "customers"
  | "products"
  | "shipments"
  | "deliveries"
  | "expenses"
  | "repairs";

const CREATE_ACTIONS: Array<{ page: CreateTarget; label: string; permission: Permission }> = [
  { page: "new-invoice", label: "فاتورة بيع", permission: "create_invoices" },
  { page: "orders", label: "أمر بيع", permission: "create_orders" },
  { page: "customers", label: "عميل جديد", permission: "create_customers" },
  { page: "products", label: "صنف جديد", permission: "create_products" },
  { page: "shipments", label: "عملية شراء", permission: "create_shipments" },
  { page: "deliveries", label: "شحنة جديدة", permission: "create_deliveries" },
  { page: "expenses", label: "مصروف جديد", permission: "create_expenses" },
  { page: "repairs", label: "أمر صيانة", permission: "create_repairs" },
];

export function ERPApp() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
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
    return isModuleEnabled(page) && (!required || can(required));
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

  const requestCreate = (page: CreateTarget) => {
    if (!canAccessPage(page)) return;
    if (page === "new-invoice") return navigate(page);
    setCurrentPage(page);
    setCreateRequest({ page, token: Date.now() });
    setQuickMenuOpen(false);
    setSidebarOpen(false);
  };

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
          <header className="erp-contextbar flex flex-shrink-0 items-center justify-between gap-3 px-4 lg:px-7">
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

            <div className="flex items-center gap-2.5">
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
                          key={action.page}
                          type="button"
                          data-testid={`quick-action-${action.page}`}
                          onClick={() => requestCreate(action.page)}
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
            {authorized && currentPage === "dashboard" && <Dashboard onNavigate={navigate} onRequestCreate={requestCreate} permissions={permissions} modules={modules} />}
            {authorized && currentPage === "accounts-home" && <AccountsHubPage onNavigate={navigate} permissions={permissions} />}
            {authorized && currentPage === "products" && <ProductsPage createRequestToken={createToken("products")} />}
            {authorized && currentPage === "customers" && <CustomersPage onOpenLedger={openCustomerLedger} createRequestToken={createToken("customers")} />}
            {authorized && currentPage === "invoices" && <InvoicesPage onNavigate={navigate} view="sales" />}
            {authorized && currentPage === "sales-returns" && <InvoicesPage onNavigate={navigate} view="returns" />}
            {authorized && currentPage === "new-invoice" && <NewInvoicePage onNavigate={navigate} />}
            {authorized && currentPage === "repairs" && <RepairsPage createRequestToken={createToken("repairs")} />}
            {authorized && currentPage === "expenses" && <ExpensesPage createRequestToken={createToken("expenses")} />}
            {authorized && currentPage === "suppliers" && <SuppliersPage />}
            {authorized && currentPage === "orders" && <OrdersPage createRequestToken={createToken("orders")} />}
            {authorized && currentPage === "deliveries" && <DeliveriesPage createRequestToken={createToken("deliveries")} />}
            {authorized && currentPage === "shipments" && <ShipmentsPage createRequestToken={createToken("shipments")} />}
            {authorized && currentPage === "branches" && <BranchesPage />}
            {authorized && currentPage === "employees" && <EmployeesPage />}
            {authorized && currentPage === "crm" && <CRMPage />}
            {authorized && currentPage === "reports" && <ReportsPage />}
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
          </main>
        </div>
      </div>
    </PermissionProvider>
  );
}
