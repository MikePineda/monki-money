import { ICON_NAMES, type IconName } from './icon-names'

/**
 * Category glyphs. A category's own `icon` (chosen in the picker) wins;
 * otherwise the seeded taxonomy slug gives a sensible default, and a
 * custom category without an icon shows a tag.
 */
const BY_SLUG: Readonly<Record<string, IconName>> = {
  // Groups
  'housing': 'house',
  'food': 'utensils',
  'transport': 'bus',
  'health': 'heart-pulse',
  'shopping': 'shopping-bag',
  'leisure': 'ticket',
  'travel': 'plane',
  'education': 'graduation-cap',
  'finance-other': 'landmark',
  'income': 'wallet',
  // Categories
  'rent': 'house',
  'utilities': 'zap',
  'phone-internet': 'smartphone',
  'home-goods': 'sofa',
  'groceries': 'shopping-cart',
  'restaurants-takeaway': 'utensils',
  'cafe-coffee': 'coffee',
  'alcohol': 'wine',
  'snacks': 'cookie',
  'public-transport': 'bus',
  'rideshare-taxi': 'car-taxi-front',
  'gym': 'dumbbell',
  'medical-pharmacy': 'pill',
  'personal-care': 'sparkles',
  'clothing': 'shirt',
  'electronics': 'laptop',
  'gifts': 'gift',
  'entertainment-events': 'ticket',
  'subscriptions-games': 'gamepad-2',
  'shared-outings': 'users',
  'flights': 'plane',
  'accommodation': 'bed',
  'travel-expenses': 'luggage',
  'university': 'graduation-cap',
  'books-courses': 'book-open',
  'bank-fees': 'landmark',
  'taxes': 'receipt',
  'donations': 'heart-handshake',
  'insurance': 'shield',
  'remittances': 'send',
  'misc': 'ellipsis',
  'salary': 'briefcase',
  'reimbursements': 'undo-2',
  'refunds': 'rotate-ccw',
  'cash-income': 'banknote',
  'interest': 'percent',
  'other-income': 'circle-dollar-sign',
}

/** The icons offered by the category icon picker, in display order. */
export const CATEGORY_ICON_CHOICES: readonly IconName[] = [
  'house',
  'zap',
  'smartphone',
  'sofa',
  'shopping-cart',
  'utensils',
  'pizza',
  'coffee',
  'wine',
  'beer',
  'cookie',
  'bus',
  'train-front',
  'car-taxi-front',
  'car',
  'fuel',
  'bike',
  'plane',
  'bed',
  'luggage',
  'heart-pulse',
  'dumbbell',
  'pill',
  'stethoscope',
  'sparkles',
  'scissors',
  'shopping-bag',
  'shirt',
  'laptop',
  'tv',
  'gift',
  'ticket',
  'gamepad-2',
  'music',
  'film',
  'users',
  'baby',
  'paw-print',
  'graduation-cap',
  'book-open',
  'landmark',
  'receipt',
  'shield',
  'heart-handshake',
  'heart',
  'send',
  'wrench',
  'package',
  'store',
  'wallet',
  'briefcase',
  'banknote',
  'piggy-bank',
  'hand-coins',
  'percent',
  'circle-dollar-sign',
  'undo-2',
  'rotate-ccw',
  'tag',
  'ellipsis',
]

const KNOWN: ReadonlySet<string> = new Set(ICON_NAMES)

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && KNOWN.has(value)
}

/** The glyph for a category (or a group); a tag when nothing better is known. */
export function categoryIcon(
  category: { slug?: string | null; icon?: string | null } | null | undefined
): IconName {
  if (!category) {
    return 'tag'
  }
  if (isIconName(category.icon)) {
    return category.icon
  }
  return (category.slug ? BY_SLUG[category.slug] : undefined) ?? 'tag'
}
