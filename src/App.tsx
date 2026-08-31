import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { CustomSignInForm } from "./CustomSignInForm";
import { Toaster } from "sonner";
import { ERPApp } from "./components/ERPApp";
import { TrackingPage } from "./components/TrackingPage";
import { SetupWizard, PendingApproval } from "./components/SetupWizard";
import { BrandMark } from "./components/BrandMark";
import { getBrand, useBrandingTheme, type BrandingSettings } from "./lib/branding";
import { I18nProvider, LanguageSelect, useI18n } from "./i18n/I18nProvider";

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const publicSettings = useQuery(api.settings.getPublic);
  const { direction } = useI18n();
  useBrandingTheme(publicSettings);
  const isTrackingPage = window.location.hash.startsWith("#track");

  if (isTrackingPage) {
    return (
      <div dir={direction}>
        <TrackingPage />
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir={direction}>
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
  const { direction, t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6" dir={direction}>
      <div className="text-center">
        <div className="brand-spinner mx-auto mb-4" />
        <p className="text-sm font-bold text-slate-200">{t("auth.starting")}</p>
        <p className="mt-2 text-xs text-slate-500">{t("auth.checkingConnection")}</p>
      </div>
    </div>
  );
}

function AuthedRouter() {
  const accessState = useQuery(api.employees.accessState);
  const { t } = useI18n();

  if (accessState === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="brand-spinner mb-4" />
          <p className="text-slate-400 text-sm">{t("auth.checkingAccount")}</p>
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
  const { direction, t } = useI18n();
  const inviteParams = new URLSearchParams(window.location.search);
  const inviteCode = inviteParams.get("invite")?.trim() || undefined;
  const invitedEmail = inviteParams.get("email")?.trim() || undefined;
  const brand = getBrand(publicSettings);
  const needsSetup = setupStatus?.needsSetup ?? false;
  const allowSignUp = needsSetup || Boolean(inviteCode);

  return (
    <div className="auth-shell min-h-screen relative flex items-center justify-center overflow-hidden" dir={direction}>
      <div className="auth-grid absolute inset-0" />
      <div className="absolute z-20 top-4" style={{ insetInlineEnd: "1rem" }}>
        <LanguageSelect compact />
      </div>
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
          <p className="text-sm text-slate-300" data-i18n-skip>{brand.tagline}</p>
        </div>

        {needsSetup && (
          <div className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4">
            <p className="text-center text-sm text-amber-100">
              {t("auth.firstUse")}
            </p>
          </div>
        )}

        <div className="auth-card rounded-3xl p-7 sm:p-8">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-black text-white">
              {allowSignUp ? t("auth.createAccount") : t("auth.signIn")}
            </h2>
          </div>
          <CustomSignInForm
            allowSignUp={allowSignUp}
            inviteCode={inviteCode}
            invitedEmail={invitedEmail}
          />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          {t("auth.systemSummary")}
        </p>
      </div>
    </div>
  );
}
