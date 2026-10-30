import { strict as assert } from 'node:assert'
import test from 'node:test'

import { normalizePhone } from '../infrastructure/counterparties/phone-normalization.js'

test('06.02 preserves display phone and normalizes common formatting', () => {
  assert.deepEqual(
    normalizePhone('+20 (100) 123-4567'),
    {
      displayPhone: '+20 (100) 123-4567',
      normalizedPhone: '201001234567',
    },
  )
})

test('06.02 treats leading + and 00 as equivalent international prefixes', () => {
  assert.equal(
    normalizePhone('+20 100 123 4567')?.normalizedPhone,
    '201001234567',
  )
  assert.equal(
    normalizePhone('0020-100-123-4567')?.normalizedPhone,
    '201001234567',
  )
})

test('06.02 maps Arabic-Indic and Extended Arabic-Indic digits to ASCII', () => {
  assert.equal(
    normalizePhone('٠١٠٠ ١٢٣ ٤٥٦٧')?.normalizedPhone,
    '01001234567',
  )
  assert.equal(
    normalizePhone('۰۱۰۰ ۱۲۳ ۴۵۶۷')?.normalizedPhone,
    '01001234567',
  )
})

test('06.02 does not infer a country code for local numbers', () => {
  assert.equal(
    normalizePhone('0100 123 4567')?.normalizedPhone,
    '01001234567',
  )
})

test('06.02 null/blank phone stays null and unsupported content is rejected', () => {
  assert.equal(normalizePhone(null), null)
  assert.equal(normalizePhone(undefined), null)
  assert.equal(normalizePhone('   '), null)

  assert.throws(
    () => normalizePhone('0100 ext 5'),
    /unsupported characters/,
  )
  assert.throws(
    () => normalizePhone('+'),
    /at least one digit/,
  )
})
