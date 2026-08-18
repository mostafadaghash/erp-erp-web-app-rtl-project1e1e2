import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../convex/_generated/api";
import { CustomSignInForm } from "./CustomSignInForm";
import { Toaster } from "sonner";
import { ERPApp } from "./components/ERPApp";
import { TrackingPage } from "./components/TrackingPage";
import { SetupWizard, PendingApproval } from "./components/SetupWizard";
import { BrandMark } from "./components/BrandMark";
import { getBrand, useBrandingTheme, type BrandingSettings } from "./lib/branding";

export default function App() {
  const publicSettings = useQuery(api.settings.getPublic);
  useBrandingTheme(publicSettings);
  const isTrackingPage = window.location.hash.startsWith("#track");

  if (isTrackingPage) {
    return (
      <div dir="rtl">
        <TrackingPage />
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <Authenticated>
        <AuthedRouter />
      </Authenticated>
      <Unauthenticated>
        <LoginPage publicSettings={publicSettings} />
      </Unauthenticated>
      <Toaster position="top-center" richColors />
    </div>
  );
}

function AuthedRouter() {
  const accessState = useQuery(api.employees.accessState);

  if (accessState === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="brand-spinner mb-4" />
          <p className="text-sm text-slate-500">جارٍ تجهيز مساحة العمل...</p>
        </div>
      </div>
    );
  }

  if (accessState.needsSetup) return <SetupWizard />;

  if (accessState.status !== "active") {
    return (
      <PendingApproval
        status={accessState.status}
        userName={accessState.name ?? undefined}
      />
    );
  }

  return <ERPApp />;
}

function LoginPage({
  publicSettings,
}: {
  publicSettings: BrandingSettings | null | undefined;
}) {
  const setupStatus = useQuery(api.employees.setupStatus);
  const inviteParams = new URLSearchParams(window.location.search);
  const inviteCode = inviteParams.get("invite")?.trim() || undefined;
  const invitedEmail = inviteParams.get("email")?.trim() || undefined;
  const brand = getBrand(publicSettings);
  const needsSetup = setupStatus?.needsSetup ?? false;
  const allowSignUp = needsSetup || Boolean(inviteCode);

  return (
    <div className="auth-shell relative min-h-screen overflow-hidden p-4 sm:p-6 lg:p-10">
      <div className="auth-grid absolute inset-0" />
      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden rounded-3xl border border-slate-200/80 bg-white/70 p-10 shadow-sm backdrop-blur-sm lg:block">
          <div className="mb-8 flex items-center gap-4">
            <BrandMark
              name={brand.storeName}
              logoUrl={brand.logoUrl}
              primaryColor={brand.primaryColor}
              secondaryColor={brand.secondaryColor}
              size="lg"
            />
            <div>
              <h1 className="text-2xl font-black text-slate-900">{brand.storeName}</h1>
              <p className="mt-1 text-sm text-slate-500">{brand.tagline}</p>
            </div>
          </div>

          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" /> إدارة أبسط وأوضح
            </span>
            <h2 className="mt-5 text-4xl font-black leading-[1.35] text-slate-900">
              كل عمليات نشاطك في مكان واحد
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              المبيعات والمشتريات والمخزون والحسابات والشحن والصيانة بواجهة عربية عملية وسهلة الاستخدام.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 text-sm text-slate-600">
            {[
              "صلاحيات واضحة لكل مستخدم",
              "متابعة مالية ومخزنية مترابطة",
              "تقارير جاهزة لاتخاذ القرار",
              "سجل مراجعة وحماية للعمليات",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <div className="mb-4 flex justify-center">
              <BrandMark
                name={brand.storeName}
                logoUrl={brand.logoUrl}
                primaryColor={brand.primaryColor}
                secondaryColor={brand.secondaryColor}
                size="lg"
              />
            </div>
            <h1 className="text-2xl font-black text-slate-900">{brand.storeName}</h1>
            <p className="mt-1 text-sm text-slate-500">{brand.tagline}</p>
          </div>

          {needsSetup && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-center text-sm leading-6 text-amber-800">
                مرحبًا بك. أنشئ حساب مدير النظام لإكمال الإعداد الأولي.
              </p>
            </div>
          )}

          <div className="auth-card rounded-3xl p-7 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-bold text-emerald-700">بوابة النظام</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">
                {allowSignUp ? "إنشاء الحساب" : "تسجيل الدخول"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                أدخل بيانات حسابك للوصول إلى مساحة العمل.
              </p>
            </div>
            <CustomSignInForm
              allowSignUp={allowSignUp}
              inviteCode={inviteCode}
              invitedEmail={invitedEmail}
            />
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            دخول آمن ومخصص للمستخدمين المصرح لهم
          </p>
        </section>
      </div>
    </div>
  );
}
