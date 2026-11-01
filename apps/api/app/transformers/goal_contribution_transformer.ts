import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import type GoalContribution from '#models/goal_contribution'

/** Money put into (positive) or taken out of (negative) a goal without an account. */
export default class GoalContributionTransformer extends BaseTransformer<GoalContribution> {
  toObject() {
    const contribution = this.resource
    return {
      id: contribution.id,
      goalId: contribution.goalId,
      /** Who logged it; null once that person is gone. */
      userId: contribution.userId,
      amountCents: contribution.amountCents,
      date: contribution.date,
      memo: contribution.memo,
      createdAt: isoTimestamp(contribution.createdAt)!,
    }
  }
}
