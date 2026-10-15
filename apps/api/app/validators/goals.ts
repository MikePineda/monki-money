import vine from '@vinejs/vine'
import { GOAL_STATUSES } from '@monkimoney/shared'
import { amount, id, idParams, isoDate, nonNegativeCents } from '#validators/rules'

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

export const listGoalsValidator = vine.create({
  status: vine.enum(GOAL_STATUSES).optional(),
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
