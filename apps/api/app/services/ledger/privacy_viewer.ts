import Payslip from '#models/payslip'
import HouseholdMember from '#models/household_member'
import type { HouseholdRef } from '#models/mixins/household_scoped'
import { isHiddenFrom, type LedgerViewer, type PrivacyViewer } from '#domain/ledger/privacy'

/**
 * The reader of the ledger as the privacy rule needs it: their id and the
 * current members of the household (a private row whose owner left is no
 * longer private, see app/domain/ledger/privacy.ts).
 */
export async function privacyViewer(
  household: HouseholdRef,
  user: { id: number }
): Promise<PrivacyViewer> {
  return { userId: user.id, memberIds: await householdMemberIds(household) }
}

/** Ids of the current members (for content every member reads, see postingsForHousehold). */
export async function householdMemberIds(household: HouseholdRef): Promise<Set<number>> {
  const members = await HouseholdMember.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .select('user_id')
  return new Set(members.map((member) => member.userId))
}

/**
 * The reader of rows on `transferIds` (the transfers of the rows about to
 * be shown): {@link privacyViewer} plus the payslip memos it may not read
 * on them (see {@link hiddenPayslipMemosOn}).
 */
export async function ledgerViewer(
  household: HouseholdRef,
  user: { id: number },
  transferIds: Iterable<number | null>
): Promise<LedgerViewer> {
  const viewer = await privacyViewer(household, user)
  return {
    ...viewer,
    hiddenPayslipMemos: await hiddenPayslipMemosOn(household, viewer, transferIds),
  }
}

/**
 * Memos of payslips whose gross line `viewer` may not see, by the transfer
 * they were copied to: a payslip that creates its transfer gives it its
 * memo, and the transfer gives it to both legs' description. Only the
 * given transfers are read (the rows of one page or one sheet). The
 * household export has its own paged reader (`hiddenPayslipMemos`).
 */
export async function hiddenPayslipMemosOn(
  household: HouseholdRef,
  viewer: PrivacyViewer,
  transferIds: Iterable<number | null>
): Promise<Map<number, string>> {
  const ids = [...new Set(transferIds)].filter((id): id is number => id !== null)
  const memos = new Map<number, string>()
  if (ids.length === 0) return memos

  const payslips = await Payslip.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .whereIn('transfer_id', ids)
    .whereNotNull('memo')
    .preload('lines', (lines) =>
      lines
        .where('kind', 'income')
        .select('id', 'payslip_id', 'is_private', 'paid_by_user_id', 'created_by_user_id')
    )
  for (const payslip of payslips) {
    const gross = payslip.lines[0]
    if (
      gross &&
      payslip.transferId !== null &&
      payslip.memo !== null &&
      isHiddenFrom(gross, viewer)
    ) {
      memos.set(payslip.transferId, payslip.memo)
    }
  }
  return memos
}
