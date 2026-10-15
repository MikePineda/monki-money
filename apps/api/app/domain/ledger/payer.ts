/**
 * Who paid, when the person entering a transaction does not say. A joint
 * account has one card per person, so the card suffix of an imported row
 * identifies the payer; manual entries on a joint account default to
 * whoever entered them. "Both of us" (null) is only ever an explicit choice.
 */
export type PayerContext = {
  /** null = joint account. */
  accountOwnerUserId: number | null
  cards: Array<{ cardSuffix: string; userId: number | null }>
  cardSuffix?: string | null
  creatorUserId: number
}

export function defaultPayer(context: PayerContext): number {
  if (context.accountOwnerUserId !== null) return context.accountOwnerUserId

  if (context.cardSuffix) {
    const card = context.cards.find((candidate) => candidate.cardSuffix === context.cardSuffix)
    if (card?.userId) return card.userId
  }

  return context.creatorUserId
}
