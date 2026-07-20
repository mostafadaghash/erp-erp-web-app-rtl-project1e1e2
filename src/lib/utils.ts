import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Currency Hook ────────────────────────────────────────────────────────────
// استخدم هذا الـ hook في أي صفحة بدل formatCurrency الثابتة
// const { currency, formatCurrency } = useCurrency();

export function useCurrency() {
  const settings = useQuery(api.settings.get);
  const currency = settings?.currency ?? "ريال";

  const formatCurrency = (amount: number): string => {
    const formatted = new Intl.NumberFormat("ar-EG").format(amount);
    return `${formatted} ${currency}`;
  };

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat("ar-EG").format(amount);
  };

  return { currency, formatCurrency, formatAmount };
}
