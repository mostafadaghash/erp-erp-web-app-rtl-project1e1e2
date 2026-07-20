import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Shield, User, Phone, LogOut, Check } from "lucide-react";

/**
 * Setup Wizard — shown when no admin exists in the system.
 * Guides the first user through:
 * 1. Sign in (via the locked SignInForm, shown first)
 * 2. Create admin profile (this form, shown after sign-in)
 */
export function SetupWizard() {
  const createFirstAdmin = useMutation(api.employees.createFirstAdmin);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("يرجى إدخال الاسم");
      return;
    }
    setSubmitting(true);
    try {
      await createFirstAdmin({ name: name.trim(), phone: phone.trim() || undefined });
      toast.success("تم إنشاء حساب المدير بنجاح! جاري تحميل النظام...");
      // Reload to transition into the main app
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء الإعداد");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-slate-900">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950/80 to-purple-950/60" />

      {/* Decorative circles */}
      <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-2xl shadow-indigo-500/30 mb-4">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-1">إعداد النظام</h1>
          <p className="text-slate-400 text-sm">إنشاء حساب المدير الأول للنظام</p>
        </div>

        {/* Setup Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl">
          {/* Info banner */}
          <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-indigo-500/30 rounded-lg flex items-center justify-center">
                <Check className="w-4 h-4 text-indigo-300" />
              </div>
              <div>
                <p className="text-indigo-200 text-sm font-medium">تم تسجيل الدخول بنجاح</p>
                <p className="text-indigo-300/70 text-xs mt-1">
                  أكمل بياناتك لإنشاء حساب المدير الأول. سيكون لديك صلاحيات كاملة على النظام.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                الاسم الكامل
              </label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="أدخل اسمك الكامل"
                  required
                  className="w-full pr-11 pl-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                رقم الهاتف <span className="text-slate-500 text-xs">(اختياري)</span>
              </label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                  className="w-full pr-11 pl-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none transition-all text-right"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-5 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "جاري الإعداد..." : "إنشاء حساب المدير"}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          سيكون لهذا الحساب صلاحيات كاملة لإدارة النظام والموظفين
        </p>
      </div>
    </div>
  );
}

/**
 * Fail-closed access screen for unprovisioned or inactive accounts.
 */
export function PendingApproval({
  status,
  userName,
}: {
  status: "pending" | "inactive";
  userName?: string;
}) {
  const { signOut } = useAuthActions();
  const inactive = status === "inactive";

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-slate-900">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950/80 to-purple-950/60" />
      <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-6 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-2xl shadow-amber-500/30 mb-6">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">
          {userName ? `مرحباً ${userName}` : "مرحباً بك"}
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-8">
          {inactive
            ? "هذا الحساب معطّل ولا يمكنه الوصول إلى بيانات النظام."
            : "هذا الحساب غير مربوط بموظف مصرح له داخل النظام."}
          <br />
          يرجى التواصل مع مدير النظام.
        </p>

        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
          <div className="flex items-center justify-center gap-2 text-slate-300 text-sm">
            <Shield className="w-4 h-4" />
            <span>لم يتم تحميل أي بيانات أو وحدات من نظام ERP</span>
          </div>
        </div>

        <button
          onClick={() => void signOut()}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg hover:scale-105 transition-all"
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
