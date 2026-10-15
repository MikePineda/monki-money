/** Who in the household holds what, to guess who paid an imported row. */
export interface PayerContext {
  /** Owner of a personal account; null for a joint account. */
  accountOwnerUserId: number | null
  /** Card suffix (`1111`) -> user, from `account_cards`. */
  cardOwners: ReadonlyMap<string, number>
  /** Last resort (the plan's default is the uploading user); null = joint. */
  fallbackUserId: number | null
}

/** Payer of a row: the account owner, else the card holder, else the fallback. */
export function suggestPaidBy(cardSuffix: string | null, context: PayerContext): number | null {
  if (context.accountOwnerUserId !== null) return context.accountOwnerUserId
  const cardOwner = cardSuffix === null ? undefined : context.cardOwners.get(cardSuffix)
  return cardOwner ?? context.fallbackUserId
}
