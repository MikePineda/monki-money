import type User from '#models/user'
import { entitlementsFor } from '#config/plans'
import HouseholdMember from '#models/household_member'

/**
 * What the SPA needs after login and on every boot (`GET /auth/me`): the
 * user, their current household and membership (null when they have none),
 * the plan's entitlements and the household's feature flags.
 */
export async function describeSession(user: User) {
  const membership = user.currentHouseholdId
    ? await HouseholdMember.query()
        .where('household_id', user.currentHouseholdId)
        .where('user_id', user.id)
        .preload('household')
        .first()
    : null

  const household = membership?.household ?? null

  return {
    user,
    household,
    membership,
    entitlements: household ? entitlementsFor(household.plan) : null,
    flags: household?.settings.flags ?? [],
  }
}
