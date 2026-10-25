import { withinTolerance } from '#domain/recurring/detection'
import { keysNameTheSameMerchant } from '#domain/recurring/merchant_key'

/**
 * Which recurring item a payment pays. Several items may share a merchant
 * key (two phone lines at one company), so the amount decides between
 * them. Pure.
 *
 * A payment answers to an item when, best first:
 * 0. its merchant key (the bank row's) is the item's key;
 * 1. its payee's own key is the item's key (an item typed as "Rent" and the
 *    imported transfers the person named "Rent");
 * 2. either key names the same merchant once noise words drop
 *    (`keysNameTheSameMerchant`: a typed "StreamFlix" and the bank's
 *    STREAMFLIX.COM).
 * Among the items it answers to, only those within their tolerance of its
 * amount count; the best key wins, then the closest amount, then the
 * oldest item.
 */

/** An item as the matching needs it. */
export type MatchedItem = {
  id: number
  merchantKey: string
  amountCents: number
  amountTolerancePct: number
}

/** A payment as the matching needs it (amount spent, positive). */
export type MatchedPayment = {
  amountCents: number
  merchantKey: string
  /** The payee's own key; '' or omitted when the payment has no payee. */
  payeeKey?: string
}

/** How well a payment's keys name `itemKey` (0 best), or null when they do not. */
export function keyMatchLevel(itemKey: string, payment: MatchedPayment): 0 | 1 | 2 | null {
  if (itemKey === '') return null
  if (payment.merchantKey === itemKey) return 0
  if (payment.payeeKey && payment.payeeKey === itemKey) return 1
  if (
    keysNameTheSameMerchant(itemKey, payment.merchantKey) ||
    keysNameTheSameMerchant(itemKey, payment.payeeKey ?? '')
  ) {
    return 2
  }
  return null
}

/** The item `payment` pays, or undefined when it pays none of them. */
export function itemOfPayment<Item extends MatchedItem>(
  payment: MatchedPayment,
  items: readonly Item[]
): Item | undefined {
  let best: { item: Item; level: number; distance: number } | undefined
  for (const item of items) {
    const level = keyMatchLevel(item.merchantKey, payment)
    if (level === null) continue
    if (!withinTolerance(payment.amountCents, item.amountCents, item.amountTolerancePct)) continue
    const distance = Math.abs(payment.amountCents - item.amountCents)
    if (
      !best ||
      level < best.level ||
      (level === best.level && distance < best.distance) ||
      (level === best.level && distance === best.distance && item.id < best.item.id)
    ) {
      best = { item, level, distance }
    }
  }
  return best?.item
}
