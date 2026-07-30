import { isValidIsoDate, roundMoney } from "./businessRules.ts";

export type ReportingRange = {
  from: string;
  to: string;
};

export type ReversibleDatedAmount = {
  date: string;
  status: "posted" | "reversed";
  reversalDate?: string;
};

export function validateReportingRange(
  from: string,
  to: string,
  maxDays = 366,
): ReportingRange {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
    throw new RangeError("invalid reporting date");
  }
  if (from > to) {
    throw new RangeError("invalid reporting range");
  }
  const start = new Date(`${from}T00:00:00.000Z`).valueOf();
  const end = new Date(`${to}T00:00:00.000Z`).valueOf();
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days > maxDays) {
    throw new RangeError("reporting range is too large");
  }
  return { from, to };
}

export function dateInRange(date: string | undefined, range: ReportingRange) {
  return Boolean(date && date >= range.from && date <= range.to);
}

/**
 * Returns the document's activity in a reporting period.
 * A later reversal is a separate negative event on reversalDate.
 */
export function reversibleActivity(
  document: ReversibleDatedAmount,
  amount: number,
  range: ReportingRange,
) {
  let value = dateInRange(document.date, range) ? amount : 0;
  if (
    document.status === "reversed" &&
    dateInRange(document.reversalDate, range)
  ) {
    value -= amount;
  }
  return roundMoney(value);
}

export function percentage(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return roundMoney((numerator / denominator) * 100);
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function monthKeysInRange(range: ReportingRange) {
  const keys: string[] = [];
  let year = Number(range.from.slice(0, 4));
  let month = Number(range.from.slice(5, 7));
  const last = monthKey(range.to);
  while (`${year}-${String(month).padStart(2, "0")}` <= last) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}
