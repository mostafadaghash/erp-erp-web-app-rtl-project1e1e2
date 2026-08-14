export const BUSINESS_TIME_ZONE = "Africa/Cairo";

export function businessDate(
  now: Date | number = Date.now(),
  timeZone = BUSINESS_TIME_ZONE,
) {
  const date = typeof now === "number" ? new Date(now) : now;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) throw new Error("Unable to resolve business date");
  return `${year}-${month}-${day}`;
}
