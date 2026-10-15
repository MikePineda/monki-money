import type { Posting } from '#domain/ledger/posting'

/**
 * Private transactions (a surprise gift): the partner sees the amount in
 * the household totals but not the payee, notes, tags or category, which
 * show up as "Private". The details belong to whoever paid; for a joint
 * private transaction (no payer), to whoever created it.
 */
export type PrivacySubject = {
  isPrivate: boolean
  paidByUserId: number | null
  createdByUserId: number | null
}

/** The only person who sees the details of a private transaction. */
export function privateOwnerId(subject: PrivacySubject): number | null {
  return subject.paidByUserId ?? subject.createdByUserId
}

/** True when `viewerUserId` must not see the details of `subject`. */
export function isHiddenFrom(subject: PrivacySubject, viewerUserId: number): boolean {
  return subject.isPrivate && privateOwnerId(subject) !== viewerUserId
}

/**
 * Postings as `viewerUserId` may see them: private postings of someone
 * else lose their category and group (they report under the `private`
 * bucket) but keep amount, side (income/expense) and payer.
 */
export function postingsFor(postings: Posting[], viewerUserId: number): Posting[] {
  return postings.map((posting) =>
    isHiddenFrom(posting, viewerUserId)
      ? { ...posting, categoryId: null, groupId: null, hidden: true }
      : posting
  )
}
