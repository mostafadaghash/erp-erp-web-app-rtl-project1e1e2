/** Validate user supplied money before any normalization can hide extra precision. */
export function assertMoneyInput(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || Math.round(value * 100) !== value * 100) {
    throw new Error(`${label} يجب أن يكون مبلغاً غير سالب بدقة منزلتين عشريتين كحد أقصى`);
  }
  return value;
}
