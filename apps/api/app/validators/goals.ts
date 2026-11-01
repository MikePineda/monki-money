import vine from '@vinejs/vine'
import { GOAL_STATUSES } from '@monkimoney/shared'
import type { FieldContext } from '@vinejs/vine/types'
import { amount, cents, id, idParams, isoDate, nonNegativeCents } from '#validators/rules'

/** A contribution moves money: 0.00 is not one. */
const notZeroRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (value === 0) field.report('The {{ field }} must not be 0', 'notZero', field)
})

const goalFields = {
  name: vine.string().trim().minLength(1).maxLength(80),
  targetCents: amount(),
  targetDate: isoDate().nullable().optional(),
  startingCents: nonNegativeCents().optional(),
  /** null = use the household's average monthly net instead. */
  monthlyContributionCents: nonNegativeCents().nullable().optional(),
  accountId: id().nullable().optional(),
  /** null = a goal of the household. */
  userId: id().nullable().optional(),
}

/** What `GET /goals?include=` can add to each goal. */
export const GOAL_INCLUDES = ['projection'] as const

export const listGoalsValidator = vine.create({
  status: vine.enum(GOAL_STATUSES).optional(),
  include: vine.enum(GOAL_INCLUDES).optional(),
})

export const createGoalValidator = vine.create(goalFields)

export const updateGoalValidator = vine.create({
  params: idParams(),
  ...goalFields,
  name: goalFields.name.optional(),
  targetCents: goalFields.targetCents.optional(),
  status: vine.enum(GOAL_STATUSES).optional(),
})

export const goalParamsValidator = vine.create({
  params: idParams(),
})

/** A goal without an account: what was put in (positive) or taken out (negative). */
export const createGoalContributionValidator = vine.create({
  params: idParams(),
  amountCents: cents().use(notZeroRule()),
  /** The household's day; a day after today answers 422 `date`/`future` (GoalService). */
  date: isoDate(),
  memo: vine.string().trim().maxLength(140).nullable().optional(),
})

export const goalContributionParamsValidator = vine.create({
  params: vine.object({ id: id(), contributionId: id() }),
})
