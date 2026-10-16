import type User from '#models/user'
import { BasePolicy } from '@adonisjs/bouncer'
import type HouseholdMember from '#models/household_member'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'

/**
 * Household roles. Every action receives the caller's membership of the
 * current household (ctx.membership), so it can only ever authorize inside
 * that household. Owners manage; members use.
 */
export default class HouseholdPolicy extends BasePolicy {
  update(_user: User, membership: HouseholdMember): AuthorizerResponse {
    return membership.isOwner
  }

  manageMembers(_user: User, membership: HouseholdMember): AuthorizerResponse {
    return membership.isOwner
  }

  invite(_user: User, membership: HouseholdMember): AuthorizerResponse {
    return membership.isOwner
  }

  delete(_user: User, membership: HouseholdMember): AuthorizerResponse {
    return membership.isOwner
  }

  export(_user: User, membership: HouseholdMember): AuthorizerResponse {
    return membership.isOwner
  }

  transferOwnership(_user: User, membership: HouseholdMember): AuthorizerResponse {
    return membership.isOwner
  }
}
