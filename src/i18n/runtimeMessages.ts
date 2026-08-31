import type { Language } from "./catalog";

const runtimeMessages = {
  ar: {
    runtimeTitle: "تعذر عرض النظام",
    runtimeDescription: "حدث خطأ أثناء تشغيل الواجهة. أعد المحاولة، وإذا استمر الخطأ فسيتم التعامل معه من سجل التشغيل.",
    retry: "إعادة المحاولة",
    unavailableTitle: "الخدمة غير متاحة مؤقتًا",
    unavailableDescription: "تعذر تشغيل النظام في الوقت الحالي. يرجى المحاولة مرة أخرى بعد قليل أو التواصل مع مسؤول النظام إذا استمرت المشكلة.",
  },
  en: {
    runtimeTitle: "Unable to Display the System",
    runtimeDescription: "An error occurred while running the interface. Try again, and if the problem continues it can be investigated from the runtime logs.",
    retry: "Try Again",
    unavailableTitle: "Service Temporarily Unavailable",
    unavailableDescription: "The system cannot start right now. Please try again shortly or contact the system administrator if the problem continues.",
  },
} as const;

export type RuntimeMessageKey = keyof typeof runtimeMessages.ar;

export function runtimeMessage(language: Language, key: RuntimeMessageKey): string {
  return runtimeMessages[language][key];
}
