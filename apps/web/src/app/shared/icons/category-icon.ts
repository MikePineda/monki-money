import { ICON_NAMES, type IconName } from './icon-names'

/**
 * The glyph for each seeded category and group slug (packages/shared
 * taxonomy). A category whose own `icon` is a shipped Lucide name keeps it;
 * anything unknown falls back to a neutral tag.
 */
const BY_SLUG: Record<string, IconName> = {
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
  // Housing
  'rent': 'house',
  'utilities': 'zap',
  'phone-internet': 'smartphone',
  'home-goods': 'sofa',
  // Food
  'groceries': 'shopping-cart',
  'restaurants-takeaway': 'utensils',
  'cafe-coffee': 'coffee',
  'alcohol': 'wine',
  'snacks': 'cookie',
  // Transport
  'public-transport': 'bus',
  'rideshare-taxi': 'car',
  // Health
  'gym': 'dumbbell',
  'medical-pharmacy': 'pill',
  'personal-care': 'sparkles',
  // Shopping
  'clothing': 'shirt',
  'electronics': 'laptop',
  'gifts': 'gift',
  // Leisure
  'entertainment-events': 'ticket',
  'subscriptions-games': 'gamepad-2',
  'shared-outings': 'users',
  // Travel
  'flights': 'plane',
  'accommodation': 'bed',
  'travel-expenses': 'luggage',
  // Education
  'university': 'graduation-cap',
  'books-courses': 'book-open',
  // Finance and other
  'bank-fees': 'landmark',
  'taxes': 'receipt-text',
  'donations': 'hand-heart',
  'insurance': 'shield',
  'remittances': 'globe',
  'misc': 'tag',
  // Income
  'salary': 'briefcase',
  'reimbursements': 'hand-coins',
  'refunds': 'undo-2',
  'cash-income': 'banknote',
  'interest': 'piggy-bank',
  'other-income': 'wallet',
}

const SHIPPED = new Set<string>(ICON_NAMES)

export function isIconName(name: string): name is IconName {
  return SHIPPED.has(name)
}

/** The icon of a category or group: its own (when shipped), its slug's, else a tag. */
export function categoryIcon(category: { slug: string; icon?: string | null } | null): IconName {
  if (!category) {
    return 'tag'
  }
  if (category.icon && isIconName(category.icon)) {
    return category.icon
  }
  return BY_SLUG[category.slug] ?? 'tag'
}
