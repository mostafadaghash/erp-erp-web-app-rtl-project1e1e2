import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Currency Hook ────────────────────────────────────────────────────────────
// استخدم هذا الـ hook في أي صفحة بدل formatCurrency الثابتة
// const { currency, formatCurrency } = useCurrency();

export function useCurrency() {
  const currency = "EGP";
  const locale = "ar-EG-u-nu-latn";

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat(locale).format(amount);
  };

  return { currency, formatCurrency, formatAmount };
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
