import { Authenticated, Unauthenticated, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { CustomSignInForm } from "./CustomSignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { ERPApp } from "./components/ERPApp";
import { TrackingPage } from "./components/TrackingPage";
import { SetupWizard, PendingApproval } from "./components/SetupWizard";
import { useEffect, useState } from "react";

export default function App() {
  // Check if URL has #track= hash for public tracking page
  const hash = window.location.hash;
  const isTrackingPage = hash.startsWith("#track");

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
        <LoginPage />
      </Unauthenticated>
      <Toaster position="top-center" richColors />
    </div>
  );
}

/**
 * AuthedRouter — handles the post-authentication flow:
 * 1. Call ensureProfile to create/verify the user's profile
 * 2. If no admin exists → show SetupWizard
 * 3. If profile exists → show ERPApp
 * 4. If profile creation fails → show error
 */
function AuthedRouter() {
  const ensureProfile = useMutation(api.employees.ensureProfile);
  const setupStatus = useQuery(api.employees.setupStatus);
  const [profileState, setProfileState] = useState<{
    loading: boolean;
    needsSetup: boolean;
    role: string | null;
    isActive: boolean;
  }>({ loading: true, needsSetup: false, role: null, isActive: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await ensureProfile({});
        if (cancelled) return;
        setProfileState({
          loading: false,
          needsSetup: result.needsSetup,
          role: result.role,
          isActive: result.isActive,
        });
      } catch {
        if (cancelled) return;
        // If ensureProfile fails, try to proceed anyway — maybe settings aren't set up
        setProfileState({
          loading: false,
          needsSetup: false,
          role: "viewer",
          isActive: true,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [ensureProfile]);

  // Loading state
  if (profileState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-slate-400 text-sm">جاري التحقق من حسابك...</p>
        </div>
      </div>
    );
  }

  // No admin exists → show setup wizard
  if (profileState.needsSetup) {
    return <SetupWizard />;
  }

  // User is inactive → show pending approval
  if (!profileState.isActive) {
    return <PendingApproval />;
  }

  // All good → show the main app
  return <ERPApp />;
}

function LoginPage() {
  const setupStatus = useQuery(api.employees.setupStatus);
  const publicSettings = useQuery(api.settings.getPublic);

  const storeName = publicSettings?.storeName ?? "تك ستور ERP";
  const needsSetup = setupStatus?.needsSetup ?? false;

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-slate-900">
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-20"
      >
        <source src="https://videos.pexels.com/video-files/6755158/6755158-hd_1920_1080_25fps.mp4" type="video/mp4" />
      </video>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950/80 to-purple-950/60" />

      {/* Decorative circles */}
      <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-6 animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-2xl shadow-indigo-500/30 mb-4 animate-pulse-glow">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white mb-1">{storeName}</h1>
          <p className="text-slate-400 text-sm">نظام إدارة متكامل للإلكترونيات</p>
        </div>

        {/* Setup banner */}
        {needsSetup && (
          <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4 mb-4">
            <p className="text-amber-200 text-sm text-center">
              مرحباً! هذا أول استخدام للنظام. سجّل حساباً جديداً ثم أكمل إعداد المدير.
            </p>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">
            {needsSetup ? "إنشاء حساب" : "تسجيل الدخول"}
          </h2>
          <CustomSignInForm />
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          نظام ERP احترافي لمحلات الإلكترونيات
        </p>
      </div>
    </div>
  );
}
