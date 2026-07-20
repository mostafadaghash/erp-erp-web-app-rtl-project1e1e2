import { SignOutButton } from "../SignOutButton";
import type { Page } from "./ERPApp";
import {
  LayoutDashboard, Package, Users, FileText, Wrench,
  DollarSign, Truck, BarChart3, Settings, X,
  ShoppingCart, Ship, Building2, UserCog, ChevronDown, ChevronUp,
  Target, Shield
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Permission } from "../../convex/lib/permissions";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  storeName: string;
  onClose: () => void;
  permissions: Permission[];
  userName: string;
  role: string;
}

interface NavItem {
  id: Page;
  label: string;
  icon: React.ElementType;
  moduleKey?: string; // if set, hidden when module is disabled
  permission?: Permission;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    label: "الرئيسية",
    items: [
      { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
    ],
  },
  {
    label: "المبيعات",
    items: [
      { id: "invoices",    label: "المبيعات والفواتير", icon: FileText,      moduleKey: "invoices", permission: "view_invoices" },
      { id: "orders",      label: "الأوردرات",           icon: ShoppingCart,  moduleKey: "orders", permission: "view_orders" },
      { id: "deliveries",  label: "التوصيلات",           icon: Truck,         moduleKey: "deliveries", permission: "view_deliveries" },
    ],
  },
  {
    label: "المخزون والموردين",
    items: [
      { id: "products",  label: "المنتجات والمخزون",  icon: Package, permission: "view_products" },
      { id: "shipments", label: "الشحنات الواردة",    icon: Ship,   moduleKey: "shipments", permission: "view_shipments" },
      { id: "suppliers", label: "الموردين",            icon: Truck,  moduleKey: "suppliers", permission: "view_suppliers" },
    ],
  },
  {
    label: "العملاء والخدمات",
    items: [
      { id: "customers", label: "العملاء",              icon: Users, permission: "view_customers" },
      { id: "repairs",   label: "الصيانة",              icon: Wrench,  moduleKey: "repairs", permission: "view_repairs" },
      { id: "crm",       label: "العملاء المحتملين",    icon: Target,  moduleKey: "crm", permission: "view_leads" },
    ],
  },
  {
    label: "المالية",
    items: [
      { id: "expenses", label: "المصروفات", icon: DollarSign, moduleKey: "expenses", permission: "view_expenses" },
      { id: "reports",  label: "التقارير",  icon: BarChart3,  moduleKey: "reports", permission: "view_reports" },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { id: "branches",   label: "الفروع",              icon: Building2, moduleKey: "branches", permission: "view_branches" },
      { id: "employees",  label: "الموظفون والصلاحيات", icon: UserCog,   moduleKey: "employees", permission: "view_employees" },
      { id: "audit-logs", label: "سجل العمليات",        icon: Shield, permission: "view_audit_logs" },
      { id: "settings",   label: "الإعدادات",           icon: Settings, permission: "manage_settings" },
    ],
  },
];

export function Sidebar({ currentPage, onNavigate, storeName, onClose, permissions, userName, role }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const settings = useQuery(api.settings.getPublic);

  const modules = settings?.modules ?? {};

  const isModuleEnabled = (moduleKey?: string): boolean => {
    if (!moduleKey) return true; // no module key = always visible
    const val = (modules as Record<string, boolean | undefined>)[moduleKey];
    return val === undefined ? true : val; // default to enabled if not set
  };

  const toggleGroup = (label: string) => {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isGroupActive = (group: NavGroup) =>
    group.items.some(i => i.id === currentPage);

  // Filter groups to only show enabled modules
  const navGroups = ALL_NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(
      item =>
        isModuleEnabled(item.moduleKey) &&
        (!item.permission || permissions.includes(item.permission)),
    ),
  })).filter(group => group.items.length > 0);

  return (
    <div className="h-full bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight truncate max-w-32">{storeName}</p>
              <p className="text-slate-500 text-xs">نظام ERP</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick action */}
      {permissions.includes("create_invoices") && <div className="p-4">
        <button
          onClick={() => onNavigate("new-invoice")}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium text-sm hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          فاتورة جديدة
        </button>
      </div>}

      {/* Navigation Groups */}
      <nav className="flex-1 px-3 pb-4 space-y-1 overflow-y-auto">
        {navGroups.map(group => {
          const isOpen = !collapsed[group.label];
          const hasActive = isGroupActive(group);
          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                  hasActive ? "text-indigo-400" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                <span>{group.label}</span>
                {isOpen
                  ? <ChevronUp className="w-3 h-3" />
                  : <ChevronDown className="w-3 h-3" />
                }
              </button>

              {isOpen && (
                <div className="space-y-0.5 mb-1">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.id as Page)}
                        className={`sidebar-item w-full ${isActive ? "active" : ""}`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span>{item.label}</span>
                        {isActive && (
                          <div className="mr-auto w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">م</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{userName}</p>
            <p className="text-slate-500 text-xs">{role}</p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}
