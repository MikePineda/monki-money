import type { Posting } from '#domain/ledger/posting'

/**
 * Private transactions (a surprise gift): the partner sees the amount in
 * the household totals but not the payee, notes, tags or category, which
 * show up as "Private". The details belong to whoever paid; for a joint
 * private transaction (no payer), to whoever created it.
 *
 * When that owner no longer exists (user deleted) or left the household,
 * nobody could ever unlock the row again, so it becomes an ordinary row of
 * the household.
 */
export type PrivacySubject = {
  isPrivate: boolean
  paidByUserId: number | null
  createdByUserId: number | null
}

/** Who is reading, and who currently belongs to the household. */
export type PrivacyViewer = {
  userId: number
  memberIds: ReadonlySet<number>
}

/**
 * A reader of ledger rows: {@link PrivacyViewer} plus, by transfer id, the
 * memos of private payslips (the gross line hidden from the reader) that
 * were copied onto those transfers and their legs. Without the map no
 * memo is withheld.
 */
export type LedgerViewer = PrivacyViewer & {
  hiddenPayslipMemos?: ReadonlyMap<number, string>
}

/**
 * `text` (a transfer's memo, or the description of one of its legs),
 * unless it is the memo of a private payslip copied onto that transfer.
 */
export function unlessHiddenPayslipMemo(
  text: string | null,
  transferId: number | null,
  viewer: LedgerViewer
): string | null {
  if (text === null || transferId === null) return text
  return viewer.hiddenPayslipMemos?.get(transferId) === text ? null : text
}

/** The only person who sees the details of a private transaction. */
export function privateOwnerId(subject: PrivacySubject): number | null {
  return subject.paidByUserId ?? subject.createdByUserId
}

/** True when `subject` is private and its owner still belongs to the household. */
export function hasPrivateOwner(subject: PrivacySubject, memberIds: ReadonlySet<number>): boolean {
  if (!subject.isPrivate) return false
  const owner = privateOwnerId(subject)
  return owner !== null && memberIds.has(owner)
}

/** True when `viewer` must not see (nor change) the details of `subject`. */
export function isHiddenFrom(subject: PrivacySubject, viewer: PrivacyViewer): boolean {
  return hasPrivateOwner(subject, viewer.memberIds) && privateOwnerId(subject) !== viewer.userId
}

/**
 * Private postings lose their category, group and tags but keep amount,
 * side and payer (a tag must not reveal what a surprise was for).
 */
function hide(posting: Posting): Posting {
  return { ...posting, categoryId: null, groupId: null, tags: [], hidden: true }
}

/**
 * Postings as `viewer` may see them: private postings of someone else lose
 * their category, group and tags (they report under the `private` bucket
 * and never under a tag) but keep amount, side (income/expense) and payer.
 */
export function postingsFor(postings: Posting[], viewer: PrivacyViewer): Posting[] {
  return postings.map((posting) => (isHiddenFrom(posting, viewer) ? hide(posting) : posting))
}

/**
 * Postings as the whole household may see them, for content stored once
 * and read by every member (monthly insights): every private posting whose
 * owner is a member is hidden, including the reader's own.
 */
export function postingsForHousehold(
  postings: Posting[],
  memberIds: ReadonlySet<number>
): Posting[] {
  return postings.map((posting) => (hasPrivateOwner(posting, memberIds) ? hide(posting) : posting))
}
