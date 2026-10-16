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
