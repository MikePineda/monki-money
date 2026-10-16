import type { RecurringCadence, RecurringStatus } from '@monkimoney/shared'

/** Inputs of RecurringService. Amounts are positive integer cents, dates 'YYYY-MM-DD'. */

/** `POST /recurring`: a recurring payment typed by a person. */
export interface CreateRecurringInput {
  payee: string
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
 */
export interface UpdateRecurringInput extends Partial<CreateRecurringInput> {
  status?: RecurringStatus
}

/** `POST /recurring/detect`: how many items the run created and changed. */
export interface DetectionResult {
  created: number
  updated: number
}
