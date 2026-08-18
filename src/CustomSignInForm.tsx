"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
    if (!allowSignUp && flow === "signUp") setFlow("signIn");
  }, [allowSignUp, flow]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitting(true);
        const formData = new FormData(event.target as HTMLFormElement);
        const allowedFlow = allowSignUp ? flow : "signIn";
        formData.set("flow", allowedFlow);
        if (allowedFlow === "signUp" && inviteCode) formData.set("inviteCode", inviteCode);

        void signIn("password", formData)
          .then(() => setSubmitting(false))
          .catch((error) => {
            const message = String(error?.message ?? "");
            let friendlyMessage = "تعذر إكمال العملية. تحقق من البيانات وحاول مرة أخرى.";

            if (message.includes("InvalidAccountId")) {
              friendlyMessage = "لا يوجد حساب مسجل بهذا البريد الإلكتروني.";
            } else if (
              message.includes("Invalid password") ||
              message.includes("InvalidSecret") ||
              message.includes("Invalid credentials")
            ) {
              friendlyMessage = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
            } else if (allowedFlow === "signUp") {
              friendlyMessage = "تعذر إنشاء الحساب. راجع البيانات أو تواصل مع مسؤول النظام.";
            }

            toast.error(friendlyMessage);
            setSubmitting(false);
          });
      }}
    >
      <div>
        <label className="mb-2 block text-right text-sm font-bold text-slate-700">
          البريد الإلكتروني
        </label>
        <input
          type="email"
          name="email"
          defaultValue={invitedEmail}
          placeholder="name@company.com"
          required
          dir="ltr"
          autoComplete="email"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
        />
      </div>

      <div>
        <label className="mb-2 block text-right text-sm font-bold text-slate-700">
          كلمة المرور
        </label>
        <input
          type="password"
          name="password"
          placeholder="••••••••"
          required
          dir="ltr"
          autoComplete={flow === "signIn" ? "current-password" : "new-password"}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 w-full rounded-xl px-4 py-3 font-black text-white transition disabled:cursor-wait disabled:opacity-60"
        style={{ background: "var(--brand-primary)" }}
      >
        {submitting
          ? "جارٍ التحقق..."
          : flow === "signIn"
            ? "تسجيل الدخول"
            : "إنشاء الحساب"}
      </button>

      {allowSignUp && !inviteCode && (
        <div className="text-center text-sm text-slate-500">
          <span>{flow === "signIn" ? "تجهيز النظام لأول مرة؟ " : "لديك حساب بالفعل؟ "}</span>
          <button
            type="button"
            className="font-bold text-emerald-700 transition hover:text-emerald-800"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "إنشاء حساب المدير" : "تسجيل الدخول"}
          </button>
        </div>
      )}
    </form>
  );
}
