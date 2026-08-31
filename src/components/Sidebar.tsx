import { useEffect, useRef, useState } from "react";
import type { Page } from "./ERPApp";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  CalendarClock,
  FileText,
  Home,
  Landmark,
  Package,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserCog,
  UserPlus,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { Permission } from "../../convex/lib/permissions";
import { SignOutButton } from "../SignOutButton";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/catalog";
import { BrandMark } from "./BrandMark";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onClose: () => void;
  permissions: Permission[];
  userName: string;
  role: string;
  modules: Record<string, boolean | undefined>;
  brand: {
    storeName: string;
    shortName: string;
    tagline: string;
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
  };
}

interface NavItem {
  id: Page;
  labelKey: TranslationKey;
  icon: React.ElementType;
  moduleKey?: string;
  permission?: Permission;
  roleFallback?: string[];
}

interface NavGroup {
  key: string;
  labelKey: TranslationKey;
  icon: React.ElementType;
  items: NavItem[];
}

const HOME_ITEM: NavItem = { id: "dashboard", labelKey: "nav.dashboard", icon: Home };
const FOLLOW_UP_ROLES = ["admin", "manager", "sales", "customer_service", "technician", "shipping"];
const PAGE_SESSION_KEY = "business-tech-erp.current-page";
const PAGE_IDS = new Set<Page>([
  "dashboard",
  "products",
  "inventory",
  "customers",
  "new-customer",
  "follow-ups",
  "invoices",
  "sales-returns",
  "quotes",
  "credit-invoices",
  "new-invoice",
  "new-purchase-invoice",
  "repairs",
  "expenses",
  "suppliers",
  "orders",
  "deliveries",
  "shipments",
  "branches",
  "employees",
  "crm",
  "reports",
  "settings",
  "audit-logs",
  "accounts-home",
  "treasury",
  "supplier-payments",
  "purchase-returns",
  "customer-ledger",
  "general-ledger",
  "data-export",
  "vouchers",
  "payment-schedules",
]);

const isPage = (value: string | null): value is Page =>
  value !== null && PAGE_IDS.has(value as Page);

const NAV_GROUPS: NavGroup[] = [
  {
    key: "sales",
    labelKey: "nav.sales",
    icon: ShoppingBag,
    items: [
      { id: "new-invoice", labelKey: "nav.newSalesInvoice", icon: ReceiptText, moduleKey: "invoices", permission: "create_invoices" },
      { id: "invoices", labelKey: "nav.salesInvoices", icon: ReceiptText, moduleKey: "invoices", permission: "view_invoices" },
      { id: "sales-returns", labelKey: "nav.salesReturns", icon: RotateCcw, moduleKey: "invoices", permission: "view_sales_returns" },
      { id: "quotes", labelKey: "nav.quotes", icon: FileText, permission: "view_quotes" },
      { id: "orders", labelKey: "nav.salesOrders", icon: ClipboardList, moduleKey: "orders", permission: "view_orders" },
    ],
  },
  {
    key: "customers",
    labelKey: "nav.customers",
    icon: Users,
    items: [
      { id: "new-customer", labelKey: "nav.addCustomer", icon: UserPlus, permission: "create_customers" },
      { id: "customers", labelKey: "nav.customerList", icon: Users, permission: "view_customers" },
      { id: "follow-ups", labelKey: "nav.followUps", icon: CalendarClock, permission: "view_follow_ups", roleFallback: FOLLOW_UP_ROLES },
    ],
  },
  {
    key: "purchases",
    labelKey: "nav.purchases",
    icon: ShoppingBag,
    items: [
      { id: "new-purchase-invoice", labelKey: "nav.newPurchaseInvoice", icon: ReceiptText, moduleKey: "shipments", permission: "create_shipments" },
      { id: "shipments", labelKey: "nav.purchaseInvoices", icon: ShoppingBag, moduleKey: "shipments", permission: "view_shipments" },
      { id: "purchase-returns", labelKey: "nav.purchaseReturns", icon: RotateCcw, permission: "view_purchase_returns" },
      { id: "suppliers", labelKey: "nav.suppliers", icon: Truck, moduleKey: "suppliers", permission: "view_suppliers" },
    ],
  },
  {
    key: "inventory",
    labelKey: "nav.inventory",
    icon: Boxes,
    items: [{ id: "inventory", labelKey: "nav.inventoryManagement", icon: Package, permission: "view_products" }],
  },
  {
    key: "service",
    labelKey: "nav.repairs",
    icon: Wrench,
    items: [{ id: "repairs", labelKey: "nav.repairOrders", icon: Wrench, moduleKey: "repairs", permission: "view_repairs" }],
  },
  {
    key: "shipping",
    labelKey: "nav.shipping",
    icon: Truck,
    items: [{ id: "deliveries", labelKey: "nav.shippingSettlements", icon: Truck, moduleKey: "deliveries", permission: "view_deliveries" }],
  },
  {
    key: "accounting",
    labelKey: "nav.accounts",
    icon: Landmark,
    items: [
      { id: "accounts-home", labelKey: "nav.overview", icon: Landmark, permission: "view_finance" },
      { id: "treasury", labelKey: "nav.treasury", icon: Landmark, permission: "view_finance" },
      { id: "vouchers", labelKey: "nav.vouchers", icon: ReceiptText, permission: "view_finance" },
      { id: "customer-ledger", labelKey: "nav.customerAccounts", icon: BookOpen, permission: "view_customer_ledger" },
      { id: "supplier-payments", labelKey: "nav.supplierAccounts", icon: Truck, permission: "view_supplier_ledger" },
      { id: "credit-invoices", labelKey: "nav.creditInvoices", icon: ClipboardList, permission: "view_invoices" },
      { id: "payment-schedules", labelKey: "nav.paymentSchedules", icon: CalendarClock, permission: "view_finance" },
      { id: "expenses", labelKey: "nav.expenses", icon: CircleDollarSign, moduleKey: "expenses", permission: "view_expenses" },
    ],
  },
  {
    key: "reports",
    labelKey: "nav.reports",
    icon: BarChart3,
    items: [{ id: "reports", labelKey: "nav.reportCenter", icon: BarChart3, moduleKey: "reports", permission: "view_reports" }],
  },
  {
    key: "administration",
    labelKey: "nav.settings",
    icon: Settings,
    items: [
      { id: "branches", labelKey: "nav.branches", icon: Building2, moduleKey: "branches", permission: "view_branches" },
      { id: "employees", labelKey: "nav.usersPermissions", icon: UserCog, moduleKey: "employees", permission: "view_employees" },
      { id: "audit-logs", labelKey: "nav.auditLog", icon: ShieldCheck, permission: "view_audit_logs" },
      { id: "settings", labelKey: "nav.systemSettings", icon: Settings, permission: "manage_settings" },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير النظام",
  manager: "مدير",
  accountant: "محاسب",
  sales: "مسؤول مبيعات",
  customer_service: "خدمة العملاء",
  technician: "فني صيانة",
  shipping: "مسؤول الشحن",
  viewer: "مشاهدة فقط",
};

export function Sidebar({
  currentPage,
  onNavigate,
  onClose,
  permissions,
  userName,
  role,
  modules,
  brand,
}: SidebarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const restoreAttemptedRef = useRef(false);
  const { t } = useI18n();

  useEffect(() => {
    try {
      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
        const storedPage = window.sessionStorage.getItem(PAGE_SESSION_KEY);
        if (isPage(storedPage) && storedPage !== currentPage) {
          window.sessionStorage.removeItem(PAGE_SESSION_KEY);
          onNavigate(storedPage);
          return;
        }
      }
      window.sessionStorage.setItem(PAGE_SESSION_KEY, currentPage);
    } catch {
      // Navigation must remain usable even when browser storage is unavailable.
    }
  }, [currentPage, onNavigate]);

  useEffect(() => {
    if (!openGroup) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const openSection = document.querySelector<HTMLElement>(
        `[data-nav-group-section="${openGroup}"]`,
      );
      if (event.target instanceof Node && !openSection?.contains(event.target)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [openGroup]);

  const isModuleEnabled = (moduleKey?: string) =>
    !moduleKey || modules[moduleKey] !== false;

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        isModuleEnabled(item.moduleKey) &&
        (
          !item.permission ||
          permissions.includes(item.permission) ||
          Boolean(item.roleFallback?.includes(role))
        ),
    ),
  })).filter((group) => group.items.length > 0);

  const navigateTo = (page: Page) => {
    setOpenGroup(null);
    onNavigate(page);
  };

  return (
    <aside className="erp-navigation h-full w-full" aria-label={t("nav.main")}>
      <div className="erp-navigation-inner">
        <div className="erp-nav-brand">
          <BrandMark
            name={brand.storeName}
            logoUrl={brand.logoUrl}
            primaryColor={brand.primaryColor}
            secondaryColor={brand.secondaryColor}
            size="md"
          />
          <div className="min-w-0" data-i18n-skip>
            <p className="max-w-36 truncate text-sm font-black text-slate-900">{brand.shortName}</p>
            <p className="mt-0.5 hidden max-w-40 truncate text-[10px] text-slate-400 xl:block">{brand.tagline}</p>
          </div>
          <button
            onClick={onClose}
            className="mr-auto rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden"
            aria-label={`${t("common.close")} ${t("nav.main")}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label={t("nav.main")} className="erp-nav-groups">
          <button
            type="button"
            data-testid="nav-dashboard"
            onClick={() => navigateTo(HOME_ITEM.id)}
            aria-current={currentPage === HOME_ITEM.id ? "page" : undefined}
            className={`erp-nav-home-button ${currentPage === HOME_ITEM.id ? "active" : ""}`}
          >
            <Home className="h-4 w-4" />
            <span>{t(HOME_ITEM.labelKey)}</span>
          </button>

          {groups.map((group) => {
            const hasActive = group.items.some((item) => item.id === currentPage);
            const isOpen = openGroup === group.key;
            const GroupIcon = group.icon;

            return (
              <section
                key={group.key}
                className="erp-nav-section"
                data-nav-group-section={group.key}
              >
                <button
                  type="button"
                  data-testid={`nav-group-${group.key}`}
                  onClick={() => setOpenGroup((value) => (value === group.key ? null : group.key))}
                  className={`erp-nav-group-button ${hasActive ? "active" : ""}`}
                  aria-expanded={isOpen}
                  aria-label={t(group.labelKey)}
                >
                  <span className="flex items-center gap-2">
                    <GroupIcon className="h-4 w-4" />
                    {t(group.labelKey)}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="erp-nav-dropdown">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.id === currentPage;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`nav-${item.id}`}
                          onClick={() => navigateTo(item.id)}
                          aria-current={isActive ? "page" : undefined}
                          className={`erp-nav-item ${isActive ? "active" : ""}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{t(item.labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        <div className="erp-user-panel">
          <div className="mb-2 flex items-center gap-2 lg:mb-0">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black text-white"
              style={{ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }}
              data-user-content
            >
              {userName.trim().charAt(0) || "م"}
            </div>
            <div className="min-w-0">
              <p className="max-w-28 truncate text-xs font-black text-slate-800" data-user-content>{userName}</p>
              <p
                data-testid="current-user-role"
                data-user-role={role}
                className="mt-0.5 max-w-28 truncate text-[10px] text-slate-500"
              >
                {ROLE_LABELS[role] ?? role}
              </p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
