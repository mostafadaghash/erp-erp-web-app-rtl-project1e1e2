import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Clock3, MessageCircle, RotateCcw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS,
  CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS,
  CUSTOMER_WHATSAPP_OPERATION_LABELS,
  type CustomerWhatsAppMessageStatus,
  type CustomerWhatsAppMessageType,
} from "../../shared/customerWhatsAppMessageRules";
import { buildEgyptWhatsAppUrl, formatAppNumber } from "../lib/utils";

const BUSINESS_TIME_ZONE = "Africa/Cairo";

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(value));
}

function statusClass(status: CustomerWhatsAppMessageStatus): string {
  if (status === "succeeded") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "sent") return "bg-sky-50 text-sky-700 ring-sky-200";
  if (status === "failed") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "opened") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function CustomerWhatsAppCenter({ followUpId }: { followUpId: Id<"customerFollowUps"> }) {
  const center = useQuery(api.customerWhatsAppMessages.getCenter, { followUpId });
  const openManualAttempt = useMutation(api.customerWhatsAppMessages.openManualAttempt);
  const markManualResult = useMutation(api.customerWhatsAppMessages.markManualResult);

  const openWhatsApp = async (messageType: CustomerWhatsAppMessageType) => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      toast.error("المتصفح منع فتح نافذة واتساب");
      return;
    }
    popup.opener = null;
    try {
      const result = await openManualAttempt({ followUpId, messageType });
      if (result.blocked) {
        popup.close();
        toast.info(result.reason);
        return;
      }
      popup.location.href = buildEgyptWhatsAppUrl(result.phone, result.messageBody);
      toast.success("تم فتح واتساب بالرسالة الجاهزة — سجّل النتيجة بعد الإرسال");
    } catch (error) {
      popup.close();
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز رسالة واتساب");
    }
  };

  const recordResult = async (messageType: CustomerWhatsAppMessageType, result: "sent" | "failed") => {
    try {
      await markManualResult({
        followUpId,
        messageType,
        result,
        failureReason: result === "failed" ? "لم يكتمل الإرسال من واتساب" : undefined,
      });
      toast.success(result === "sent" ? "تم تسجيل الرسالة كمرسلة" : "تم تسجيل فشل الإرسال ويمكن إعادة المحاولة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل نتيجة الرسالة");
    }
  };

  if (center === undefined) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm text-slate-400">جاري تحميل مركز واتساب...</div>
      </section>
    );
  }
  if (!center.supported) return null;

  const visibleMessages = center.messages.filter((message) => message.applicable);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="customer-whatsapp-center">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div>
              <h4 className="font-black text-slate-900">مركز واتساب</h4>
              <p className="mt-0.5 text-xs text-slate-500">رسائل تشغيلية جاهزة داخل بطاقة العميل مع منع الإرسال المكرر.</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-black text-slate-800">{center.customerName}</span>
          <span className="mx-1.5 text-slate-300">•</span>
          {CUSTOMER_WHATSAPP_OPERATION_LABELS[center.operationType]} {center.operationNumber}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleMessages.map((message) => {
          const status = message.record?.status;
          const terminal = status === "sent" || status === "succeeded";
          const opened = status === "opened";
          const canOpen = message.eligible && !terminal && !opened;
          return (
            <article key={message.messageType} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-800">{message.label}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {message.eligible
                      ? "الرسالة متاحة للحالة الحالية"
                      : message.reason ?? "غير متاحة للحالة الحالية"}
                  </p>
                </div>
                {status ? (
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ring-1 ring-inset ${statusClass(status)}`}>
                    {CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS[status]}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-black text-slate-400 ring-1 ring-inset ring-slate-200">لم تُرسل</span>
                )}
              </div>

              {message.record && (
                <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                  <Clock3 className="h-3 w-3" />
                  <span>المحاولات: {formatAppNumber(message.record.attemptCount)}</span>
                  <span className="text-slate-300">•</span>
                  <span>{formatDateTime(message.record.updatedAt)}</span>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {opened ? (
                  <>
                    <button
                      type="button"
                      data-testid={`whatsapp-confirm-sent-${message.messageType}`}
                      onClick={() => void recordResult(message.messageType, "sent")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-black text-white"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> تم الإرسال
                    </button>
                    <button
                      type="button"
                      onClick={() => void recordResult(message.messageType, "failed")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-rose-700"
                    >
                      <XCircle className="h-3.5 w-3.5" /> فشل
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-testid={`whatsapp-message-${message.messageType}`}
                    disabled={!canOpen}
                    onClick={() => void openWhatsApp(message.messageType)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {status === "failed" ? <RotateCcw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                    {terminal
                      ? CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS[status]
                      : status === "failed"
                        ? "إعادة المحاولة"
                        : message.eligible
                          ? "فتح واتساب"
                          : "غير متاحة الآن"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h5 className="text-sm font-black text-slate-800">سجل رسائل العملية</h5>
            <p className="mt-0.5 text-[11px] text-slate-500">سجل واحد لكل عميل + عملية + نوع رسالة، مع حفظ كل المحاولات.</p>
          </div>
          <span className="text-[10px] font-bold text-slate-400">الأحدث أولًا</span>
        </div>
        {center.records.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">لم يتم إنشاء أي رسالة لهذه العملية بعد.</p>
        ) : (
          <div className="space-y-2">
            {center.records.map((record) => (
              <div key={record.messageKey} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs sm:grid-cols-[1.2fr_1fr_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-800">{CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS[record.messageType]}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">إنشاء: {formatDateTime(record.createdAt)}</p>
                </div>
                <div className="text-slate-600">
                  <span className="font-bold">{center.customerName}</span>
                  <span className="mx-1 text-slate-300">•</span>
                  <span>{center.operationNumber}</span>
                </div>
                <span className={`w-fit rounded-lg px-2 py-1 text-[10px] font-black ring-1 ring-inset ${statusClass(record.status)}`}>
                  {CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS[record.status]}
                </span>
                <span className="whitespace-nowrap font-bold text-slate-500">{formatAppNumber(record.attemptCount)} محاولة</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] leading-5 text-slate-400">
        الحالة «نجح» مهيأة في السجل لتحديثها تلقائيًا عند ربط WhatsApp Business API لاحقًا، بدون تغيير تصميم الصفحة.
      </p>
    </section>
  );
}
