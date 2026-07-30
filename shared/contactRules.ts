const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function latinDigit(character: string) {
  const arabic = ARABIC_DIGITS.indexOf(character);
  if (arabic >= 0) return String(arabic);
  const persian = PERSIAN_DIGITS.indexOf(character);
  return persian >= 0 ? String(persian) : character;
}

export function normalizeContactName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 100) {
    throw new RangeError("invalid contact name");
  }
  return normalized;
}

export function normalizeContactPhone(value: string) {
  let normalized = [...value]
    .map(latinDigit)
    .join("")
    .replace(/[\s()+\-./]/g, "");
  if (normalized.startsWith("0020")) {
    normalized = normalized.slice(4);
    if (normalized.startsWith("1")) normalized = `0${normalized}`;
  } else if (normalized.startsWith("20") && normalized.length >= 11) {
    normalized = normalized.slice(2);
    if (normalized.startsWith("1")) normalized = `0${normalized}`;
  }
  if (!/^\d{7,15}$/.test(normalized)) {
    throw new RangeError("invalid contact phone");
  }
  return normalized;
}

export function normalizeOptionalContactText(
  value: string | undefined,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new RangeError("contact text is too long");
  }
  return normalized;
}

export function normalizeContactEmail(value: string | undefined) {
  const normalized = normalizeOptionalContactText(value, 254)?.toLowerCase();
  if (
    normalized &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new RangeError("invalid contact email");
  }
  return normalized;
}
