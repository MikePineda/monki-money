import HouseholdMember from '#models/household_member'
import type { PrivacyViewer } from '#domain/ledger/privacy'
import type { HouseholdRef } from '#models/mixins/household_scoped'

/**
 * The reader of the ledger as the privacy rule needs it: their id and the
 * current members of the household (a private row whose owner left is no
 * longer private, see app/domain/ledger/privacy.ts).
 */
export async function privacyViewer(
  household: HouseholdRef,
  user: { id: number }
): Promise<PrivacyViewer> {
  const members = await HouseholdMember.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .select('user_id')
  return { userId: user.id, memberIds: new Set(members.map((member) => member.userId)) }
}
