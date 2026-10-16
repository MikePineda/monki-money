import vine from '@vinejs/vine'
import { RECURRING_CADENCES, RECURRING_STATUSES } from '@monkimoney/shared'
import { amount, id, idParams, isoDate } from '#validators/rules'

const recurringFields = {
  /** Display name; its merchant key (fixed at creation) is what payments match. */
  payee: vine.string().trim().minLength(1).maxLength(120),
  cadence: vine.enum(RECURRING_CADENCES),
  /** Typical amount, positive cents. */
  amountCents: amount(),
  nextExpectedDate: isoDate(),
  /** How far (in %) a payment may differ from the typical amount and still count. */
  amountTolerancePct: vine.number().withoutDecimals().min(0).max(100).optional(),
  categoryId: id().nullable().optional(),
  accountId: id().nullable().optional(),
  /** null = joint. */
  paidByUserId: id().nullable().optional(),
}

export const createRecurringValidator = vine.create({
  ...recurringFields,
  /** A suggestion's merchant key (lowercase words, as the importer writes them). */
  merchantKey: vine
    .string()
    .trim()
    .maxLength(255)
    .regex(/^[a-z]+( [a-z]+)*$/)
    .optional(),
})

export const updateRecurringValidator = vine.create({
  params: idParams(),
  ...recurringFields,
  payee: recurringFields.payee.optional(),
  cadence: recurringFields.cadence.optional(),
  amountCents: recurringFields.amountCents.optional(),
  nextExpectedDate: recurringFields.nextExpectedDate.optional(),
  status: vine.enum(RECURRING_STATUSES).optional(),
})

export const recurringParamsValidator = vine.create({
  params: idParams(),
})
