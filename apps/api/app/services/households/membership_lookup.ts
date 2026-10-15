import HouseholdMember from '#models/household_member'
import { FieldError } from '#exceptions/field_error'
import type { HouseholdRef } from '#models/mixins/household_scoped'

/**
 * Foreign-key guard for user ids sent in a body (account owner, card user):
 * the user must be a member of the household, otherwise 422 on `field`.
 */
export async function assertMemberOf(household: HouseholdRef, userId: number, field: string) {
  const membership = await HouseholdMember.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .where('user_id', userId)
    .first()
  if (!membership) throw new FieldError(field, 'database.exists')
}
