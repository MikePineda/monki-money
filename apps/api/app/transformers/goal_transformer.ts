import type SavingsGoal from '#models/savings_goal'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/** A savings goal. `userId` null = a goal of the household. */
export default class GoalTransformer extends BaseTransformer<SavingsGoal> {
  toObject() {
    const goal = this.resource
    return {
      id: goal.id,
      name: goal.name,
      targetCents: goal.targetCents,
      targetDate: goal.targetDate,
      startingCents: goal.startingCents,
      monthlyContributionCents: goal.monthlyContributionCents,
      accountId: goal.accountId,
      userId: goal.userId,
      status: goal.status,
      reachedAt: isoTimestamp(goal.reachedAt),
      sortOrder: goal.sortOrder,
      createdAt: isoTimestamp(goal.createdAt)!,
      updatedAt: isoTimestamp(goal.updatedAt)!,
    }
  }
}
