import type { RecurringCadence, RecurringStatus } from '@monkimoney/shared'

/** Inputs of RecurringService. Amounts are positive integer cents, dates 'YYYY-MM-DD'. */

/** `POST /recurring`: a recurring payment typed by a person. */
export interface CreateRecurringInput {
  payee: string
  /**
   * The merchant key of a suggestion (`GET /recurring/merchants`), so the
   * item matches the bank's rows; omitted = the payee's own key.
   */
  merchantKey?: string
  cadence: RecurringCadence
  amountCents: number
  nextExpectedDate: string
  /** Default 15. */
  amountTolerancePct?: number
  categoryId?: number | null
  accountId?: number | null
  /** null or omitted = joint. */
  paidByUserId?: number | null
}

/**
 * `PATCH /recurring/:id`: only the given fields change; each one becomes a
 * person's edit that detection keeps. `status` pauses, resumes or dismisses.
 * `merchantKey` links an item typed by hand to the bank merchant a person
 * picked from the suggestions (a detected item's key never changes).
 */
export interface UpdateRecurringInput extends Partial<CreateRecurringInput> {
  status?: RecurringStatus
}

/** A merchant the household paid lately, offered when adding an item by hand. */
export interface MerchantSuggestion {
  merchantKey: string
  /** The latest payee name of its payments. */
  payee: string
  /** The latest amount paid, positive cents. */
  amountCents: number
  lastPaidDate: string
  /** Payments in the period. */
  count: number
}

/** `POST /recurring/detect`: how many items the run created and changed. */
export interface DetectionResult {
  created: number
  updated: number
}
