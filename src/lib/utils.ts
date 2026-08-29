import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const APP_LOCALE = "ar-EG-u-nu-latn";
export const APP_CURRENCY = "EGP";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAppNumber(amount: number): string {
  return new Intl.NumberFormat(APP_LOCALE).format(amount);
}

export function formatAppCurrency(amount: number): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: APP_CURRENCY,
    currencyDisplay: "code",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatAppDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(APP_LOCALE).format(new Date(value));
}

// استخدم هذا الـ hook في الصفحات للحفاظ على نفس تنسيق الأرقام والعملات.
export function useCurrency() {
  return {
    currency: APP_CURRENCY,
    formatCurrency: formatAppCurrency,
    formatAmount: formatAppNumber,
  };
}

export function normalizeEgyptPhoneForWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `20${digits}`;
  return digits;
}

export function buildEgyptWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizeEgyptPhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
}
