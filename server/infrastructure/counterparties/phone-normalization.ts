const ARABIC_INDIC_ZERO = '٠'.codePointAt(0) ?? 0
const EXTENDED_ARABIC_INDIC_ZERO = '۰'.codePointAt(0) ?? 0

function toAsciiDigit(character: string): string | null {
  const codePoint = character.codePointAt(0)
  if (codePoint === undefined) return null

  if (codePoint >= 0x30 && codePoint <= 0x39) {
    return character
  }

  if (
    codePoint >= ARABIC_INDIC_ZERO &&
    codePoint <= ARABIC_INDIC_ZERO + 9
  ) {
    return String(codePoint - ARABIC_INDIC_ZERO)
  }

  if (
    codePoint >= EXTENDED_ARABIC_INDIC_ZERO &&
    codePoint <= EXTENDED_ARABIC_INDIC_ZERO + 9
  ) {
    return String(codePoint - EXTENDED_ARABIC_INDIC_ZERO)
  }

  return null
}

const FORMATTING_CHARACTERS = new Set([
  ' ',
  '\t',
  '\n',
  '\r',
  '-',
  '‐',
  '‑',
  '‒',
  '–',
  '—',
  '(',
  ')',
  '[',
  ']',
  '.',
  '/',
])

export interface NormalizedPhone {
  displayPhone: string
  normalizedPhone: string
}

/**
 * Country-neutral V1 phone canonicalization.
 *
 * Architecture Baseline v1.7 requires a canonical normalized_phone used for
 * search/matching while preserving the display phone, but it does not define
 * a country-specific numbering plan. Therefore this function intentionally:
 *
 * - preserves the trimmed display form exactly;
 * - maps Latin, Arabic-Indic, and Extended Arabic-Indic digits to ASCII;
 * - removes formatting punctuation/whitespace;
 * - treats leading '+' and leading '00' as equivalent international prefixes;
 * - does NOT infer a country code for local numbers.
 *
 * Examples:
 *   "+20 100 123 4567" -> "201001234567"
 *   "0020-100-123-4567" -> "201001234567"
 *   "٠١٠٠ ١٢٣ ٤٥٦٧" -> "01001234567"
 *
 * A local "010..." number is deliberately not rewritten to "2010..." because
 * no default country/calling-code rule is frozen in the official baseline.
 */
export function normalizePhone(
  value: string | null | undefined,
): NormalizedPhone | null {
  if (value === null || value === undefined) return null

  const displayPhone = value.trim()
  if (displayPhone.length === 0) return null

  let digits = ''
  let sawLeadingPlus = false
  let sawAnyToken = false

  for (const character of displayPhone) {
    const digit = toAsciiDigit(character)
    if (digit !== null) {
      digits += digit
      sawAnyToken = true
      continue
    }

    if (FORMATTING_CHARACTERS.has(character)) {
      continue
    }

    if (character === '+' && !sawAnyToken && digits.length === 0) {
      sawLeadingPlus = true
      sawAnyToken = true
      continue
    }

    throw new TypeError(
      'phone contains unsupported characters',
    )
  }

  if (digits.length === 0) {
    throw new TypeError('phone must contain at least one digit')
  }

  if (sawLeadingPlus) {
    return Object.freeze({
      displayPhone,
      normalizedPhone: digits,
    })
  }

  const normalizedPhone = digits.startsWith('00')
    ? digits.slice(2)
    : digits

  if (normalizedPhone.length === 0) {
    throw new TypeError('phone must contain digits after prefix')
  }

  return Object.freeze({
    displayPhone,
    normalizedPhone,
  })
}
