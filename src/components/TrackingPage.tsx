import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { isValidCustomerTrackingToken } from "../../shared/customerTrackingPortalRules";

type PortalStep = {
  key: string;
  label: string;
  state: "completed" | "current" | "upcoming" | "stopped";
};

type VerifiedTracking = {
  sourceNumber: string;
  sourceType: "order" | "repair" | "delivery";
  sourceTypeLabel: string;
  status: string;
  currentStatus: string;
  lastUpdatedAt: number;
  steps: PortalStep[];
};

function readTrackingToken(): string {
  const hash = window.location.hash;
  const match = hash.match(/^#track=([a-f0-9]{64})$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function formatPortalDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(timestamp));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught ConvexError:\s*(.*?)(?:\n|$)/);
    if (match?.[1]) return match[1].trim();
    return error.message.replace(/^Error:\s*/, "").trim();
  }
  return "تعذر التحقق من بيانات المتابعة";
}

function StepIcon({ state }: { state: PortalStep["state"] }) {
  if (state === "completed") return <Check className="h-4 w-4" />;
  if (state === "current") return <Clock3 className="h-4 w-4" />;
  if (state === "stopped") return <Ban className="h-4 w-4" />;
  return <Circle className="h-3.5 w-3.5" />;
}

export function TrackingPage() {
  const token = useMemo(readTrackingToken, []);
  const verify = useMutation(api.customerTrackingPortal.verify);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [result, setResult] = useState<VerifiedTracking | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const validToken = isValidCustomerTrackingToken(token);

  const submitVerification = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!validToken || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const verified = await verify({ token, phoneLast4 });
      setResult(verified as VerifiedTracking);
    } catch (verificationError) {
      setResult(null);
      setError(getErrorMessage(verificationError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-gradient-to-b from-indigo-500/10 to-transparent" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-500/15">
            <ShieldCheck className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <p className="text-base font-extrabold text-white">بوابة متابعة العميل</p>
            <p className="text-xs text-slate-400">عرض آمن ومختصر لحالة العملية</p>
          </div>
        </header>

        {!validToken ? (
          <section className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-6 text-center sm:p-10">
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-rose-300" />
            <h1 className="mb-2 text-xl font-black text-white">رابط المتابعة غير صالح</h1>
            <p className="text-sm leading-7 text-slate-300">
              استخدم رابط المتابعة الذي تم إرساله لك من المنشأة. لا يمكن البحث عن العمليات من هذه الصفحة.
            </p>
          </section>
        ) : !result ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/20">
                <PackageCheck className="h-7 w-7 text-emerald-300" />
              </div>
              <h1 className="text-2xl font-black text-white">تحقق من رقم الهاتف</h1>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                لأمان بيانات العملية، أدخل آخر 4 أرقام من رقم الهاتف المسجل عليها.
              </p>
            </div>

            <form onSubmit={submitVerification} className="mx-auto max-w-sm space-y-4">
              <div>
                <label htmlFor="tracking-phone-last4" className="mb-2 block text-sm font-bold text-slate-200">
                  آخر 4 أرقام من الهاتف
                </label>
                <input
                  id="tracking-phone-last4"
                  data-testid="tracking-phone-last4"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  value={phoneLast4}
                  onChange={(event) => {
                    const normalized = event.target.value
                      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
                      .replace(/\D/g, "")
                      .slice(0, 4);
                    setPhoneLast4(normalized);
                    setError("");
                  }}
                  placeholder="0000"
                  className="w-full rounded-2xl border border-white/15 bg-slate-900/80 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.35em] text-white outline-none transition focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                data-testid="tracking-verify"
                disabled={submitting || phoneLast4.length !== 4}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-extrabold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {submitting ? "جاري التحقق..." : "عرض حالة العملية"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-6 text-slate-500">
              لا يعرض هذا الرابط أي بيانات مالية أو ملاحظات داخلية أو بيانات موظفين.
            </p>
          </section>
        ) : (
          <div className="space-y-5" data-testid="tracking-public-result">
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/20">
              <div className="border-b border-white/10 bg-gradient-to-l from-indigo-500/15 to-emerald-500/10 p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-400">رقم العملية</p>
                    <h1 className="mt-1 font-mono text-2xl font-black tracking-wide text-white">{result.sourceNumber}</h1>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-3 py-1.5 text-xs font-extrabold text-emerald-200">
                    {result.status}
                  </span>
                </div>
              </div>

              <div className="grid gap-px bg-white/10 sm:grid-cols-2">
                {[
                  ["نوع العملية", result.sourceTypeLabel],
                  ["الحالة", result.status],
                  ["آخر تحديث", formatPortalDate(result.lastUpdatedAt)],
                  ["الحالة الحالية", result.currentStatus],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-950/75 p-5">
                    <p className="text-xs font-bold text-slate-500">{label}</p>
                    <p className="mt-1.5 text-sm font-extrabold text-slate-100">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            {result.steps.length > 0 && (
              <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 sm:p-7">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-black text-white">خطوات التنفيذ / التوصيل</h2>
                    <p className="mt-1 text-xs text-slate-500">يتم تحديث الخطوات حسب حالة العملية المسجلة</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-indigo-300" />
                </div>

                <div className="space-y-1">
                  {result.steps.map((step, index) => {
                    const active = step.state === "current";
                    const done = step.state === "completed";
                    const stopped = step.state === "stopped";
                    return (
                      <div key={step.key} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                              done
                                ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-200"
                                : active
                                  ? "border-indigo-400/40 bg-indigo-500/25 text-indigo-100 ring-4 ring-indigo-500/10"
                                  : stopped
                                    ? "border-rose-400/30 bg-rose-500/20 text-rose-200"
                                    : "border-white/10 bg-white/5 text-slate-600"
                            }`}
                          >
                            <StepIcon state={step.state} />
                          </div>
                          {index < result.steps.length - 1 && (
                            <div className={`my-1 h-6 w-px ${done ? "bg-emerald-400/35" : "bg-white/10"}`} />
                          )}
                        </div>
                        <div className="pt-2">
                          <p className={`text-sm font-bold ${active || done ? "text-slate-100" : stopped ? "text-rose-200" : "text-slate-500"}`}>
                            {step.label}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <button
              type="button"
              onClick={() => void submitVerification()}
              disabled={submitting}
              className="mx-auto flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${submitting ? "animate-spin" : ""}`} />
              تحديث الحالة
            </button>
          </div>
        )}

        <footer className="mt-auto pt-10 text-center text-[11px] leading-6 text-slate-600">
          الرابط مخصص لمتابعة حالة العملية فقط ولا يمنح صلاحية الدخول إلى النظام.
        </footer>
      </main>
    </div>
  );
}
