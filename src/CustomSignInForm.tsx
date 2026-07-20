"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * CustomSignInForm — Arabic RTL sign-in / sign-up form.
 *
 * - Uses Password provider ONLY.
 * - NO "Continue as Guest" button.
 * - NO signIn("anonymous") call.
 * - Sign Up is kept temporarily (will be disabled after first admin is created).
 * - Styled to blend inside the glassmorphism login card in App.tsx.
 */
interface CustomSignInFormProps {
  allowSignUp: boolean;
  inviteCode?: string;
  invitedEmail?: string;
}

export function CustomSignInForm({
  allowSignUp,
  inviteCode,
  invitedEmail,
}: CustomSignInFormProps) {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">(
    inviteCode ? "signUp" : "signIn",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!allowSignUp && flow === "signUp") {
      setFlow("signIn");
    }
  }, [allowSignUp, flow]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitting(true);
        const formData = new FormData(e.target as HTMLFormElement);
        const allowedFlow = allowSignUp ? flow : "signIn";
        formData.set("flow", allowedFlow);
        if (allowedFlow === "signUp" && inviteCode) {
          formData.set("inviteCode", inviteCode);
        }
        void signIn("password", formData)
          .then(() => {
            setSubmitting(false);
          })
          .catch((error) => {
            let toastTitle = "";
            const msg = error?.message ?? "";
            if (msg.includes("InvalidAccountId")) {
              toastTitle = "الحساب غير موجود. يرجى إنشاء حساب جديد.";
            } else if (msg.includes("Invalid password")) {
              toastTitle = "كلمة المرور غير صحيحة. حاول مرة أخرى.";
            } else {
              toastTitle =
                allowedFlow === "signIn"
                  ? "تعذّر تسجيل الدخول. هل تقصد إنشاء حساب جديد؟"
                  : "تعذّر إنشاء الحساب. هل تقصد تسجيل الدخول؟";
            }
            toast.error(toastTitle);
            setSubmitting(false);
          });
      }}
    >
      {/* Email */}
      <div>
        <label className="block text-sm font-medium mb-2 text-white/80 text-right">
          البريد الإلكتروني
        </label>
        <input
          type="email"
          name="email"
          defaultValue={invitedEmail}
          placeholder="you@example.com"
          required
          dir="ltr"
          className="w-full px-4 py-3 rounded-lg bg-white/90 border border-white/20 text-slate-900 placeholder-slate-400 outline-none transition-all duration-200 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 text-right"
        />
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium mb-2 text-white/80 text-right">
          كلمة المرور
        </label>
        <input
          type="password"
          name="password"
          placeholder="••••••••"
          required
          dir="ltr"
          className="w-full px-4 py-3 rounded-lg bg-white/90 border border-white/20 text-slate-900 placeholder-slate-400 outline-none transition-all duration-200 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 text-right"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:scale-[1.02] hover:shadow-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {submitting
          ? "جاري المعالجة..."
          : flow === "signIn"
            ? "تسجيل الدخول"
            : "إنشاء حساب"}
      </button>

      {/* Toggle sign in / sign up */}
      {allowSignUp && !inviteCode && (
        <div className="text-center text-sm text-white/60">
          <span>
            {flow === "signIn"
              ? "ليس لديك حساب؟ "
              : "لديك حساب بالفعل؟ "}
          </span>
          <button
            type="button"
            className="font-semibold text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline transition-colors duration-200"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "إنشاء حساب" : "تسجيل الدخول"}
          </button>
        </div>
      )}
    </form>
  );
}
