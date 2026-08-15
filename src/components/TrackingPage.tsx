import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Search, Wrench, CheckCircle, AlertCircle,
  Package, MessageCircle, ArrowRight
} from "lucide-react";
import { normalizeEgyptPhoneForWhatsApp } from "../lib/utils";

const statusSteps = [
  { key: "received",    label: "تم الاستلام",     icon: Package,      desc: "تم استلام جهازك وتسجيله في النظام" },
  { key: "in_progress", label: "قيد الإصلاح",     icon: Wrench,       desc: "فريقنا التقني يعمل على إصلاح جهازك الآن" },
  { key: "ready",       label: "جاهز للاستلام",   icon: CheckCircle,  desc: "تم إصلاح جهازك وهو جاهز للاستلام" },
  { key: "delivered",   label: "تم التسليم",       icon: CheckCircle,  desc: "تم تسليم الجهاز بنجاح" },
];

const statusOrder: Record<string, number> = {
  received: 0,
  in_progress: 1,
  ready: 2,
  delivered: 3,
  cancelled: -1,
};

export function TrackingPage() {
  const [token, setToken] = useState("");
  const [searchToken, setSearchToken] = useState("");
  const settings = useQuery(api.settings.getPublic);

  // Read token from URL hash
  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash;
      const match = hash.match(/#track=([A-Z0-9]+)/i);
      if (match) {
        const t = match[1].toUpperCase();
        setSearchToken(t);
        setToken(t);
      }
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const repair = useQuery(
    api.repairs.getByTracking,
    searchToken ? { token: searchToken } : "skip"
  );

  const storeName = settings?.storeName ?? "DAGHASH ERP";
  const whatsapp = settings?.whatsappNumber
    ? normalizeEgyptPhoneForWhatsApp(settings.whatsappNumber)
    : undefined;
  const primary = settings?.primaryColor ?? "#6366f1";
  const secondary = settings?.secondaryColor ?? "#8b5cf6";
  const gradBg = `linear-gradient(135deg, ${primary}, ${secondary})`;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    const upper = token.trim().toUpperCase();
    setSearchToken(upper);
    window.location.hash = "#track=" + upper;
  };

  const currentStep = repair ? (statusOrder[repair.status] ?? 0) : -1;
  const isCancelled = repair?.status === "cancelled";
  const isReady = repair?.status === "ready";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Decorative blobs */}
      <div
        className="fixed top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: primary }}
      />
      <div
        className="fixed bottom-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none"
        style={{ background: secondary }}
      />

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
              style={{ background: gradBg }}
            >
              <Wrench className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">{storeName}</p>
              <p className="text-slate-400 text-xs">متابعة طلب الصيانة</p>
            </div>
          </div>
          {whatsapp && (
            <a
              href={"https://wa.me/" + whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-medium hover:bg-emerald-500/30 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              تواصل معنا
            </a>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-10 animate-fade-in-up">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-2xl"
            style={{ background: gradBg }}
          >
            <Search className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-2">تتبع طلب الصيانة</h1>
          <p className="text-slate-400 text-sm">أدخل رمز التتبع الخاص بك لمعرفة حالة جهازك</p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-8 animate-fade-in-up">
          <div className="flex gap-3">
            <input
              className="flex-1 px-5 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/10 transition-all text-center font-mono text-lg tracking-widest uppercase"
              placeholder="أدخل رمز التتبع"
              value={token}
              onChange={e => setToken(e.target.value.toUpperCase())}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
            />
            <button
              type="submit"
              className="px-6 py-4 rounded-2xl text-white font-bold transition-all active:scale-95 shadow-lg flex items-center gap-2 flex-shrink-0"
              style={{ background: gradBg }}
            >
              <Search className="w-5 h-5" />
              <span className="hidden sm:inline">بحث</span>
            </button>
          </div>
        </form>

        {/* Loading */}
        {searchToken && repair === undefined && (
          <div className="text-center py-16 animate-fade-in-up">
            <div
              className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: primary, borderTopColor: "transparent" }}
            />
            <p className="text-slate-400 text-sm">جاري البحث...</p>
          </div>
        )}

        {/* Not Found */}
        {searchToken && repair === null && (
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center animate-fade-in-up">
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-white font-bold text-lg mb-2">لم يتم العثور على الطلب</h2>
            <p className="text-slate-400 text-sm mb-6">
              الرمز{" "}
              <span className="font-mono text-white font-bold bg-white/10 px-2 py-0.5 rounded-lg">
                {searchToken}
              </span>{" "}
              غير موجود في النظام.
              <br />تأكد من الرمز وحاول مجدداً.
            </p>
            {whatsapp && (
              <a
                href={"https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("مرحباً، أريد الاستفسار عن طلب الصيانة")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                تواصل مع المنشأة
              </a>
            )}
          </div>
        )}

        {/* Repair Found */}
        {repair && (
          <div className="space-y-5 animate-fade-in-up">

            {/* Main Card */}
            <div className="bg-white/8 backdrop-blur-sm border border-white/15 rounded-3xl overflow-hidden">

              {/* Card Header */}
              <div
                className="px-6 py-5"
                style={{ background: `linear-gradient(135deg, ${primary}30, ${secondary}20)` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-slate-400 text-xs mb-1">رقم الطلب</p>
                    <p className="font-mono font-black text-white text-xl tracking-wider">{repair.repairNumber}</p>
                    <p className="text-slate-400 text-xs mt-1">{repair.customerName}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {isCancelled ? (
                      <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                        ملغي
                      </span>
                    ) : (
                      <span
                        className="px-3 py-1.5 rounded-full text-xs font-bold text-white"
                        style={{ background: gradBg }}
                      >
                        {statusSteps[currentStep]?.label ?? "مستلم"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Device Info */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-500 text-xs mb-1">الجهاز</p>
                    <p className="text-white font-bold">{repair.deviceBrand} {repair.deviceModel}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{repair.deviceType}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1">المشكلة</p>
                    <p className="text-white text-sm font-medium leading-relaxed">{repair.problem}</p>
                  </div>
                  {repair.diagnosis && (
                    <div className="col-span-2 bg-white/5 rounded-xl p-3">
                      <p className="text-slate-500 text-xs mb-1">التشخيص</p>
                      <p className="text-slate-300 text-sm">{repair.diagnosis}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Info */}
              <div className="px-6 py-4 border-b border-white/10">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-slate-500 text-xs mb-1">التكلفة الإجمالية</p>
                    <p className="text-white font-black text-xl">{repair.totalCost.toLocaleString("ar-EG")}</p>
                    <p className="text-slate-500 text-xs">ج.م</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1">المدفوع</p>
                    <p className="text-emerald-400 font-black text-xl">{repair.deposit.toLocaleString("ar-EG")}</p>
                    <p className="text-slate-500 text-xs">ج.م</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1">المتبقي</p>
                    <p className={`font-black text-xl ${repair.remaining > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {repair.remaining.toLocaleString("ar-EG")}
                    </p>
                    <p className="text-slate-500 text-xs">ج.م</p>
                  </div>
                </div>
              </div>

              {/* Dates & Technician */}
              <div className="px-6 py-4">
                <div className="flex items-center justify-between flex-wrap gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs">تاريخ الاستلام</p>
                    <p className="text-slate-300 font-medium mt-0.5">{repair.receivedDate}</p>
                  </div>
                  {repair.expectedDate && (
                    <div className="text-center">
                      <p className="text-slate-500 text-xs">التسليم المتوقع</p>
                      <p className="text-slate-300 font-medium mt-0.5">{repair.expectedDate}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress Steps */}
            {!isCancelled && (
              <div className="bg-white/8 backdrop-blur-sm border border-white/15 rounded-3xl p-6">
                <h2 className="text-white font-bold mb-6 text-sm flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full" style={{ background: gradBg }} />
                  مراحل الصيانة
                </h2>
                <div>
                  {statusSteps.map((step, i) => {
                    const Icon = step.icon;
                    const isDone = i <= currentStep;
                    const isCurrent = i === currentStep;
                    const isLast = i === statusSteps.length - 1;
                    return (
                      <div key={step.key} className="flex gap-4">
                        {/* Icon + connector line */}
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500"
                            style={isDone
                              ? { background: gradBg, boxShadow: isCurrent ? `0 0 0 4px ${primary}30` : "none" }
                              : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }
                            }
                          >
                            <Icon className={`w-4 h-4 ${isDone ? "text-white" : "text-slate-600"}`} />
                          </div>
                          {!isLast && (
                            <div
                              className="w-0.5 flex-1 my-1.5 rounded-full transition-all duration-500"
                              style={{
                                minHeight: "28px",
                                background: i < currentStep ? primary : "rgba(255,255,255,0.08)"
                              }}
                            />
                          )}
                        </div>

                        {/* Text */}
                        <div className={`flex-1 ${isLast ? "pb-0" : "pb-6"}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-bold text-sm ${isDone ? "text-white" : "text-slate-500"}`}>
                              {step.label}
                            </p>
                            {isCurrent && (
                              <span
                                className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ background: primary + "25", color: primary }}
                              >
                                الحالة الحالية
                              </span>
                            )}
                          </div>
                          <p className={`text-xs mt-0.5 leading-relaxed ${isDone ? "text-slate-400" : "text-slate-600"}`}>
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cancelled */}
            {isCancelled && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6 text-center">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                <p className="text-red-300 font-bold mb-1">تم إلغاء الطلب</p>
                <p className="text-slate-400 text-sm">للاستفسار يرجى التواصل مع المنشأة مباشرة</p>
              </div>
            )}

            {/* Ready Banner */}
            {isReady && (
              <div
                className="rounded-3xl p-6 text-center"
                style={{
                  background: `linear-gradient(135deg, ${primary}20, ${secondary}15)`,
                  border: `1px solid ${primary}35`
                }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: gradBg }}
                >
                  <CheckCircle className="w-7 h-7 text-white" />
                </div>
                <p className="text-white font-black text-xl mb-1">جهازك جاهز للاستلام!</p>
                <p className="text-slate-400 text-sm mb-5">
                  يمكنك زيارة المنشأة لاستلام جهازك
                  {repair.remaining > 0 && (
                    <span className="text-amber-400 font-bold">
                      {" "}والمبلغ المتبقي {repair.remaining.toLocaleString("ar-EG")} ج.م
                    </span>
                  )}
                </p>
                {whatsapp && (
                  <a
                    href={"https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("مرحباً، جهازي جاهز للاستلام - رقم الطلب: " + repair.repairNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    <MessageCircle className="w-4 h-4" />
                    تأكيد موعد الاستلام
                  </a>
                )}
              </div>
            )}

            {/* WhatsApp Contact */}
            {whatsapp && !isReady && !isCancelled && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-white text-sm font-medium">هل لديك استفسار؟</p>
                  <p className="text-slate-400 text-xs mt-0.5">تواصل معنا مباشرة عبر واتساب</p>
                </div>
                <a
                  href={"https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("مرحباً، أريد الاستفسار عن طلب الصيانة رقم: " + repair.repairNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors flex-shrink-0 shadow-lg shadow-emerald-500/20"
                >
                  <MessageCircle className="w-4 h-4" />
                  واتساب
                </a>
              </div>
            )}

            {/* Search Again */}
            <button
              onClick={() => {
                setToken("");
                setSearchToken("");
                window.location.hash = "#track";
              }}
              className="w-full flex items-center justify-center gap-2 py-3 text-slate-500 hover:text-slate-300 transition-colors text-sm"
            >
              <ArrowRight className="w-4 h-4" />
              البحث عن طلب آخر
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 pt-6 border-t border-white/10">
          <p className="text-slate-600 text-xs">{storeName} • نظام إدارة الأعمال</p>
        </div>
      </main>
    </div>
  );
}
