import type Household from '#models/household'
import HouseholdMember from '#models/household_member'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { HouseholdPendingDeletion, HouseholdSuspended, NoHousehold } from '#exceptions/errors'

/**
 * Runs after `auth`: loads the membership of the user's current household
 * and exposes `ctx.household` / `ctx.membership`. Every household-scoped
 * query starts from `ctx.household`. 403 when the user is not a member,
 * when the household is suspended (E_HOUSEHOLD_SUSPENDED), or when it is
 * scheduled for deletion (E_HOUSEHOLD_PENDING_DELETION) except on routes that
 * opt in with `allowPendingDeletion` (restore).
 */
export default class HouseholdContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { allowPendingDeletion?: boolean } = {}) {
    const user = ctx.auth.getUserOrFail()
    if (!user.currentHouseholdId) throw new NoHousehold()

    const membership = await HouseholdMember.query()
      .where('household_id', user.currentHouseholdId)
      .where('user_id', user.id)
      .preload('household')
      .first()
    if (!membership) throw new NoHousehold()

    const { status } = membership.household
    if (status === 'suspended') throw new HouseholdSuspended()
    if (status === 'pending_deletion' && !options.allowPendingDeletion) {
      throw new HouseholdPendingDeletion()
    }

    ctx.household = membership.household
    ctx.membership = membership
    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /** Set by household_context_middleware; only read it on routes that use it. */
    household: Household
    /** Set by household_context_middleware; only read it on routes that use it. */
    membership: HouseholdMember
  }
}
