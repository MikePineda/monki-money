import vine from '@vinejs/vine'
import { PAYSLIP_MAX_DEDUCTIONS } from '@monkimoney/shared'
import { amount, id, idParams, isoDate, uuid } from '#validators/rules'

const memo = () => vine.string().trim().maxLength(255).nullable()

/**
 * `POST /payslips`. Exactly one of `transferId` (a transfer that already
 * left the account) or `toAccountId` (create that transfer for the net)
 * is checked by the service, together with `gross - deductions = net`.
 */
export const createPayslipValidator = vine.create({
  clientId: uuid().optional(),
  accountId: id(),
  date: isoDate(),
  /** null = joint; omitted = the account's owner. */
  userId: id().nullable().optional(),
  grossCents: amount(),
  deductions: vine
    .array(
      vine.object({
        categoryId: id(),
        amountCents: amount(),
        memo: memo().optional(),
      })
    )
    .maxLength(PAYSLIP_MAX_DEDUCTIONS),
  transferId: id().optional(),
  toAccountId: id().optional(),
  memo: memo().optional(),
})

export const listPayslipsValidator = vine.create({
  accountId: id().optional(),
})

export const payslipCandidatesValidator = vine.create({
  accountId: id(),
})

export const payslipParamsValidator = vine.create({
  params: idParams(),
})
