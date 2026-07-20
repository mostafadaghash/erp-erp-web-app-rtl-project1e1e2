import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import {
  Settings, Save, Palette, Store, Phone, MessageCircle,
  ToggleLeft, ToggleRight, Shield
} from "lucide-react";

const MODULE_LIST = [
  { key: "invoices",   label: "المبيعات والفواتير",    desc: "إنشاء وإدارة الفواتير" },
  { key: "orders",     label: "الأوردرات",              desc: "إدارة طلبات العملاء" },
  { key: "deliveries", label: "التوصيلات",              desc: "تتبع شحنات العملاء" },
  { key: "repairs",    label: "الصيانة",                desc: "إدارة طلبات الإصلاح" },
  { key: "expenses",   label: "المصروفات",              desc: "تتبع مصروفات المحل" },
  { key: "suppliers",  label: "الموردين",               desc: "إدارة الموردين والمشتريات" },
  { key: "shipments",  label: "الشحنات الواردة",        desc: "استقبال البضاعة من الموردين" },
  { key: "crm",        label: "العملاء المحتملين (CRM)", desc: "تتبع الليدز والفرص" },
  { key: "branches",   label: "الفروع",                 desc: "إدارة فروع المحل" },
  { key: "employees",  label: "الموظفون والصلاحيات",   desc: "إدارة الفريق والأدوار" },
  { key: "reports",    label: "التقارير",               desc: "تقارير المبيعات والأداء" },
] as const;

type ModuleKey = typeof MODULE_LIST[number]["key"];

const defaultModules: Record<ModuleKey, boolean> = {
  invoices: true, orders: true, deliveries: true, repairs: true,
  expenses: true, suppliers: true, shipments: true, crm: true,
  branches: true, employees: true, reports: true,
};

export function SettingsPage() {
  const settings = useQuery(api.settings.get);
  const upsertSettings = useMutation(api.settings.upsert);
  const updateModules = useMutation(api.settings.updateModules);

  const [form, setForm] = useState({
    storeName: "تك ستور",
    storeType: "electronics",
    primaryColor: "#6366f1",
    secondaryColor: "#8b5cf6",
    phone: "",
    address: "",
    currency: "ريال",
    taxRate: 15,
    whatsappNumber: "",
  });

  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(defaultModules);
  const [savingModules, setSavingModules] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setForm({
        storeName: settings.storeName,
        storeType: settings.storeType,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        phone: settings.phone ?? "",
        address: settings.address ?? "",
        currency: settings.currency,
        taxRate: settings.taxRate,
        whatsappNumber: settings.whatsappNumber ?? "",
      });
      if (settings.modules) {
        setModules({
          ...defaultModules,
          ...Object.fromEntries(
            Object.entries(settings.modules).map(([k, v]) => [k, v ?? true])
          ),
        } as Record<ModuleKey, boolean>);
      }
      setInitialized(true);
    }
  }, [settings, initialized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertSettings({
        storeName: form.storeName,
        storeType: form.storeType,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        phone: form.phone || undefined,
        address: form.address || undefined,
        currency: form.currency,
        taxRate: Number(form.taxRate),
        whatsappNumber: form.whatsappNumber || undefined,
      });
      toast.success("تم حفظ الإعدادات بنجاح ✅");
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    }
  };

  const handleSaveModules = async () => {
    setSavingModules(true);
    try {
      await updateModules({ modules });
      toast.success("تم حفظ إعدادات الوحدات ✅");
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    } finally {
      setSavingModules(false);
    }
  };

  const toggleModule = (key: ModuleKey) => {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const storeTypes = [
    { value: "electronics", label: "إلكترونيات عامة" },
    { value: "mobile",      label: "موبايل وإكسسوارات" },
    { value: "laptop",      label: "لابتوب وكمبيوتر" },
    { value: "gaming",      label: "ألعاب وبلايستيشن" },
    { value: "mixed",       label: "متعدد التخصصات" },
  ];

  const enabledCount = Object.values(modules).filter(Boolean).length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-600" />
          الإعدادات
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">تخصيص النظام وإعدادات White Label</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Store Info */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Store className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800">معلومات المحل</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">اسم المحل / العلامة التجارية</label>
              <input className="form-input" value={form.storeName} onChange={e => setForm({...form, storeName: e.target.value})} placeholder="تك ستور" />
            </div>
            <div>
              <label className="form-label">نوع النشاط</label>
              <select className="form-input" value={form.storeType} onChange={e => setForm({...form, storeType: e.target.value})}>
                {storeTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">رقم الهاتف</label>
              <input className="form-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="form-label">العنوان</label>
              <input className="form-input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="المدينة، الحي" />
            </div>
          </div>
        </div>

        {/* White Label Colors */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Palette className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800">تخصيص الألوان (White Label)</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="form-label">اللون الرئيسي</label>
              <div className="flex items-center gap-3">
                <input type="color" className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer" value={form.primaryColor} onChange={e => setForm({...form, primaryColor: e.target.value})} />
                <input className="form-input flex-1" value={form.primaryColor} onChange={e => setForm({...form, primaryColor: e.target.value})} placeholder="#6366f1" />
              </div>
            </div>
            <div>
              <label className="form-label">اللون الثانوي</label>
              <div className="flex items-center gap-3">
                <input type="color" className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer" value={form.secondaryColor} onChange={e => setForm({...form, secondaryColor: e.target.value})} />
                <input className="form-input flex-1" value={form.secondaryColor} onChange={e => setForm({...form, secondaryColor: e.target.value})} placeholder="#8b5cf6" />
              </div>
            </div>
          </div>
          <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500 mb-3">معاينة الألوان</p>
            <div className="flex gap-3">
              <div
                className="flex-1 h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm"
                style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.secondaryColor})` }}
              >
                {form.storeName}
              </div>
              <div className="w-12 h-12 rounded-xl shadow-sm" style={{ background: form.primaryColor }} />
              <div className="w-12 h-12 rounded-xl shadow-sm" style={{ background: form.secondaryColor }} />
            </div>
          </div>
        </div>

        {/* Financial Settings */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="font-bold text-slate-800">الإعدادات المالية</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">العملة</label>
              <select className="form-input" value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
                <option value="ريال">ريال سعودي (SAR)</option>
                <option value="درهم">درهم إماراتي (AED)</option>
                <option value="دينار">دينار كويتي (KWD)</option>
                <option value="جنيه">جنيه مصري (EGP)</option>
                <option value="دولار">دولار أمريكي (USD)</option>
              </select>
            </div>
            <div>
              <label className="form-label">نسبة ضريبة القيمة المضافة (%)</label>
              <input className="form-input" type="number" value={form.taxRate} onChange={e => setForm({...form, taxRate: Number(e.target.value)})} min="0" max="100" />
            </div>
          </div>
        </div>

        {/* WhatsApp */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <MessageCircle className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-slate-800">إعدادات واتساب</h2>
          </div>
          <div>
            <label className="form-label">رقم واتساب للإشعارات (مع رمز الدولة)</label>
            <input className="form-input" value={form.whatsappNumber} onChange={e => setForm({...form, whatsappNumber: e.target.value})} placeholder="966501234567" dir="ltr" />
            <p className="text-xs text-slate-400 mt-1.5">مثال: 966501234567 (بدون + أو 00)</p>
          </div>
          {form.whatsappNumber && (
            <div className="mt-3">
              <a
                href={`https://wa.me/${form.whatsappNumber}?text=مرحباً، أريد الاستفسار`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                اختبار واتساب
              </a>
            </div>
          )}
        </div>

        <button type="submit" className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
          <Save className="w-4 h-4" />
          حفظ الإعدادات
        </button>
      </form>

      {/* Modules Management */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="font-bold text-slate-800">إدارة الوحدات</h2>
              <p className="text-xs text-slate-500 mt-0.5">تفعيل أو إيقاف أقسام النظام</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
              {enabledCount} / {MODULE_LIST.length} مفعّل
            </span>
            <button
              onClick={handleSaveModules}
              disabled={savingModules}
              className="btn-primary flex items-center gap-2 text-sm py-2"
            >
              {savingModules
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Save className="w-4 h-4" />
              }
              حفظ الوحدات
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULE_LIST.map(mod => {
            const isEnabled = modules[mod.key];
            return (
              <button
                key={mod.key}
                onClick={() => toggleModule(mod.key)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 text-right transition-all ${
                  isEnabled
                    ? "border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <div className={`flex-shrink-0 transition-colors ${isEnabled ? "text-indigo-600" : "text-slate-400"}`}>
                  {isEnabled
                    ? <ToggleRight className="w-7 h-7" />
                    : <ToggleLeft className="w-7 h-7" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${isEnabled ? "text-indigo-800" : "text-slate-600"}`}>
                    {mod.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${isEnabled ? "text-indigo-600" : "text-slate-400"}`}>
                    {mod.desc}
                  </p>
                </div>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isEnabled ? "bg-indigo-500" : "bg-slate-300"}`} />
              </button>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
          <p className="text-xs text-amber-700 font-medium">
            💡 تأكد من حفظ الوحدات بعد التعديل. سيتم إخفاء الأقسام المعطلة من القائمة الجانبية فوراً.
          </p>
        </div>
      </div>
    </div>
  );
}
