import { merchantKey, normalizeDescription } from '#domain/importing/normalize'

/**
 * Merchant keys of recurring payments: the importer's normalized payee key
 * (`merchantKey`, app/domain/importing/normalize.ts), so a recurring item,
 * a merchant rule and an imported bank row agree on who was paid.
 */

/** What a ledger row says about who was paid. */
export interface PaymentSubject {
  /** `import_rows.merchant_key` of the bank row the transaction came from, if any. */
  bankMerchantKey: string | null
  payee: string | null
  rawDescription: string | null
}

/**
 * Key of a ledger row: its bank row's key when it was imported, else the
 * payee (or the bank text) the way merchant rules read a typed row.
 */
export function transactionMerchantKey(subject: PaymentSubject): string {
  if (subject.bankMerchantKey) return subject.bankMerchantKey
  const text = subject.rawDescription ?? subject.payee ?? ''
  return merchantKey({ nabMerchant: subject.payee, description: normalizeDescription(text) })
}

/** Key of a payee typed by a person (a recurring item added by hand). */
export function payeeMerchantKey(payee: string): string {
  return merchantKey({ nabMerchant: payee, description: normalizeDescription(payee) })
}

/**
 * Words that tell nothing about who was paid: a web domain (`.com`, `.au`)
 * or a company form (`Pty Ltd`). Typed names rarely carry them, bank rows
 * often do.
 */
const NOISE_WORDS = new Set([
  'au',
  'co',
  'com',
  'corp',
  'corporation',
  'inc',
  'io',
  'limited',
  'llc',
  'ltd',
  'net',
  'org',
  'pty',
  'the',
  'www',
])

/** A merchant key without its noise words (`streamflix com au` -> `streamflix`); '' when only noise. */
export function looseMerchantKey(key: string): string {
  return key
    .split(' ')
    .filter((word) => word !== '' && !NOISE_WORDS.has(word))
    .join(' ')
}

/**
 * True when two merchant keys name the same merchant: equal, or equal once
 * their noise words are dropped (`streamflix` and `streamflix com`). Never
 * a prefix or a shared word: `rent` is not `rentokil pest` nor `rent
 * harbour lettings`.
 */
export function keysNameTheSameMerchant(a: string, b: string): boolean {
  if (a === '' || b === '') return false
  if (a === b) return true
  const loose = looseMerchantKey(a)
  return loose !== '' && loose === looseMerchantKey(b)
}
