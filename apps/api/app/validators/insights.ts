import vine from '@vinejs/vine'
import { month } from '#validators/rules'

/** `{ params: { month } }` for `/insights/:month` ('YYYY-MM'). */
const monthParams = () => vine.object({ month: month() })

export const insightParamsValidator = vine.create({
  params: monthParams(),
})

export const generateInsightValidator = vine.create({
  params: monthParams(),
  force: vine.boolean().optional(),
})
