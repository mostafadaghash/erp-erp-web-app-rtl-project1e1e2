import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  Image,
  MessageCircle,
  Palette,
  Save,
  Settings,
  Shield,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "../lib/errors";
import { normalizeEgyptPhoneForWhatsApp } from "../lib/utils";
import { BrandMark } from "./BrandMark";

const MODULE_LIST = [
  { key: "invoices", label: "المبيعات", desc: "فواتير البيع ومرتجعاتها" },
  { key: "orders", label: "أوامر البيع", desc: "إدارة طلبات وأوامر العملاء" },
  { key: "deliveries", label: "عمليات الشحن", desc: "الشحن والتحصيل عند التسليم" },
  { key: "repairs", label: "أوامر الصيانة", desc: "استلام ومتابعة أعمال الصيانة" },
  { key: "expenses", label: "المصروفات", desc: "إثبات ومتابعة المصروفات" },
  { key: "suppliers", label: "الموردون", desc: "بيانات الموردين وحساباتهم" },
  { key: "shipments", label: "المشتريات", desc: "عمليات الشراء واستلام الأصناف" },
  { key: "crm", label: "إدارة علاقات العملاء", desc: "متابعة العملاء المحتملين والفرص" },
  { key: "branches", label: "الفروع", desc: "إدارة الفروع ونطاقات العمل" },
  { key: "employees", label: "المستخدمون والصلاحيات", desc: "الحسابات والأدوار وصلاحيات الوصول" },
  { key: "reports", label: "التقارير", desc: "تقارير الأداء والمبيعات والحسابات" },
] as const;

type ModuleKey = typeof MODULE_LIST[number]["key"];
type AssetKind = "logo" | "favicon";

const defaultModules: Record<ModuleKey, boolean> = {
  invoices: true,
  orders: true,
  deliveries: true,
  repairs: true,
  expenses: true,
  suppliers: true,
  shipments: true,
  crm: true,
  branches: true,
  employees: true,
  reports: true,
};

const emptyForm = {
  storeName: "DAGHASH ERP",
  shortName: "DAGHASH",
  tagline: "إدارة أعمالك بوضوح",
  legalName: "",
  storeType: "mixed",
  primaryColor: "#16a66a",
  secondaryColor: "#12263a",
  logoUrl: "",
  faviconUrl: "",
  invoiceFooter: "",
  phone: "",
  address: "",
  currency: "EGP",
  taxRate: 14,
  whatsappNumber: "",
};

export function SettingsPage() {
  const settings = useQuery(api.settings.get);
  const upsertSettings = useMutation(api.settings.upsert);
  const updateModules = useMutation(api.settings.updateModules);
  const generateUploadUrl = useMutation(api.settings.generateBrandAssetUploadUrl);
  const setBrandAsset = useMutation(api.settings.setBrandAsset);
  const removeBrandAsset = useMutation(api.settings.removeBrandAsset);
  const paymentConfiguration = useQuery(api.paymentMethods.configuration);
  const upsertPaymentMethod = useMutation(api.paymentMethods.upsert);
  const setDefaultPaymentAccount = useMutation(api.paymentMethods.setDefaultAccount);
  const [form, setForm] = useState(emptyForm);
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(defaultModules);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingModules, setSavingModules] = useState(false);
  const [assetBusy, setAssetBusy] = useState<AssetKind | null>(null);

  useEffect(() => {
    if (!settings || initialized) return;
    setForm({
      storeName: settings.storeName,
      shortName: settings.shortName ?? "",
      tagline: settings.tagline ?? "",
      legalName: settings.legalName ?? "",
      storeType: settings.storeType,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      logoUrl: settings.logoUrl ?? "",
      faviconUrl: settings.faviconUrl ?? "",
      invoiceFooter: settings.invoiceFooter ?? "",
      phone: settings.phone ?? "",
      address: settings.address ?? "",
      currency: "EGP",
      taxRate: settings.taxRate,
      whatsappNumber: settings.whatsappNumber ?? "",
    });
    if (settings.modules) {
      setModules({
        ...defaultModules,
        ...Object.fromEntries(Object.entries(settings.modules).map(([key, value]) => [key, value ?? true])),
      } as Record<ModuleKey, boolean>);
    }
    setInitialized(true);
  }, [settings, initialized]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await upsertSettings({
        storeName: form.storeName,
        shortName: form.shortName || undefined,
        tagline: form.tagline || undefined,
        legalName: form.legalName || undefined,
        storeType: form.storeType,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        logoUrl: form.logoUrl || undefined,
        faviconUrl: form.faviconUrl || undefined,
        invoiceFooter: form.invoiceFooter || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        currency: "EGP",
        taxRate: Number(form.taxRate),
        whatsappNumber: form.whatsappNumber || undefined,
      });
      toast.success("تم حفظ إعدادات النظام والهوية");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر حفظ إعدادات النظام"));
    } finally {
      setSaving(false);
    }
  };

  const uploadAsset = async (kind: AssetKind, file?: File) => {
    if (!file) return;
    const maxSize = kind === "logo" ? 2 * 1024 * 1024 : 1024 * 1024;
    if (!file.type.startsWith("image/")) return toast.error("اختر ملف صورة صالحًا");
    if (file.size > maxSize) return toast.error(kind === "logo" ? "حجم الشعار يجب ألا يتجاوز 2 ميجابايت" : "حجم الأيقونة يجب ألا يتجاوز 1 ميجابايت");
    setAssetBusy(kind);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("تعذر رفع الصورة");
      const payload = await response.json() as { storageId: string };
      await setBrandAsset({ kind, storageId: payload.storageId as Id<"_storage"> });
      toast.success(kind === "logo" ? "تم تحديث شعار النظام" : "تم تحديث أيقونة المتصفح");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر رفع الصورة"));
    } finally {
      setAssetBusy(null);
    }
  };

  const deleteAsset = async (kind: AssetKind) => {
    if (assetBusy) return;
    setAssetBusy(kind);
    try {
      await removeBrandAsset({ kind });
      toast.success(kind === "logo" ? "تمت إزالة الشعار" : "تمت إزالة الأيقونة");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر إزالة الصورة"));
    } finally {
      setAssetBusy(null);
    }
  };

  const handleSaveModules = async () => {
    if (savingModules) return;
    setSavingModules(true);
    try {
      await updateModules({ modules });
      toast.success("تم حفظ إعدادات الوحدات");
    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر حفظ إعدادات الوحدات"));
    } finally {
      setSavingModules(false);
    }
  };

  const logoPreview = settings?.logoPreviewUrl ?? form.logoUrl;
  const faviconPreview = settings?.faviconPreviewUrl ?? form.faviconUrl;
  const enabledCount = Object.values(modules).filter(Boolean).length;

  const togglePaymentMethod = async (method: NonNullable<typeof paymentConfiguration>["methods"][number]) => {
    try {
      await upsertPaymentMethod({ code: method.code, name: method.name, kind: method.kind, requiresAccount: method.requiresAccount, allowedAccountTypes: method.allowedAccountTypes, isActive: !method.isActive, sortOrder: method.sortOrder });
      toast.success(!method.isActive ? "تم تفعيل طريقة الدفع" : "تم تعطيل طريقة الدفع");
    } catch (error) { toast.error(getErrorMessage(error, "تعذر تعديل طريقة الدفع")); }
  };

  return (
    <div className="space-y-6 p-4 lg:p-6" data-testid="settings-page">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-800">
          <Settings className="h-6 w-6 text-[var(--brand-primary)]" />
          إعدادات النظام
        </h1>
        <p className="mt-1 text-sm text-slate-500">غيّر الاسم والشعار والألوان في أي وقت بدون تعديل الكود</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="settings-section">
          <div className="mb-5 flex items-center gap-2">
            <Palette className="h-5 w-5 text-[var(--brand-primary)]" />
            <div><h2 className="font-black text-slate-800">الهوية والعلامة التجارية</h2><p className="text-xs text-slate-500">تظهر هذه البيانات في تسجيل الدخول والقائمة والمتصفح والمطبوعات</p></div>
          </div>

          <div className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[auto_1fr] lg:items-center">
            <BrandMark name={form.storeName} logoUrl={logoPreview || undefined} primaryColor={form.primaryColor} secondaryColor={form.secondaryColor} size="lg" />
            <div>
              <p className="text-lg font-black text-slate-900">{form.shortName || form.storeName || "اسم النظام"}</p>
              <p className="mt-1 text-sm text-slate-500">{form.tagline || "وصف مختصر للنظام"}</p>
              <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-200"><div className="h-full w-3/5 rounded-full" style={{ background: `linear-gradient(90deg, ${form.primaryColor}, ${form.secondaryColor})` }} /></div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-label">اسم النظام الكامل *<input data-testid="settings-store-name" className="form-input" required maxLength={100} value={form.storeName} onChange={event => setForm({ ...form, storeName: event.target.value })} placeholder="DAGHASH ERP" /></label>
            <label className="form-label">الاسم المختصر<input className="form-input" maxLength={30} value={form.shortName} onChange={event => setForm({ ...form, shortName: event.target.value })} placeholder="DAGHASH" /></label>
            <label className="form-label sm:col-span-2">العبارة التعريفية<input className="form-input" maxLength={120} value={form.tagline} onChange={event => setForm({ ...form, tagline: event.target.value })} placeholder="إدارة أعمالك بوضوح" /></label>
            <label className="form-label sm:col-span-2">الاسم القانوني للمنشأة<input className="form-input" maxLength={160} value={form.legalName} onChange={event => setForm({ ...form, legalName: event.target.value })} placeholder="الاسم المسجل في الفواتير والمستندات" /></label>
            <ColorField label="اللون الرئيسي" value={form.primaryColor} onChange={value => setForm({ ...form, primaryColor: value })} />
            <ColorField label="اللون الثانوي" value={form.secondaryColor} onChange={value => setForm({ ...form, secondaryColor: value })} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <AssetCard title="شعار النظام" description="PNG أو JPG أو SVG، بحد أقصى 2 ميجابايت" preview={logoPreview} busy={assetBusy === "logo"} onUpload={file => void uploadAsset("logo", file)} onRemove={() => void deleteAsset("logo")} />
            <AssetCard title="أيقونة المتصفح" description="صورة مربعة، بحد أقصى 1 ميجابايت" preview={faviconPreview} busy={assetBusy === "favicon"} onUpload={file => void uploadAsset("favicon", file)} onRemove={() => void deleteAsset("favicon")} compact />
          </div>

          <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">استخدام روابط صور خارجية بدل الرفع</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="form-label">رابط الشعار<input className="form-input" dir="ltr" value={form.logoUrl} onChange={event => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://..." /></label>
              <label className="form-label">رابط أيقونة المتصفح<input className="form-input" dir="ltr" value={form.faviconUrl} onChange={event => setForm({ ...form, faviconUrl: event.target.value })} placeholder="https://..." /></label>
            </div>
          </details>
        </section>

        <section className="settings-section">
          <div className="mb-5 flex items-center gap-2"><Building2 className="h-5 w-5 text-[var(--brand-primary)]" /><h2 className="font-black text-slate-800">بيانات المنشأة والفواتير</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-label">نوع النشاط<select className="form-input" value={form.storeType} onChange={event => setForm({ ...form, storeType: event.target.value })}><option value="retail">تجزئة</option><option value="wholesale">جملة</option><option value="services">خدمات</option><option value="mixed">تجارة وخدمات</option><option value="electronics">إلكترونيات</option></select></label>
            <label className="form-label">رقم الهاتف<input className="form-input" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="01xxxxxxxxx" /></label>
            <label className="form-label sm:col-span-2">العنوان<input className="form-input" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="المحافظة، المدينة، العنوان" /></label>
            <label className="form-label">العملة<select className="form-input" value="EGP" disabled><option value="EGP">جنيه مصري (EGP)</option></select></label>
            <label className="form-label">ضريبة القيمة المضافة (%)<input className="form-input" type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={event => setForm({ ...form, taxRate: Number(event.target.value) })} /></label>
            <label className="form-label sm:col-span-2">تذييل الفاتورة<textarea className="form-input min-h-24" maxLength={500} value={form.invoiceFooter} onChange={event => setForm({ ...form, invoiceFooter: event.target.value })} placeholder="شكرًا لتعاملكم معنا" /></label>
          </div>
        </section>

        <section className="settings-section">
          <div className="mb-5 flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" /><h2 className="font-black text-slate-800">التواصل وواتساب</h2></div>
          <label className="form-label">رقم واتساب للإشعارات<input className="form-input" dir="ltr" value={form.whatsappNumber} onChange={event => setForm({ ...form, whatsappNumber: event.target.value })} placeholder="201012345678" /><span className="mt-1 block text-xs font-normal text-slate-400">اكتب رمز الدولة بدون + أو 00</span></label>
          {form.whatsappNumber && <a href={`https://wa.me/${normalizeEgyptPhoneForWhatsApp(form.whatsappNumber)}?text=${encodeURIComponent("مرحبًا، هذه رسالة اختبار من نظام الإدارة")}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"><MessageCircle className="h-4 w-4" />اختبار واتساب</a>}
        </section>

        <button data-testid="settings-save" type="submit" disabled={saving} className="btn-primary flex w-full items-center justify-center gap-2 sm:w-auto"><Save className="h-4 w-4" />{saving ? "جارٍ الحفظ..." : "حفظ إعدادات النظام"}</button>
      </form>

      <section className="settings-section">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-[var(--brand-primary)]" /><div><h2 className="font-black text-slate-800">وحدات النظام</h2><p className="text-xs text-slate-500">فعّل فقط الوحدات التي تحتاجها المنشأة</p></div></div>
          <div className="flex items-center gap-2"><span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{enabledCount} / {MODULE_LIST.length} مفعّل</span><button type="button" onClick={() => void handleSaveModules()} disabled={savingModules} className="btn-primary flex items-center gap-2 py-2 text-sm"><Save className="h-4 w-4" />{savingModules ? "جارٍ الحفظ..." : "حفظ الوحدات"}</button></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_LIST.map(module => {
            const enabled = modules[module.key];
            return (
              <button key={module.key} type="button" onClick={() => setModules(value => ({ ...value, [module.key]: !value[module.key] }))} className={`flex items-center gap-3 rounded-2xl border p-4 text-right transition ${enabled ? "border-[color:var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,white)]" : "border-slate-200 bg-slate-50"}`}>
                {enabled ? <ToggleRight className="h-7 w-7 shrink-0 text-[var(--brand-primary)]" /> : <ToggleLeft className="h-7 w-7 shrink-0 text-slate-400" />}
                <div className="min-w-0 flex-1"><p className="text-sm font-black text-slate-800">{module.label}</p><p className="mt-0.5 text-xs text-slate-500">{module.desc}</p></div>
              </button>
            );
          })}
        </div>
      </section>

      {paymentConfiguration && <section className="settings-section" data-testid="payment-method-settings"><div className="mb-5 flex items-center gap-2"><WalletCards className="h-5 w-5 text-[var(--brand-primary)]" /><div><h2 className="font-black text-slate-800">طرق الدفع والخزائن الافتراضية</h2><p className="text-xs text-slate-500">حدد الطرق المتاحة والحساب الذي يستقبل كل طريقة داخل كل فرع.</p></div></div><div className="space-y-3">{paymentConfiguration.methods.map(method => <div key={method.code} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black text-slate-800">{method.name}</p><p className="mt-0.5 text-xs text-slate-500">{method.kind === "credit" ? "آجل — لا يحرك خزنة" : `الرمز: ${method.code}`}</p></div><button type="button" className={`erp-action ${method.isActive ? "text-emerald-700" : "text-slate-500"}`} onClick={() => void togglePaymentMethod(method)}>{method.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}{method.isActive ? "مفعلة" : "معطلة"}</button></div>{method.requiresAccount && method.isActive && <div className="mt-4 grid gap-3 md:grid-cols-2">{paymentConfiguration.branches.map(branch => { const current = paymentConfiguration.defaults.find(item => item.paymentMethodCode === method.code && item.branchId === branch._id)?.accountId; const eligible = paymentConfiguration.accounts.filter(account => account.branchId === branch._id && method.allowedAccountTypes.includes(account.type)); return <label key={branch._id} className="form-label">{branch.name}<select className="form-input" value={current ?? ""} onChange={event => { if (!event.target.value) return; void setDefaultPaymentAccount({ paymentMethodCode: method.code, branchId: branch._id, accountId: event.target.value as Id<"financialAccounts"> }).then(() => toast.success("تم حفظ الخزنة الافتراضية")).catch(error => toast.error(getErrorMessage(error, "تعذر حفظ الخزنة الافتراضية"))); }}><option value="">اختر الخزنة الافتراضية</option>{eligible.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}</select></label>; })}</div>}</div>)}</div></section>}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="form-label">{label}<div className="flex items-center gap-3"><input type="color" className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1" value={value} onChange={event => onChange(event.target.value)} /><input className="form-input flex-1" dir="ltr" required pattern="#[0-9a-fA-F]{6}" value={value} onChange={event => onChange(event.target.value)} /></div></label>;
}

function AssetCard({ title, description, preview, busy, compact, onUpload, onRemove }: { title: string; description: string; preview?: string | null; busy: boolean; compact?: boolean; onUpload: (file?: File) => void; onRemove: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={`${compact ? "h-12 w-12" : "h-16 w-16"} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100`}>
          {preview ? <img src={preview} alt={title} className="h-full w-full object-contain p-1" /> : <Image className="h-5 w-5 text-slate-400" />}
        </div>
        <div className="min-w-0 flex-1"><p className="font-black text-slate-800">{title}</p><p className="mt-0.5 text-xs text-slate-500">{description}</p></div>
      </div>
      <div className="mt-4 flex gap-2">
        <label className="btn-secondary flex cursor-pointer items-center gap-2 text-sm"><Upload className="h-4 w-4" />{busy ? "جارٍ التنفيذ..." : "رفع صورة"}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon" className="hidden" disabled={busy} onChange={event => onUpload(event.target.files?.[0])} /></label>
        {preview && <button type="button" disabled={busy} onClick={onRemove} className="flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50"><Trash2 className="h-4 w-4" />إزالة</button>}
      </div>
    </div>
  );
}
