import type HouseholdMember from '#models/household_member'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/** A member of the household as listed to the others (needs `user` preloaded). */
export default class MemberTransformer extends BaseTransformer<HouseholdMember> {
  toObject() {
    return {
      id: this.resource.id,
      userId: this.resource.userId,
      fullName: this.resource.user.fullName,
      email: this.resource.user.email,
      role: this.resource.role,
      displayName: this.resource.displayName,
      color: this.resource.color,
      joinedAt: isoTimestamp(this.resource.joinedAt)!,
    }
  }
}
