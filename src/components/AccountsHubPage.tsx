import type { Permission } from "../../convex/lib/permissions";
import type { Page } from "./ERPApp";
import {
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  Building2,
  CircleDollarSign,
  FileBarChart,
  Landmark,
  ReceiptText,
  Users,
} from "lucide-react";

interface AccountsHubPageProps {
  onNavigate: (page: Page) => void;
  permissions: Permission[];
}

interface AccountModule {
  page: Page;
  title: string;
  description: string;
  icon: React.ElementType;
  permission: Permission;
  tone: string;
}

const MODULES: AccountModule[] = [
  {
    page: "treasury",
    title: "الخزائن والبنوك",
    description: "متابعة الأرصدة والحركات والتحويلات بين الخزائن والحسابات البنكية.",
    icon: Landmark,
    permission: "view_finance",
    tone: "emerald",
  },
  {
    page: "customer-ledger",
    title: "حسابات العملاء",
    description: "الأرصدة المستحقة والتحصيلات وكشف حساب كل عميل بصورة واضحة.",
    icon: Users,
    permission: "view_customer_ledger",
    tone: "blue",
  },
  {
    page: "supplier-payments",
    title: "حسابات الموردين",
    description: "المستحقات والمدفوعات ومتابعة رصيد كل مورد في مكان واحد.",
    icon: Building2,
    permission: "view_supplier_ledger",
    tone: "amber",
  },
  {
    page: "expenses",
    title: "المصروفات",
    description: "تسجيل المصروفات ومراجعتها وربطها بالفرع والحساب المالي المناسب.",
    icon: CircleDollarSign,
    permission: "view_expenses",
    tone: "rose",
  },
  {
    page: "vouchers",
    title: "سندات القبض والصرف",
    description: "تسجيل القبض والصرف وربط الحركة بالخزنة والعميل أو المورد تلقائيًا.",
    icon: ReceiptText,
    permission: "view_finance",
    tone: "violet",
  },
  { page: "payment-schedules", title: "الشيكات والأقساط", description: "متابعة الاستحقاقات القادمة والمتأخرة وتسويتها على الخزنة.", icon: CalendarClock, permission: "view_finance", tone: "cyan" },
  {
    page: "reports",
    title: "التقارير المالية",
    description: "قراءة المؤشرات والنتائج المالية من تقارير موحدة وقابلة للمراجعة.",
    icon: FileBarChart,
    permission: "view_reports",
    tone: "cyan",
  },
];

const toneClasses: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  violet: "bg-violet-50 text-violet-700",
  cyan: "bg-cyan-50 text-cyan-700",
};

export function AccountsHubPage({ onNavigate, permissions }: AccountsHubPageProps) {
  const can = (permission: Permission) => permissions.includes(permission);
  const modules = MODULES.filter((module) => can(module.permission));

  const quickActions = [
    can("view_customer_ledger") && {
      page: "customer-ledger" as Page,
      label: "كشف حساب عميل",
      icon: ReceiptText,
    },
    can("view_supplier_ledger") && {
      page: "supplier-payments" as Page,
      label: "حساب مورد",
      icon: Building2,
    },
    can("view_finance") && {
      page: "treasury" as Page,
      label: "حركة خزينة أو بنك",
      icon: Banknote,
    },
    can("view_finance") && { page: "vouchers" as Page, label: "سند قبض أو صرف", icon: ReceiptText },
    can("view_finance") && {
      page: "treasury" as Page,
      label: "تحويل بين الحسابات",
      icon: ArrowLeftRight,
    },
  ].filter(Boolean) as Array<{ page: Page; label: string; icon: React.ElementType }>;

  return (
    <div className="erp-page space-y-5" dir="rtl" data-testid="accounts-hub-page">
      <header className="erp-page-header">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
            <Landmark className="h-3.5 w-3.5" /> مركز الحسابات
          </div>
          <h1 className="erp-page-title">الحسابات</h1>
          <p className="erp-page-subtitle">
            اختر ما تريد تنفيذه مباشرة؛ كل قسم يعرض المعلومات والعمليات المتعلقة به فقط.
          </p>
        </div>
      </header>

      <section className="professional-panel p-4 lg:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">العمليات الأكثر استخدامًا</h2>
            <p className="mt-1 text-xs text-slate-500">وصول سريع إلى المهام اليومية بدون الدخول في شاشات معقدة.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map(({ page, label, icon: Icon }) => (
            <button key={label} type="button" className="erp-action-button" onClick={() => onNavigate(page)}>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-black text-slate-900">أقسام الحسابات</h2>
          <p className="mt-1 text-xs text-slate-500">المسميات مرتبة حسب الاستخدام العملي داخل النشاط.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <button
                key={module.page}
                type="button"
                onClick={() => onNavigate(module.page)}
                className="professional-card group p-5 text-right transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${toneClasses[module.tone]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-black text-slate-900 group-hover:text-[var(--brand-primary)]">{module.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-500">{module.description}</p>
                    <span className="mt-4 inline-flex text-xs font-black text-[var(--brand-primary)]">فتح القسم</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-600 shadow-sm">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-black text-slate-900">طريقة العمل المقترحة</h2>
            <p className="mt-1 text-sm leading-7 text-slate-600">
              استخدم الخزائن والحسابات للحركة اليومية، وحسابات العملاء والموردين للمتابعة والتحصيل والسداد، وتقارير الحركة للمراجعة والطباعة.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
