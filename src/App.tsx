import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
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
      <AuthLoading>
        <StartupScreen />
      </AuthLoading>
      <Toaster position="top-center" richColors />
    </div>
  );
}

function StartupScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6" dir="rtl">
      <div className="text-center">
        <div className="brand-spinner mx-auto mb-4" />
        <p className="text-sm font-bold text-slate-200">جاري تشغيل النظام...</p>
        <p className="mt-2 text-xs text-slate-500">يتم التحقق من الاتصال والجلسة.</p>
      </div>
    </div>
  );
}

function AuthedRouter() {
  const accessState = useQuery(api.employees.accessState);

  if (accessState === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="brand-spinner mb-4" />
          <p className="text-slate-400 text-sm">جاري التحقق من صلاحية الحساب...</p>
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
    <div className="auth-shell min-h-screen relative flex items-center justify-center overflow-hidden">
      <div className="auth-grid absolute inset-0" />
      <div
        className="absolute -top-24 right-[12%] h-96 w-96 rounded-full blur-3xl opacity-20"
        style={{ background: brand.primaryColor }}
      />
      <div
        className="absolute -bottom-40 left-[8%] h-[30rem] w-[30rem] rounded-full blur-3xl opacity-15"
        style={{ background: brand.secondaryColor }}
      />

      <div className="relative z-10 w-full max-w-md px-5 py-10 animate-fade-in-up">
        <div className="mb-7 text-center">
          <div className="mb-5 flex justify-center">
            <BrandMark
              name={brand.storeName}
              logoUrl={brand.logoUrl}
              primaryColor={brand.primaryColor}
              secondaryColor={brand.secondaryColor}
              size="lg"
              inverse
            />
          </div>
          <h1 className="mb-1 text-3xl font-black text-white">{brand.storeName}</h1>
          <p className="text-sm text-slate-300">{brand.tagline}</p>
        </div>

        {needsSetup && (
          <div className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4">
            <p className="text-center text-sm text-amber-100">
              هذا أول استخدام للنظام. أنشئ الحساب الأول ثم أكمل إعداد مدير النظام.
            </p>
          </div>
        )}

        <div className="auth-card rounded-3xl p-7 sm:p-8">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-black text-white">
              {allowSignUp ? "إنشاء الحساب" : "تسجيل الدخول"}
            </h2>
          </div>
          <CustomSignInForm
            allowSignUp={allowSignUp}
            inviteCode={inviteCode}
            invitedEmail={invitedEmail}
          />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          نظام متكامل لإدارة المبيعات والمشتريات والمخزون والحسابات
        </p>
      </div>
    </div>
  );
}