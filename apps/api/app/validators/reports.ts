import vine from '@vinejs/vine'
import { id, idParams, month } from '#validators/rules'

/** Up to two years of history per request. */
const months = () => vine.number().withoutDecimals().min(1).max(24)

export const monthReportValidator = vine.create({
  month: month().optional(),
  paidByUserId: id().optional(),
})

export const trendReportValidator = vine.create({
  months: months().optional(),
  month: month().optional(),
  groupBy: vine.enum(['group', 'category'] as const).optional(),
})

export const categoryReportValidator = vine.create({
  params: idParams(),
  months: months().optional(),
  month: month().optional(),
})
