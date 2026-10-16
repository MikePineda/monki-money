import type User from '#models/user'
import { entitlementsFor } from '#config/plans'
import type Household from '#models/household'
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

/**
 * The household's members (in the order of `GET /household/members`: who
 * joined first) and the partner, the first member who is not `user`, so
 * screens that only show names and colours need no other call. Nobody
 * without a household.
 */
export async function householdPeople(user: User, household: Household | null) {
  if (!household) return { members: [], partner: null }

  const members = await HouseholdMember.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .preload('user')
    .orderBy('joined_at', 'asc')
    .orderBy('id', 'asc')

  return {
    members,
    partner: members.find((member) => member.userId !== user.id) ?? null,
  }
}
