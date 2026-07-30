import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "./Dashboard";
import { ProductsPage } from "./ProductsPage";
import { CustomersPage } from "./CustomersPage";
import { InvoicesPage } from "./InvoicesPage";
import { RepairsPage } from "./RepairsPage";
import { ExpensesPage } from "./ExpensesPage";
import { SuppliersPage } from "./SuppliersPage";
import { ReportsPage } from "./ReportsPage";
import { SettingsPage } from "./SettingsPage";
import { NewInvoicePage } from "./NewInvoicePage";
import { OrdersPage } from "./OrdersPage";
import { ShipmentsPage } from "./ShipmentsPage";
import { BranchesPage } from "./BranchesPage";
import { EmployeesPage } from "./EmployeesPage";
import { CRMPage } from "./CRMPage";
import { DeliveriesPage } from "./DeliveriesPage";
import { AuditLogsPage } from "./AuditLogsPage";
import { TreasuryPage } from "./TreasuryPage";
import { SupplierPaymentsPage } from "./SupplierPaymentsPage";
import { PurchaseReturnsPage } from "./PurchaseReturnsPage";
import { CustomerLedgerPage } from "./CustomerLedgerPage";
import { GeneralLedgerPage } from "./GeneralLedgerPage";
import { Menu } from "lucide-react";
import { ShieldX } from "lucide-react";
import type { Permission } from "../../convex/lib/permissions";
import { PermissionProvider } from "../lib/access";
import type { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

export type Page =
  | "dashboard"
  | "products"
  | "customers"
  | "invoices"
  | "new-invoice"
  | "repairs"
  | "expenses"
  | "suppliers"
  | "orders"
  | "deliveries"
  | "shipments"
  | "branches"
  | "employees"
  | "crm"
  | "reports"
  | "settings"
  | "audit-logs"
  | "treasury"
  | "supplier-payments"
  | "purchase-returns"
  | "customer-ledger"
  | "general-ledger";

const PAGE_PERMISSIONS: Partial<Record<Page, Permission>> = {
  products: "view_products",
  customers: "view_customers",
  invoices: "view_invoices",
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
  treasury: "view_finance",
  "supplier-payments": "view_supplier_ledger",
  "purchase-returns": "view_purchase_returns",
  "customer-ledger": "view_customer_ledger",
  "general-ledger": "view_general_ledger",
};

const PAGE_MODULES: Partial<Record<Page, string>> = {
  invoices: "invoices",
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

export function ERPApp() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customerLedgerTarget, setCustomerLedgerTarget] = useState<{
    customerId: Id<"customers">;
    branchId: Id<"branches">;
  } | null>(null);
  const settings = useQuery(api.settings.getPublic);
  const me = useQuery(api.employees.me);

  const storeName = settings?.storeName ?? "تك ستور ERP";
  const permissions = me?.permissions ?? [];
  const can = (permission: Permission) => permissions.includes(permission);
  const modules = (settings?.modules ?? {}) as Record<string, boolean | undefined>;
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
      <div className="h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-500">جاري تحميل صلاحيات الحساب...</p>
      </div>
    );
  }

  const authorized = canAccessPage(currentPage);

  return (
    <PermissionProvider permissions={permissions}>
    <div className="flex h-screen bg-slate-50 overflow-hidden" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 right-0 z-30 w-64 transform transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
      `}>
        <Sidebar
          currentPage={currentPage}
          onNavigate={navigate}
          storeName={storeName}
          permissions={permissions}
          userName={me.name}
          role={me.role}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-4 lg:px-6 h-16 flex items-center justify-between flex-shrink-0 shadow-sm">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-800">{storeName}</p>
              <p className="text-xs text-slate-500">نظام إدارة الإلكترونيات</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canSelectWorkingBranch && (
              <select
                className={`hidden md:block text-xs rounded-lg border px-2.5 py-2 bg-white ${me.branchId ? "border-slate-200 text-slate-600" : "border-amber-300 text-amber-700"}`}
                value={me.branchId ?? ""}
                onChange={(event) => void handleWorkingBranchChange(event.target.value)}
                aria-label="فرع العمل الحالي"
              >
                <option value="" disabled>اختر فرع العمل</option>
                {(branches ?? []).filter((branch) => branch.isActive).map((branch) => (
                  <option key={branch._id} value={branch._id}>{branch.name}</option>
                ))}
              </select>
            )}
            {can("create_invoices") && isModuleEnabled("invoices") && <button
              onClick={() => navigate("new-invoice")}
              className="btn-primary hidden sm:flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              فاتورة جديدة
            </button>}
            <div className="w-px h-6 bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">م</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="animate-fade-in-up">
            {!authorized && (
              <div className="min-h-[70vh] flex items-center justify-center p-6">
                <div className="text-center">
                  <ShieldX className="w-14 h-14 text-red-400 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-slate-800">غير مصرح بالوصول</h2>
                  <p className="text-sm text-slate-500 mt-2">لا يملك حسابك الصلاحية المطلوبة لفتح هذه الصفحة.</p>
                </div>
              </div>
            )}
            {authorized && currentPage === "dashboard"   && <Dashboard onNavigate={navigate} permissions={permissions} modules={modules} />}
            {authorized && currentPage === "products"    && <ProductsPage />}
            {authorized && currentPage === "customers"   && <CustomersPage onOpenLedger={openCustomerLedger} />}
            {authorized && currentPage === "invoices"    && <InvoicesPage onNavigate={navigate} />}
            {authorized && currentPage === "new-invoice" && <NewInvoicePage onNavigate={navigate} />}
            {authorized && currentPage === "repairs"     && <RepairsPage />}
            {authorized && currentPage === "expenses"    && <ExpensesPage />}
            {authorized && currentPage === "suppliers"   && <SuppliersPage />}
            {authorized && currentPage === "orders"      && <OrdersPage />}
            {authorized && currentPage === "deliveries"  && <DeliveriesPage />}
            {authorized && currentPage === "shipments"   && <ShipmentsPage />}
            {authorized && currentPage === "branches"    && <BranchesPage />}
            {authorized && currentPage === "employees"   && <EmployeesPage />}
            {authorized && currentPage === "crm"         && <CRMPage />}
            {authorized && currentPage === "reports"     && <ReportsPage />}
            {authorized && currentPage === "settings"    && <SettingsPage />}
            {authorized && currentPage === "audit-logs"  && <AuditLogsPage />}
            {authorized && currentPage === "treasury"    && <TreasuryPage />}
            {authorized && currentPage === "supplier-payments" && <SupplierPaymentsPage />}
            {authorized && currentPage === "purchase-returns" && <PurchaseReturnsPage />}
            {authorized && currentPage === "customer-ledger" && <CustomerLedgerPage initialCustomerId={customerLedgerTarget?.customerId} initialBranchId={customerLedgerTarget?.branchId} />}
            {authorized && currentPage === "general-ledger" && <GeneralLedgerPage />}
          </div>
        </main>
      </div>
    </div>
    </PermissionProvider>
  );
}
