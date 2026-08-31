import {
  DEFAULT_CURRENCY_CODE,
  getCurrencyDefinition,
  normalizeCurrencyCode,
  type CurrencyCode,
} from "../../shared/currency";

export const APP_LOCALE = "ar-EG-u-nu-latn";

export function formatNumberValue(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(APP_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safeValue);
}

export function formatCurrencyValue(
  value: number,
  currency: CurrencyCode | string | null | undefined = DEFAULT_CURRENCY_CODE,
): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const currencyCode = normalizeCurrencyCode(currency);
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safeValue);
}

export function currencyInputLabel(currency: CurrencyCode | string | null | undefined): string {
  const definition = getCurrencyDefinition(currency);
  return `${definition.labelAr} (${definition.code})`;
}
