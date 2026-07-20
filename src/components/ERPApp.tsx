import { useState } from "react";
import { useQuery } from "convex/react";
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
import { Menu } from "lucide-react";

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
  | "audit-logs";

export function ERPApp() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const settings = useQuery(api.settings.get);

  const storeName = settings?.storeName ?? "تك ستور ERP";

  const navigate = (page: Page) => {
    setCurrentPage(page);
    setSidebarOpen(false);
  };

  return (
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
            <button
              onClick={() => navigate("new-invoice")}
              className="btn-primary hidden sm:flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              فاتورة جديدة
            </button>
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
            {currentPage === "dashboard"   && <Dashboard onNavigate={navigate} />}
            {currentPage === "products"    && <ProductsPage />}
            {currentPage === "customers"   && <CustomersPage />}
            {currentPage === "invoices"    && <InvoicesPage onNavigate={navigate} />}
            {currentPage === "new-invoice" && <NewInvoicePage onNavigate={navigate} />}
            {currentPage === "repairs"     && <RepairsPage />}
            {currentPage === "expenses"    && <ExpensesPage />}
            {currentPage === "suppliers"   && <SuppliersPage />}
            {currentPage === "orders"      && <OrdersPage />}
            {currentPage === "deliveries"  && <DeliveriesPage />}
            {currentPage === "shipments"   && <ShipmentsPage />}
            {currentPage === "branches"    && <BranchesPage />}
            {currentPage === "employees"   && <EmployeesPage />}
            {currentPage === "crm"         && <CRMPage />}
            {currentPage === "reports"     && <ReportsPage />}
            {currentPage === "settings"    && <SettingsPage />}
            {currentPage === "audit-logs"  && <AuditLogsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
