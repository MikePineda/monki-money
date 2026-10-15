import type { IconName } from '../icons/icon-names'

/** Feedback severity (DESIGN.md, Status): always an icon in the status colour plus words in ink. */
export type FeedbackStatus = 'good' | 'warning' | 'serious' | 'critical'

export const STATUS_ICON: Record<FeedbackStatus, IconName> = {
  good: 'circle-check',
  warning: 'triangle-alert',
  serious: 'octagon-alert',
  critical: 'circle-alert',
}

export const STATUS_TEXT_CLASS: Record<FeedbackStatus, string> = {
  good: 'text-status-good',
  warning: 'text-status-warning',
  serious: 'text-status-serious',
  critical: 'text-status-critical',
}
