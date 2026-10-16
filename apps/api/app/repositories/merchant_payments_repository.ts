import db from '@adonisjs/lucid/services/db'
import type { Payment } from '#domain/recurring/detection'
import type { PrivacySubject } from '#domain/ledger/privacy'
import { payeeMerchantKey, transactionMerchantKey } from '#domain/recurring/merchant_key'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'

type PaymentRow = {
  id: number
  date: string
  amount_cents: number
  payee: string | null
  raw_description: string | null
  bank_merchant_key: string | null
  category_id: number | null
  account_id: number
  paid_by_user_id: number | null
  created_by_user_id: number | null
  is_private: boolean
}

/** A payment with what privacy needs to know about its ledger row. */
export type LedgerPayment = Payment & PrivacySubject

/**
 * Whole expense transactions seen as payments to a merchant, for recurring
 * payments (app/domain/recurring). Unlike report postings, split lines are
 * not flattened: a payment is what left the account, once. Transfers and
 * money coming in (refunds, income) are never payments. The merchant key
 * is the bank row's when the transaction was imported, else its payee's
 * (app/domain/recurring/merchant_key.ts); the payee key is always the
 * payee's, so an item typed by hand ("Rent") matches the imported row the
 * person named that way.
 */
export default class MerchantPaymentsRepository {
  /** Payments of the household dated `from`..`to` (inclusive), oldest first. */
  async between(household: HouseholdRef, from: string, to: string): Promise<LedgerPayment[]> {
    const result = await db.rawQuery<{ rows: PaymentRow[] }>(
      `SELECT t.id,
              t.date,
              t.amount_cents,
              t.payee,
              t.raw_description,
              bank.merchant_key AS bank_merchant_key,
              t.category_id,
              t.account_id,
              t.paid_by_user_id,
              t.created_by_user_id,
              t.is_private
         FROM transactions t
         LEFT JOIN LATERAL (
           SELECT r.merchant_key
             FROM import_rows r
            WHERE r.transaction_id = t.id
              AND r.household_id = t.household_id
              AND r.merchant_key <> ''
            ORDER BY r.id DESC
            LIMIT 1
         ) bank ON true
        WHERE t.household_id = ?
          AND t.kind = 'expense'
          AND t.amount_cents < 0
          AND t.date BETWEEN ? AND ?
        ORDER BY t.date, t.id`,
      [householdIdOf(household), from, to]
    )

    return result.rows.map((row) => ({
      transactionId: row.id,
      date: row.date,
      amountCents: -row.amount_cents,
      merchantKey: transactionMerchantKey({
        bankMerchantKey: row.bank_merchant_key,
        payee: row.payee,
        rawDescription: row.raw_description,
      }),
      payeeKey: row.payee ? payeeMerchantKey(row.payee) : '',
      payee: row.payee,
      categoryId: row.category_id,
      accountId: row.account_id,
      paidByUserId: row.paid_by_user_id,
      createdByUserId: row.created_by_user_id,
      isPrivate: row.is_private,
    }))
  }
}
