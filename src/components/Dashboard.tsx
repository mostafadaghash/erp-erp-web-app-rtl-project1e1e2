import type { Page } from "./ERPApp";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Landmark,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Target,
  Truck,
  UserPlus,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import type { Permission } from "../../convex/lib/permissions";

interface DashboardProps {
  onNavigate: (page: Page) => void;
  onRequestCreate: (page: "new-invoice" | "shipments" | "products" | "customers") => void;
  permissions: Permission[];
  modules: Record<string, boolean | undefined>;
}

type HomeAction = {
  key: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  tone: string;
  featured?: boolean;
  visible: boolean;
  onClick: () => void;
};

export function Dashboard({ onNavigate, onRequestCreate, permissions, modules }: DashboardProps) {
  const can = (permission: Permission) => permissions.includes(permission);
  const enabled = (moduleName: string) => modules[moduleName] !== false;

  const mainModules: HomeAction[] = [
    {
      key: "sales",
      title: "المبيعات",
      subtitle: "الفواتير والعملاء وأوامر البيع",
      icon: ReceiptText,
      tone: "emerald",
      visible: can("view_invoices") && enabled("invoices"),
      onClick: () => onNavigate("invoices"),
    },
    {
      key: "purchases",
      title: "المشتريات",
      subtitle: "الموردون وفواتير الشراء",
      icon: ShoppingBag,
      tone: "cyan",
      visible: can("view_shipments") && enabled("shipments"),
      onClick: () => onNavigate("shipments"),
    },
    {
      key: "inventory",
      title: "المخزون",
      subtitle: "الأصناف والكميات والحركة",
      icon: Boxes,
      tone: "violet",
      visible: can("view_products"),
      onClick: () => onNavigate("products"),
    },
    {
      key: "accounts",
      title: "الحسابات",
      subtitle: "الخزائن والبنوك والحسابات",
      icon: Landmark,
      tone: "amber",
      visible: can("view_finance"),
      onClick: () => onNavigate("accounts-home"),
    },
    {
      key: "reports",
      title: "التقارير",
      subtitle: "تقارير المبيعات والمخزون والحسابات",
      icon: BarChart3,
      tone: "blue",
      visible: can("view_reports") && enabled("reports"),
      onClick: () => onNavigate("reports"),
    },
  ].filter((action) => action.visible);

  const quickActions: HomeAction[] = [
    {
      key: "new-sale",
      title: "فاتورة بيع جديدة",
      subtitle: "ابدأ عملية بيع مباشرة",
      icon: ReceiptText,
      tone: "emerald",
      featured: true,
      visible: can("create_invoices") && enabled("invoices"),
      onClick: () => onRequestCreate("new-invoice"),
    },
    {
      key: "new-purchase",
      title: "عملية شراء",
      subtitle: "إضافة فاتورة أو توريد جديد",
      icon: ShoppingBag,
      tone: "orange",
      featured: true,
      visible: can("create_shipments") && enabled("shipments"),
      onClick: () => onRequestCreate("shipments"),
    },
    {
      key: "new-product",
      title: "إضافة صنف",
      subtitle: "تعريف صنف جديد بالمخزون",
      icon: PackagePlus,
      tone: "cyan",
      visible: can("create_products"),
      onClick: () => onRequestCreate("products"),
    },
    {
      key: "new-customer",
      title: "عميل جديد",
      subtitle: "إضافة عميل إلى الدليل",
      icon: UserPlus,
      tone: "violet",
      visible: can("create_customers"),
      onClick: () => onRequestCreate("customers"),
    },
  ].filter((action) => action.visible);

  const documentActions: HomeAction[] = [
    {
      key: "sales-list",
      title: "فواتير المبيعات",
      icon: ReceiptText,
      tone: "emerald",
      visible: can("view_invoices") && enabled("invoices"),
      onClick: () => onNavigate("invoices"),
    },
    {
      key: "sales-return",
      title: "مرتجعات المبيعات",
      icon: RotateCcw,
      tone: "rose",
      visible: can("view_sales_returns") && enabled("invoices"),
      onClick: () => onNavigate("sales-returns"),
    },
    {
      key: "purchase-list",
      title: "فواتير المشتريات",
      icon: ShoppingBag,
      tone: "orange",
      visible: can("view_shipments") && enabled("shipments"),
      onClick: () => onNavigate("shipments"),
    },
    {
      key: "purchase-return",
      title: "مرتجعات المشتريات",
      icon: RotateCcw,
      tone: "plum",
      visible: can("view_purchase_returns"),
      onClick: () => onNavigate("purchase-returns"),
    },
    {
      key: "orders",
      title: "أوامر البيع",
      icon: ClipboardList,
      tone: "blue",
      visible: can("view_orders") && enabled("orders"),
      onClick: () => onNavigate("orders"),
    },
    {
      key: "shipping",
      title: "الشحن والتوصيل",
      icon: Truck,
      tone: "cyan",
      visible: can("view_deliveries") && enabled("deliveries"),
      onClick: () => onNavigate("deliveries"),
    },
    {
      key: "expenses",
      title: "المصروفات",
      icon: CircleDollarSign,
      tone: "red",
      visible: can("view_expenses") && enabled("expenses"),
      onClick: () => onNavigate("expenses"),
    },
    {
      key: "treasury",
      title: "الخزائن والبنوك",
      icon: WalletCards,
      tone: "gold",
      visible: can("view_finance"),
      onClick: () => onNavigate("treasury"),
    },
  ].filter((action) => action.visible);

  const managementActions: HomeAction[] = [
    {
      key: "customers",
      title: "العملاء",
      subtitle: "الدليل والأرصدة والمتابعة",
      icon: Users,
      tone: "teal",
      visible: can("view_customers"),
      onClick: () => onNavigate("customers"),
    },
    {
      key: "suppliers",
      title: "الموردون",
      subtitle: "الدليل والحسابات والمدفوعات",
      icon: Truck,
      tone: "slate",
      visible: can("view_suppliers") && enabled("suppliers"),
      onClick: () => onNavigate("suppliers"),
    },
    {
      key: "repairs",
      title: "الصيانة",
      subtitle: "أوامر الصيانة وحالة الأجهزة",
      icon: Wrench,
      tone: "indigo",
      visible: can("view_repairs") && enabled("repairs"),
      onClick: () => onNavigate("repairs"),
    },
    {
      key: "crm",
      title: "متابعة العملاء",
      subtitle: "الفرص والعملاء المحتملون",
      icon: Target,
      tone: "purple",
      visible: can("view_leads") && enabled("crm"),
      onClick: () => onNavigate("crm"),
    },
    {
      key: "branches",
      title: "الفروع",
      subtitle: "إدارة فروع المنشأة",
      icon: Building2,
      tone: "navy",
      visible: can("view_branches") && enabled("branches"),
      onClick: () => onNavigate("branches"),
    },
  ].filter((action) => action.visible);

  return (
    <div className="erp-home">
      <section className="erp-home-intro" aria-labelledby="home-heading">
        <div>
          <p className="erp-home-eyebrow">مساحة العمل</p>
          <h2 id="home-heading">ابدأ من الرئيسية</h2>
          <p>اختر القسم أو العملية التي تريد تنفيذها مباشرة.</p>
        </div>
        <div className="erp-home-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      {mainModules.length > 0 && (
        <section className="erp-home-section" aria-labelledby="home-modules-title">
          <div className="erp-home-section-head">
            <div>
              <p className="erp-home-section-kicker">الأقسام الرئيسية</p>
              <h3 id="home-modules-title">انتقل إلى القسم</h3>
            </div>
          </div>
          <div className="erp-home-module-strip">
            {mainModules.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  className={`erp-home-module erp-home-tone--${action.tone}`}
                  onClick={action.onClick}
                >
                  <span className="erp-home-module-icon"><Icon /></span>
                  <span className="erp-home-module-copy">
                    <strong>{action.title}</strong>
                    <small>{action.subtitle}</small>
                  </span>
                  <ArrowLeft className="erp-home-arrow" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {quickActions.length > 0 && (
        <section className="erp-home-section" aria-labelledby="home-quick-title">
          <div className="erp-home-section-head">
            <div>
              <p className="erp-home-section-kicker">وصول سريع</p>
              <h3 id="home-quick-title">ابدأ عملية جديدة</h3>
            </div>
          </div>
          <div className="erp-home-quick-grid">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  className={`erp-home-quick ${action.featured ? "erp-home-quick--featured" : ""} erp-home-tone--${action.tone}`}
                  onClick={action.onClick}
                >
                  <span className="erp-home-quick-icon"><Icon /></span>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.subtitle}</small>
                  </span>
                  <ArrowLeft className="erp-home-arrow" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {documentActions.length > 0 && (
        <section className="erp-home-section" aria-labelledby="home-documents-title">
          <div className="erp-home-section-head">
            <div>
              <p className="erp-home-section-kicker">المستندات والحركة</p>
              <h3 id="home-documents-title">اختر نوع العملية</h3>
            </div>
          </div>
          <div className="erp-home-doc-grid">
            {documentActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  className={`erp-home-doc erp-home-doc--${(index % 4) + 1} erp-home-tone--${action.tone}`}
                  onClick={action.onClick}
                >
                  <span className="erp-home-doc-icon"><Icon /></span>
                  <strong>{action.title}</strong>
                  <ArrowLeft className="erp-home-arrow" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {managementActions.length > 0 && (
        <section className="erp-home-section erp-home-section--last" aria-labelledby="home-management-title">
          <div className="erp-home-section-head">
            <div>
              <p className="erp-home-section-kicker">الإدارة والمتابعة</p>
              <h3 id="home-management-title">اختصارات العمل اليومي</h3>
            </div>
          </div>
          <div className="erp-home-management-grid">
            {managementActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  className={`erp-home-management erp-home-tone--${action.tone}`}
                  onClick={action.onClick}
                >
                  <span className="erp-home-management-icon"><Icon /></span>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.subtitle}</small>
                  </span>
                  <ArrowLeft className="erp-home-arrow" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
