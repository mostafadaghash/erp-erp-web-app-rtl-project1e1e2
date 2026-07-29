import { ConvexError } from "convex/values";

export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
export const normalizeRequestId = (value: string) => {
  const result = normalizeText(value);
  if (!result || result.length > 120) throw new ConvexError("معرف الطلب غير صالح");
  return result;
};
export function assertIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10) !== value) throw new ConvexError("التاريخ يجب أن يكون ISO صحيحًا");
  return value;
}
export const periodKeyOf = (date: string) => assertIsoDate(date).slice(0,7);
export function toCents(value: number): number {
  const cents = Math.round(value * 100);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    Math.abs(value - cents / 100) > 1e-9
  ) {
    throw new ConvexError("المبلغ يجب أن يكون غير سالب وبدقة قرشين");
  }
  return cents;
}
export const fromCents = (value: number) => value / 100;
export const fingerprint = (value: unknown) => JSON.stringify(value);
