import type HouseholdMember from '#models/household_member'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * A member as screens that only show who paid need them (`GET /auth/me`,
 * needs `user` preloaded): `id` is the user id (what `paidByUserId` holds),
 * the display name falls back to the full name. No email: that stays
 * behind `GET /household/members`.
 */
export default class MemberSummaryTransformer extends BaseTransformer<HouseholdMember> {
  toObject() {
    return {
      id: this.resource.userId,
      displayName: this.resource.displayName ?? this.resource.user.fullName,
      color: this.resource.color,
      role: this.resource.role,
    }
  }
}
