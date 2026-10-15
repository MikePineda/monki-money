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

/** The only person who sees the details of a private transaction. */
export function privateOwnerId(subject: PrivacySubject): number | null {
  return subject.paidByUserId ?? subject.createdByUserId
}

/** True when `subject` is private and its owner still belongs to the household. */
function hasPrivateOwner(subject: PrivacySubject, memberIds: ReadonlySet<number>): boolean {
  if (!subject.isPrivate) return false
  const owner = privateOwnerId(subject)
  return owner !== null && memberIds.has(owner)
}

/** True when `viewer` must not see (nor change) the details of `subject`. */
export function isHiddenFrom(subject: PrivacySubject, viewer: PrivacyViewer): boolean {
  return hasPrivateOwner(subject, viewer.memberIds) && privateOwnerId(subject) !== viewer.userId
}

/** Private postings lose their category and group but keep amount, side and payer. */
function hide(posting: Posting): Posting {
  return { ...posting, categoryId: null, groupId: null, hidden: true }
}

/**
 * Postings as `viewer` may see them: private postings of someone else lose
 * their category and group (they report under the `private` bucket) but
 * keep amount, side (income/expense) and payer.
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
