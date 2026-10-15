/**
 * The Lucide icons the app ships, as one SVG sprite (public/sprite/lucide.svg).
 * One icon set only (DESIGN.md, Shapes). To add an icon: add its Lucide name
 * here, run `npm run icons -w @monkimoney/web`, and commit the sprite.
 */
export const ICON_NAMES = [
  // Navigation and shell
  'calendar',
  'list',
  'plus',
  'ellipsis',
  'file-up',
  'settings',
  'arrow-left',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'x',
  'search',
  'check',
  // Money and charts
  'arrow-left-right',
  'arrow-up-right',
  'arrow-down-right',
  'chart-bar',
  'table-2',
  'wallet',
  'receipt',
  'tag',
  // Status and feedback
  'circle-check',
  'triangle-alert',
  'octagon-alert',
  'circle-alert',
  'info',
  'circle-plus',
  'copy',
  'trash-2',
  'refresh-cw',
  'loader-circle',
  'wifi-off',
  'inbox',
  // Keypad and forms
  'delete',
  // PWA and preferences
  'download',
  'share',
  'square-plus',
  'sun',
  'moon',
  'monitor',
  'languages',
  'user',
  'users',
  'log-out',
  // Account, household and settings
  'send',
  'user-plus',
  'pencil',
  'archive',
  'credit-card',
  'landmark',
  'lock',
  'file-text',
  // Category glyphs used by demos and the first features
  'house',
  'shopping-cart',
  'utensils',
  'bus',
  'zap',
  'heart-pulse',
  'smartphone',
] as const

export type IconName = (typeof ICON_NAMES)[number]

/** Public URL of the sprite, served from public/ and prefetched by the service worker. */
export const ICON_SPRITE_URL = '/sprite/lucide.svg'
