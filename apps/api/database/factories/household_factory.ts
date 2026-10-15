import { DateTime } from 'luxon'
import Household from '#models/household'
import factory from '@adonisjs/lucid/factories'
import HouseholdMember from '#models/household_member'
import { UserFactory } from '#database/factories/user_factory'

/** Memberships; `.with('user')` creates the member's user. */
export const HouseholdMemberFactory = factory
  .define(HouseholdMember, () => ({
    role: 'member' as const,
    joinedAt: DateTime.now(),
  }))
  .state('owner', (member) => {
    member.role = 'owner'
  })
  .relation('user', () => UserFactory)
  .build()

/**
 * Synthetic households. `HouseholdFactory.with('members', 2, (m) => m.with('user'))`
 * builds a household with two members; prefer `createHousehold()` from
 * tests/helpers/household.ts, which also wires owner role and the users'
 * current household.
 */
export const HouseholdFactory = factory
  .define(Household, ({ faker }) => ({
    name: `${faker.word.adjective()} home`,
    plan: 'free' as const,
    status: 'active' as const,
    currencyCode: 'AUD',
    locale: 'en' as const,
    timezone: 'Australia/Brisbane',
    settings: {},
  }))
  .state('spanish', (household) => {
    household.locale = 'es'
  })
  .relation('members', () => HouseholdMemberFactory)
  .build()
