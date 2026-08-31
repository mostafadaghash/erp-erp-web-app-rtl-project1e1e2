import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Bell, ChevronDown, Menu, Plus, ShieldX, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Permission } from "../../convex/lib/permissions";
import { PermissionProvider } from "../lib/access";
import { getBrand } from "../lib/branding";
import { useI18n } from "../i18n/I18nProvider";
import { workspaceMessage } from "../i18n/workspaceMessages";
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
import { WorkspaceTabs } from "../workspace/WorkspaceTabs";
import {
  WorkspaceRecordPage,
  workspaceRecordIdentity,
  type WorkspaceRecordTarget,
  type WorkspaceRecordType,
} from "../workspace/WorkspaceRecordPage";
import {
  activateOrAppend,
  closeTabsByIds,
  createWorkspaceTabId,
  entityIdentity,
  nextNumberedTitle,
  parsePersistedWorkspace,
  reportIdentity,
  serializableWorkspace,
  singletonIdentity,
  uniqueIdentity,
  type WorkspaceTab,
  type WorkspaceTabKind,
} from "../workspace/workspaceModel";

export type Page =
  | "dashboard" | "products" | "inventory" | "customers" | "new-customer" | "follow-ups" | "invoices" | "sales-returns" | "quotes" | "credit-invoices"
  | "new-invoice" | "new-purchase-invoice" | "repairs" | "expenses" | "suppliers" | "orders"
  | "deliveries" | "shipments" | "branches" | "employees" | "crm"
  | "reports" | "settings" | "audit-logs" | "accounts-home" | "treasury"
  | "supplier-payments" | "purchase-returns" | "customer-ledger"
  | "general-ledger" | "data-export" | "vouchers" | "payment-schedules" | "workspace-record";

const FOLLOW_UP_ROLE_FALLBACK = new Set(["admin", "manager", "sales", "customer_service", "technician", "shipping"]);
const PAGES_WITHOUT_GLOBAL_SEARCH = new Set<Page>(["branches", "employees", "settings"]);
const MULTI_INSTANCE_PAGES = new Set<Page>(["new-invoice", "new-purchase-invoice", "new-customer"]);
const WORKSPACE_STORAGE_PREFIX = "business-tech-erp.workspace.v1";
const LEGACY_PAGE_SESSION_KEY = "business-tech-erp.current-page";

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

const RECORD_PERMISSIONS: Record<WorkspaceRecordType, Permission> = {
  product: "view_products",
  customer: "view_customers",
  supplier: "view_suppliers",
  invoice: "view_invoices",
  order: "view_orders",
};

const RECORD_MODULE_PAGES: Record<WorkspaceRecordType, Page> = {
  product: "products",
  customer: "customers",
  supplier: "suppliers",
  invoice: "invoices",
  order: "orders",
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
  "workspace-record": { group: "مساحة العمل", title: "سجل" },
};

const REPORT_TITLES: Record<ReportKind, string> = {
  overview: "نظرة عامة",
  sales: "تقرير المبيعات",
  purchases: "تقرير المشتريات",
  profit: "الأرباح والخسائر",
  treasury: "تقرير الخزينة",
  inventory: "تقرير المخزون",
  customers: "تقرير العملاء",
  suppliers: "تقرير الموردين",
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

interface WorkspaceState {
  tabs: WorkspaceTab<Page>[];
  activeId: string;
}

function readWorkspaceRecordTarget(value: unknown): WorkspaceRecordTarget | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WorkspaceRecordTarget>;
  if (!["product", "customer", "supplier", "invoice", "order"].includes(candidate.type ?? "")) return null;
  if (typeof candidate.title !== "string" || typeof candidate.group !== "string") return null;
  if (candidate.id !== undefined && typeof candidate.id !== "string") return null;
  if (candidate.lookup !== undefined) {
    if (!candidate.lookup || typeof candidate.lookup !== "object") return null;
    if (!["sku", "phone", "invoiceNumber"].includes(candidate.lookup.kind)) return null;
    if (typeof candidate.lookup.value !== "string") return null;
    if (candidate.lookup.branchId !== undefined && typeof candidate.lookup.branchId !== "string") return null;
  }
  if (!candidate.id && !candidate.lookup) return null;
  return candidate as WorkspaceRecordTarget;
}

function makeInitialDashboard(): WorkspaceTab<Page> {
  const now = Date.now();
  return {
    id: createWorkspaceTabId("dashboard"),
    page: "dashboard",
    title: PAGE_META.dashboard.title,
    group: PAGE_META.dashboard.group,
    identityKey: singletonIdentity("dashboard"),
    kind: "singleton",
    dirty: false,
    restoreSafe: true,
    createdAt: now,
    lastActiveAt: now,
  };
}

export function ERPApp() {
  const initialDashboardRef = useRef<WorkspaceTab<Page> | null>(null);
  if (!initialDashboardRef.current) initialDashboardRef.current = makeInitialDashboard();
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => ({
    tabs: [initialDashboardRef.current!],
    activeId: initialDashboardRef.current!.id,
  }));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCloseIds, setPendingCloseIds] = useState<string[] | null>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const workspaceRestoredRef = useRef(false);
  const legacyStorageClearedRef = useRef(false);
  const { language } = useI18n();

  if (!legacyStorageClearedRef.current) {
    legacyStorageClearedRef.current = true;
    try {
      window.sessionStorage.removeItem(LEGACY_PAGE_SESSION_KEY);
    } catch {
      // The workspace does not depend on browser storage being available.
    }
  }

  const settings = useQuery(api.settings.getPublic);
  const me = useQuery(api.employees.me);
  const brand = getBrand(settings);
  const permissions = me?.permissions ?? [];
  const can = (permission: Permission) => permissions.includes(permission);
  const modules = (settings?.modules ?? {}) as Record<string, boolean | undefined>;
  const lowStock = useQuery(api.products.list, permissions.includes("view_products") ? { lowStock: true } : "skip") ?? [];

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !quickMenuRef.current?.contains(event.target)) {
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

  const canAccessWorkspaceRecord = (target: WorkspaceRecordTarget) =>
    can(RECORD_PERMISSIONS[target.type]) && isModuleEnabled(RECORD_MODULE_PAGES[target.type]);

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

  useEffect(() => {
    if (!me || workspaceRestoredRef.current) return;
    workspaceRestoredRef.current = true;
    const storageKey = `${WORKSPACE_STORAGE_PREFIX}:${String(me._id)}`;
    try {
      const restored = parsePersistedWorkspace<Page>(window.localStorage.getItem(storageKey));
      if (!restored || restored.tabs.length === 0) return;
      const now = Date.now();
      const tabs = restored.tabs
        .filter((tab) => {
          if (!(tab.page in PAGE_META) || !canAccessPage(tab.page)) return false;
          if (tab.page !== "workspace-record") return true;
          const target = readWorkspaceRecordTarget(tab.payload?.recordTarget);
          return Boolean(target && canAccessWorkspaceRecord(target));
        })
        .map((tab, index): WorkspaceTab<Page> => ({
          ...tab,
          id: createWorkspaceTabId("restored"),
          dirty: false,
          restoreSafe: true,
          createdAt: now + index,
          lastActiveAt: now + index,
        }));
      if (tabs.length === 0) return;
      const active = tabs.find((tab) => tab.identityKey === restored.activeIdentityKey) ?? tabs[0];
      setWorkspace({ tabs, activeId: active.id });
    } catch {
      // Ignore invalid or unavailable local storage and keep the default dashboard.
    }
  }, [me]);

  useEffect(() => {
    if (!me || !workspaceRestoredRef.current) return;
    const storageKey = `${WORKSPACE_STORAGE_PREFIX}:${String(me._id)}`;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(serializableWorkspace(workspace.tabs, workspace.activeId)),
      );
    } catch {
      // Workspace persistence is best-effort only.
    }
  }, [me, workspace]);

  useEffect(() => {
    if (!workspace.tabs.some((tab) => tab.dirty)) return;
    const protectRefresh = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectRefresh);
    return () => window.removeEventListener("beforeunload", protectRefresh);
  }, [workspace.tabs]);

  const openWorkspaceTab = ({
    page,
    kind = "singleton",
    identityKey,
    title,
    group,
    entityId,
    payload,
    restoreSafe,
  }: {
    page: Page;
    kind?: WorkspaceTabKind;
    identityKey?: string;
    title?: string;
    group?: string;
    entityId?: string;
    payload?: Record<string, unknown>;
    restoreSafe?: boolean;
  }) => {
    if (!canAccessPage(page)) return;
    setWorkspace((current) => {
      const meta = PAGE_META[page];
      const resolvedKind = kind;
      const baseTitle = title ?? meta.title;
      const resolvedTitle = resolvedKind === "new" ? nextNumberedTitle(current.tabs, baseTitle) : baseTitle;
      const resolvedIdentity = identityKey ?? (resolvedKind === "new" ? uniqueIdentity(page) : singletonIdentity(page));
      const now = Date.now();
      const incoming: WorkspaceTab<Page> = {
        id: createWorkspaceTabId(page),
        page,
        title: resolvedTitle,
        group: group ?? meta.group,
        identityKey: resolvedIdentity,
        kind: resolvedKind,
        dirty: false,
        restoreSafe: restoreSafe ?? resolvedKind !== "new",
        createdAt: now,
        lastActiveAt: now,
        entityId,
        payload,
      };
      const result = activateOrAppend(current.tabs, incoming);
      return { tabs: result.tabs, activeId: result.activeId };
    });
    setQuickMenuOpen(false);
    setSidebarOpen(false);
  };

  const openWorkspaceRecord = (target: WorkspaceRecordTarget) => {
    if (!canAccessWorkspaceRecord(target)) return;
    const recordKey = workspaceRecordIdentity(target);
    openWorkspaceTab({
      page: "workspace-record",
      kind: "entity",
      identityKey: entityIdentity("workspace-record", recordKey),
      title: target.title,
      group: target.group,
      entityId: target.id ?? recordKey,
      payload: { recordTarget: target },
      restoreSafe: true,
    });
  };

  const navigate = (page: Page) => {
    if (MULTI_INSTANCE_PAGES.has(page)) {
      openWorkspaceTab({ page, kind: "new", restoreSafe: false });
      return;
    }
    openWorkspaceTab({ page, kind: "singleton" });
  };

  const requestCreate = (
    page: CreateTarget,
    nextVoucherKind?: "receipt" | "disbursement",
    title?: string,
  ) => {
    if (page === "customers") {
      openWorkspaceTab({ page: "new-customer", kind: "new", title, restoreSafe: false });
      return;
    }
    if (!canAccessPage(page)) return;
    openWorkspaceTab({
      page,
      kind: "new",
      title,
      restoreSafe: false,
      payload: {
        createRequestToken: Date.now(),
        ...(nextVoucherKind ? { voucherKind: nextVoucherKind } : {}),
      },
    });
  };

  const openReport = (report: ReportKind) => {
    openWorkspaceTab({
      page: "reports",
      kind: "report",
      identityKey: reportIdentity("reports", report),
      title: REPORT_TITLES[report],
      payload: { reportTarget: report },
      restoreSafe: true,
    });
  };

  const openCustomerLedger = (
    customerId: Id<"customers">,
    branchId: Id<"branches">,
  ) => {
    if (!canAccessPage("customer-ledger")) return;
    openWorkspaceTab({
      page: "customer-ledger",
      kind: "entity",
      identityKey: entityIdentity("customer-ledger", String(customerId), String(branchId)),
      title: PAGE_META["customer-ledger"].title,
      entityId: String(customerId),
      payload: { customerId: String(customerId), branchId: String(branchId) },
      restoreSafe: true,
    });
  };

  const activateTab = (tabId: string) => {
    setWorkspace((current) => {
      if (!current.tabs.some((tab) => tab.id === tabId)) return current;
      const now = Date.now();
      return {
        tabs: current.tabs.map((tab) => tab.id === tabId ? { ...tab, lastActiveAt: now } : tab),
        activeId: tabId,
      };
    });
    setSidebarOpen(false);
    setQuickMenuOpen(false);
  };

  const markTabDirty = (tabId: string, dirty: boolean) => {
    setWorkspace((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === tabId && tab.dirty !== dirty ? { ...tab, dirty } : tab),
    }));
  };

  const performClose = (tabIds: string[]) => {
    const ids = new Set(tabIds);
    setWorkspace((current) => {
      const result = closeTabsByIds(current.tabs, current.activeId, ids);
      if (result.tabs.length > 0 && result.activeId) {
        return { tabs: result.tabs, activeId: result.activeId };
      }
      const dashboard = makeInitialDashboard();
      return { tabs: [dashboard], activeId: dashboard.id };
    });
    setPendingCloseIds(null);
  };

  const requestClose = (tabIds: string[]) => {
    const existingIds = [...new Set(tabIds)].filter((id) => workspace.tabs.some((tab) => tab.id === id));
    if (existingIds.length === 0) return;
    if (workspace.tabs.some((tab) => existingIds.includes(tab.id) && tab.dirty)) {
      setPendingCloseIds(existingIds);
      return;
    }
    performClose(existingIds);
  };

  const handleWorkspaceRecordClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const invoiceRow = target.closest<HTMLElement>('tr[data-testid="invoice-row"]');
    if (invoiceRow) {
      const interactive = target.closest("button, a, input, select, textarea");
      const explicitOpen = target.closest('[data-testid="invoice-open"], [data-testid="invoice-open-number"]');
      if (interactive && !explicitOpen) return;
      const invoiceNumber = invoiceRow.dataset.invoiceNumber;
      if (!invoiceNumber) return;
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceRecord({
        type: "invoice",
        title: `فاتورة ${invoiceNumber}`,
        group: "المبيعات",
        lookup: { kind: "invoiceNumber", value: invoiceNumber },
      });
      return;
    }

    const customerRow = target.closest<HTMLElement>('tr[data-testid="customer-card"]');
    if (customerRow) {
      const interactive = target.closest<HTMLElement>("button, a, input, select, textarea");
      if (interactive && interactive.textContent?.trim() !== "بطاقة") return;
      const customerName = customerRow.dataset.customerName?.trim();
      const phone = customerRow.querySelector("td:nth-child(2)")?.textContent?.trim();
      if (!customerName || !phone) return;
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceRecord({
        type: "customer",
        title: `العميل: ${customerName}`,
        group: "العملاء",
        lookup: { kind: "phone", value: phone },
      });
      return;
    }

    const productRow = target.closest<HTMLElement>('tr[data-testid="product-row"]');
    if (productRow) {
      if (target.closest("button, a, input, select, textarea")) return;
      const productName = productRow.dataset.productName?.trim();
      const sku = productRow.dataset.productSku?.trim();
      if (!productName || !sku) return;
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceRecord({
        type: "product",
        title: productName,
        group: "المخزون",
        lookup: {
          kind: "sku",
          value: sku,
          branchId: productRow.dataset.productBranchId || undefined,
        },
      });
    }
  };

  const handleWorkspaceRecordKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof HTMLElement)) return;
    const row = event.target.closest<HTMLElement>('tr[data-testid="invoice-row"], tr[data-testid="customer-card"]');
    if (!row || event.target !== row) return;
    const invoiceNumber = row.dataset.invoiceNumber;
    if (invoiceNumber) {
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceRecord({ type: "invoice", title: `فاتورة ${invoiceNumber}`, group: "المبيعات", lookup: { kind: "invoiceNumber", value: invoiceNumber } });
      return;
    }
    const customerName = row.dataset.customerName?.trim();
    const phone = row.querySelector("td:nth-child(2)")?.textContent?.trim();
    if (customerName && phone) {
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceRecord({ type: "customer", title: `العميل: ${customerName}`, group: "العملاء", lookup: { kind: "phone", value: phone } });
    }
  };

  if (me === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-500">جارٍ تجهيز مساحة العمل...</p>
      </div>
    );
  }

  const currentTab = workspace.tabs.find((tab) => tab.id === workspace.activeId) ?? workspace.tabs[0];
  const currentPage = currentTab?.page ?? "dashboard";
  const authorized = canAccessPage(currentPage);
  const pageMeta = PAGE_META[currentPage];
  const createActions = CREATE_ACTIONS.filter(
    (action) => can(action.permission) && isModuleEnabled(action.page),
  );
  const workspaceLabels = {
    openPages: workspaceMessage(language, "openPages"),
    searchOpenPages: workspaceMessage(language, "searchOpenPages"),
    close: workspaceMessage(language, "close"),
    closeOthers: workspaceMessage(language, "closeOthers"),
    closeRight: workspaceMessage(language, "closeRight"),
    closeLeft: workspaceMessage(language, "closeLeft"),
    closeAll: workspaceMessage(language, "closeAll"),
    unsaved: workspaceMessage(language, "unsaved"),
    activePage: workspaceMessage(language, "activePage"),
  };

  const renderTab = (tab: WorkspaceTab<Page>) => {
    const recordTarget = tab.page === "workspace-record" ? readWorkspaceRecordTarget(tab.payload?.recordTarget) : null;
    const tabAuthorized = canAccessPage(tab.page) && (tab.page !== "workspace-record" || Boolean(recordTarget && canAccessWorkspaceRecord(recordTarget)));
    const createToken = typeof tab.payload?.createRequestToken === "number" ? tab.payload.createRequestToken : undefined;
    const reportTarget = (tab.payload?.reportTarget as ReportKind | undefined) ?? "sales";
    const voucherKind = tab.payload?.voucherKind === "disbursement" ? "disbursement" : "receipt";
    const customerId = typeof tab.payload?.customerId === "string" ? tab.payload.customerId as Id<"customers"> : undefined;
    const branchId = typeof tab.payload?.branchId === "string" ? tab.payload.branchId as Id<"branches"> : undefined;
    const navigateFromNewTab = (page: Page) => {
      markTabDirty(tab.id, false);
      navigate(page);
    };

    return (
      <section
        key={tab.id}
        data-workspace-panel={tab.id}
        data-workspace-page={tab.page}
        aria-hidden={tab.id !== workspace.activeId}
        hidden={tab.id !== workspace.activeId}
        className="min-h-full"
        onChangeCapture={() => {
          if (tab.kind === "new" && !tab.dirty) markTabDirty(tab.id, true);
        }}
        onInputCapture={() => {
          if (tab.kind === "new" && !tab.dirty) markTabDirty(tab.id, true);
        }}
      >
        {!tabAuthorized && (
          <div className="flex min-h-[70vh] items-center justify-center p-6">
            <div className="text-center">
              <ShieldX className="mx-auto mb-4 h-14 w-14 text-red-400" />
              <h2 className="text-xl font-bold text-slate-800">غير مصرح بالوصول</h2>
              <p className="mt-2 text-sm text-slate-500">لا يملك حسابك الصلاحية المطلوبة لفتح هذه الصفحة.</p>
            </div>
          </div>
        )}
        {tabAuthorized && tab.page === "dashboard" && <Dashboard onOpenReport={openReport} permissions={permissions} />}
        {tabAuthorized && tab.page === "accounts-home" && <AccountsHubPage onNavigate={navigate} permissions={permissions} />}
        {tabAuthorized && tab.page === "products" && <ProductsPage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "inventory" && <InventoryWorkspacePage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "customers" && <CustomersPage onOpenLedger={openCustomerLedger} onCreateCustomer={() => navigate("new-customer")} createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "new-customer" && (
          <NewCustomerPage
            onClose={(reason) => {
              if (reason === "saved") {
                performClose([tab.id]);
                return;
              }
              requestClose([tab.id]);
            }}
            onSaved={() => markTabDirty(tab.id, false)}
          />
        )}
        {tabAuthorized && tab.page === "follow-ups" && <CustomerFollowUpsPage />}
        {tabAuthorized && tab.page === "invoices" && <InvoicesPage onNavigate={navigate} view="sales" />}
        {tabAuthorized && tab.page === "sales-returns" && <InvoicesPage onNavigate={navigate} view="returns" />}
        {tabAuthorized && tab.page === "credit-invoices" && <InvoicesPage onNavigate={navigate} view="sales" creditOnly />}
        {tabAuthorized && tab.page === "new-invoice" && <NewInvoicePage onNavigate={navigateFromNewTab} />}
        {tabAuthorized && tab.page === "new-purchase-invoice" && <NewPurchaseInvoicePage onNavigate={navigateFromNewTab} />}
        {tabAuthorized && tab.page === "quotes" && <QuotesPage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "repairs" && <RepairsPage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "expenses" && <ExpensesPage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "suppliers" && <SuppliersPage />}
        {tabAuthorized && tab.page === "orders" && <OrdersPage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "deliveries" && <DeliveriesPage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "shipments" && <ShipmentsPage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "branches" && <BranchesPage />}
        {tabAuthorized && tab.page === "employees" && <EmployeesPage />}
        {tabAuthorized && tab.page === "crm" && <CRMPage />}
        {tabAuthorized && tab.page === "reports" && <ReportsPage initialReport={reportTarget} />}
        {tabAuthorized && tab.page === "settings" && <SettingsPage />}
        {tabAuthorized && tab.page === "audit-logs" && <AuditLogsPage />}
        {tabAuthorized && tab.page === "treasury" && <TreasuryPage />}
        {tabAuthorized && tab.page === "supplier-payments" && <SupplierPaymentsPage />}
        {tabAuthorized && tab.page === "purchase-returns" && <PurchaseReturnsPage />}
        {tabAuthorized && tab.page === "customer-ledger" && (
          <CustomerLedgerPage initialCustomerId={customerId} initialBranchId={branchId} />
        )}
        {tabAuthorized && tab.page === "general-ledger" && <GeneralLedgerPage />}
        {tabAuthorized && tab.page === "data-export" && <DataExportPage permissions={permissions} />}
        {tabAuthorized && tab.page === "vouchers" && <VouchersPage initialKind={voucherKind} createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "payment-schedules" && <PaymentSchedulesPage createRequestToken={createToken} />}
        {tabAuthorized && tab.page === "workspace-record" && recordTarget && (
          <WorkspaceRecordPage target={recordTarget} onOpenRecord={openWorkspaceRecord} />
        )}
      </section>
    );
  };

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
                <p className="text-[11px] font-bold text-slate-400">{currentTab?.group ?? pageMeta.group}</p>
                <h1 className="truncate text-base font-black text-slate-900 lg:text-lg">{currentTab?.title ?? pageMeta.title}</h1>
              </div>
            </div>

            {!PAGES_WITHOUT_GLOBAL_SEARCH.has(currentPage) && <GlobalSearch onNavigate={navigate} onOpenRecord={openWorkspaceRecord} />}
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
                          onClick={() => requestCreate(action.page, action.voucherKind, action.label)}
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

          <WorkspaceTabs
            tabs={workspace.tabs}
            activeId={workspace.activeId}
            labels={workspaceLabels}
            onActivate={activateTab}
            onRequestClose={requestClose}
          />

          <main
            className="erp-workspace-main min-h-0 flex-1 overflow-y-auto"
            onClickCapture={handleWorkspaceRecordClick}
            onKeyDownCapture={handleWorkspaceRecordKeyDown}
          >
            {workspace.tabs.map(renderTab)}
          </main>
        </div>
      </div>

      {pendingCloseIds && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" role="presentation">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="workspace-unsaved-title">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 id="workspace-unsaved-title" className="text-base font-black text-slate-900">{workspaceMessage(language, "unsavedTitle")}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {pendingCloseIds.length === 1 ? workspaceMessage(language, "unsavedSingle") : workspaceMessage(language, "unsavedMultiple")}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPendingCloseIds(null)}>{workspaceMessage(language, "stay")}</button>
              <button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700" onClick={() => performClose(pendingCloseIds)}>{workspaceMessage(language, "closeWithoutSaving")}</button>
            </div>
          </div>
        </div>
      )}
    </PermissionProvider>
  );
}
