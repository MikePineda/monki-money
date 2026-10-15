/**
 * NAB's own `Category` column -> taxonomy slug (`packages/shared/src/taxonomy.ts`).
 * Specific categories are trusted; vague ones (`Uncategorised`, `Services`,
 * `Other shopping`, transfers to and from people...) still suggest a slug
 * but flag the row for review. `Internal transfers` is not a category: the
 * transfer detector handles it. Names NAB adds later map to nothing and fall
 * through to the next suggester.
 */

export type NabCategoryMapping =
  { kind: 'category'; slug: string; needsReview: boolean } | { kind: 'transfer' }

const trusted = (slug: string): NabCategoryMapping => ({
  kind: 'category',
  slug,
  needsReview: false,
})
const review = (slug: string): NabCategoryMapping => ({ kind: 'category', slug, needsReview: true })

/** Keys are NAB names lowercased with single spaces. */
export const NAB_CATEGORY_MAP: Readonly<Record<string, NabCategoryMapping>> = {
  'groceries': trusted('groceries'),
  'mortgage & rent': trusted('rent'),
  'phone & internet': trusted('phone-internet'),
  'gym & fitness': trusted('gym'),
  'public transport': trusted('public-transport'),
  'restaurants & takeaway': trusted('restaurants-takeaway'),
  'cafe & coffee': trusted('cafe-coffee'),
  'alcohol': trusted('alcohol'),
  'attractions & events': trusted('entertainment-events'),
  'travel expenses': trusted('travel-expenses'),
  'accommodation': trusted('accommodation'),
  'clothing': trusted('clothing'),
  'clothing & accessories': trusted('clothing'),
  'electronics': trusted('electronics'),
  'electronics & technology': trusted('electronics'),
  'personal care': trusted('personal-care'),
  'donations': trusted('donations'),
  'income': trusted('salary'),
  'internal transfers': { kind: 'transfer' },
  'other income': review('other-income'),
  'refund': review('refunds'),
  'other shopping': review('home-goods'),
  'services': review('misc'),
  'uncategorised': review('misc'),
  'transfers in': review('reimbursements'),
  'transfers out': review('shared-outings'),
}

/** Mapping for a NAB category name (case and spacing ignored); null when unknown or empty. */
export function mapNabCategory(nabCategory: string | null): NabCategoryMapping | null {
  if (nabCategory === null) return null
  const key = nabCategory.trim().replace(/\s+/g, ' ').toLowerCase()
  return Object.hasOwn(NAB_CATEGORY_MAP, key) ? NAB_CATEGORY_MAP[key] : null
}
