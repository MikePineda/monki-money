import type HouseholdMember from '#models/household_member'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/** The caller's own membership (role in the current household). */
export default class MembershipTransformer extends BaseTransformer<HouseholdMember> {
  toObject() {
    return {
      id: this.resource.id,
      householdId: this.resource.householdId,
      role: this.resource.role,
      displayName: this.resource.displayName,
      color: this.resource.color,
      joinedAt: isoTimestamp(this.resource.joinedAt)!,
    }
  }
}
