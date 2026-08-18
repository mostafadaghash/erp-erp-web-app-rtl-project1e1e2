import { useState } from "react";
import type { Page } from "./ERPApp";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  DatabaseBackup,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Target,
  Truck,
  UserCog,
  Users,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import type { Permission } from "../../convex/lib/permissions";
import { SignOutButton } from "../SignOutButton";
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
  label: string;
  icon: React.ElementType;
  moduleKey?: string;
  permission?: Permission;
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: "home",
    label: "الرئيسية",
    icon: LayoutDashboard,
    items: [{ id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard }],
  },
  {
    key: "sales",
    label: "المبيعات",
    icon: ShoppingBag,
    items: [
      { id: "invoices", label: "المبيعات", icon: ReceiptText, moduleKey: "invoices", permission: "view_invoices" },
      { id: "sales-returns", label: "مرتجعات المبيعات", icon: RotateCcw, moduleKey: "invoices", permission: "view_sales_returns" },
      { id: "orders", label: "أوامر البيع", icon: ClipboardList, moduleKey: "orders", permission: "view_orders" },
      { id: "customers", label: "العملاء", icon: Users, permission: "view_customers" },
      { id: "crm", label: "إدارة علاقات العملاء", icon: Target, moduleKey: "crm", permission: "view_leads" },
    ],
  },
  {
    key: "purchases",
    label: "المشتريات",
    icon: ShoppingBag,
    items: [
      { id: "shipments", label: "المشتريات", icon: ShoppingBag, moduleKey: "shipments", permission: "view_shipments" },
      { id: "purchase-returns", label: "مرتجعات المشتريات", icon: RotateCcw, permission: "view_purchase_returns" },
      { id: "suppliers", label: "الموردون", icon: Truck, moduleKey: "suppliers", permission: "view_suppliers" },
    ],
  },
  {
    key: "inventory",
    label: "المخزون",
    icon: Boxes,
    items: [{ id: "products", label: "الأصناف", icon: Package, permission: "view_products" }],
  },
  {
    key: "shipping",
    label: "الشحن",
    icon: Truck,
    items: [{ id: "deliveries", label: "عمليات الشحن", icon: Truck, moduleKey: "deliveries", permission: "view_deliveries" }],
  },
  {
    key: "service",
    label: "الصيانة",
    icon: Wrench,
    items: [{ id: "repairs", label: "أوامر الصيانة", icon: Wrench, moduleKey: "repairs", permission: "view_repairs" }],
  },
  {
    key: "accounting",
    label: "الحسابات",
    icon: Landmark,
    items: [
      { id: "treasury", label: "الخزائن والبنوك", icon: Landmark, permission: "view_finance" },
      { id: "customer-ledger", label: "حسابات العملاء", icon: BookOpen, permission: "view_customer_ledger" },
      { id: "supplier-payments", label: "حسابات الموردين", icon: WalletCards, permission: "view_supplier_ledger" },
      { id: "expenses", label: "المصروفات", icon: CircleDollarSign, moduleKey: "expenses", permission: "view_expenses" },
      { id: "general-ledger", label: "الأستاذ العام", icon: BookOpen, permission: "view_general_ledger" },
    ],
  },
  {
    key: "reports",
    label: "التقارير",
    icon: BarChart3,
    items: [{ id: "reports", label: "مركز التقارير", icon: BarChart3, moduleKey: "reports", permission: "view_reports" }],
  },
  {
    key: "administration",
    label: "الإدارة",
    icon: Settings,
    items: [
      { id: "branches", label: "الفروع", icon: Building2, moduleKey: "branches", permission: "view_branches" },
      { id: "employees", label: "المستخدمون والصلاحيات", icon: UserCog, moduleKey: "employees", permission: "view_employees" },
      { id: "audit-logs", label: "سجل المراجعة", icon: ShieldCheck, permission: "view_audit_logs" },
      { id: "data-export", label: "تصدير البيانات", icon: DatabaseBackup, permission: "export_data" },
      { id: "settings", label: "إعدادات النظام", icon: Settings, permission: "manage_settings" },
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isModuleEnabled = (moduleKey?: string) =>
    !moduleKey || modules[moduleKey] !== false;

  const groups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item =>
      isModuleEnabled(item.moduleKey) &&
      (!item.permission || permissions.includes(item.permission))),
  })).filter(group => group.items.length > 0);

  return (
    <aside className="erp-sidebar h-full flex flex-col" aria-label="القائمة الرئيسية">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <BrandMark
            name={brand.storeName}
            logoUrl={brand.logoUrl}
            primaryColor={brand.primaryColor}
            secondaryColor={brand.secondaryColor}
            size="md"
            inverse
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">{brand.shortName}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{brand.tagline}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="إغلاق القائمة الرئيسية"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav aria-label="القائمة الرئيسية" className="erp-sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
        {groups.map(group => {
          const isOpen = !collapsed[group.key];
          const hasActive = group.items.some(item => item.id === currentPage);
          const GroupIcon = group.icon;
          return (
            <section key={group.key} className="mb-1">
              <button
                type="button"
                data-testid={`nav-group-${group.key}`}
                onClick={() => setCollapsed(value => ({ ...value, [group.key]: !value[group.key] }))}
                className={`nav-group-button ${hasActive ? "active" : ""}`}
                aria-expanded={isOpen}
                aria-label={`قسم ${group.label}`}
              >
                <span className="flex items-center gap-2">
                  <GroupIcon className="h-3.5 w-3.5" />
                  {group.label}
                </span>
                {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {isOpen && (
                <div className="mt-1 space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`nav-${item.id}`}
                        onClick={() => onNavigate(item.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={`sidebar-item w-full ${isActive ? "active" : ""}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {isActive && <span className="mr-auto h-1.5 w-1.5 rounded-full bg-current" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
            style={{ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }}
          >
            {userName.trim().charAt(0) || "م"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">{userName}</p>
            <p
              data-testid="current-user-role"
              data-user-role={role}
              className="mt-0.5 truncate text-[11px] text-slate-400"
            >
              {ROLE_LABELS[role] ?? role}
            </p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
