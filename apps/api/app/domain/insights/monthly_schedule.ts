import { DateTime } from 'luxon'
import type { HouseholdStatus } from '@monkimoney/shared'
import type { Posting } from '#domain/ledger/posting'
import { excludeTransfers } from '#domain/reports/month_summary'
import { addMonths, currentMonth, monthOf, type Month } from '#domain/calendar/month'

/**
 * When the monthly summary is written without anyone asking: from 08:00 on
 * the 1st of each month in the household's time zone, for the month that
 * just ended, with a catch-up window through the end of the 4th. Pure:
 * `now` is always passed in.
 */

/** Local hour (household time zone) from which the 1st is due. */
export const MONTHLY_INSIGHT_HOUR = 8

/** Last day of the month (household time zone) on which a missed run is still caught up. */
export const MONTHLY_INSIGHT_LAST_DAY = 4

/** Why a household gets no scheduled summary for a month. */
export type MonthlyInsightSkipReason =
  'pending-deletion' | 'suspended' | 'already-generated' | 'no-activity' | 'llm-unavailable'

export interface MonthlyInsightFacts {
  status: HouseholdStatus
  /** The month being summarised. */
  month: Month
  /** The household's time zone: it decides when `month` ended. */
  zone: string
  /** Postings of the household; only those dated in `month` count. */
  postings: Posting[]
  /** When the stored summary of `month` (household language) was written; null when none. */
  storedAt: DateTime | null
  /** Regenerate even a summary that covers the whole month (the command's --force). */
  force: boolean
  /** A live model is configured (the fake only ever serves the test suite). */
  llmAvailable: boolean
}

/** `replace`: a stored summary exists and the new one takes its place (generate with force). */
export type MonthlyInsightDecision =
  { generate: true; replace: boolean } | { generate: false; reason: MonthlyInsightSkipReason }

/**
 * Due from 08:00 on the 1st through the end of the 4th, household local
 * time: a 1st with the app down all day is caught up on the next tick
 * (`scheduler_runs` keeps it to one run per household and month). Later
 * in the month only `node ace insights:generate` writes it.
 */
export function isMonthlyInsightDue(now: DateTime, zone: string): boolean {
  const local = now.setZone(zone)
  if (!local.isValid || local.day > MONTHLY_INSIGHT_LAST_DAY) return false
  return local.day > 1 || local.hour >= MONTHLY_INSIGHT_HOUR
}

/** The month a run at `now` summarises: the one before the household's current month. */
export function insightPeriodKey(now: DateTime, zone: string): Month {
  return addMonths(currentMonth(now, zone), -1)
}

/** At least one income or spending posting (transfers are neither) dated in `month`. */
export function hasActivityIn(postings: Posting[], month: Month): boolean {
  return excludeTransfers(postings).some((posting) => monthOf(posting.date) === month)
}

/** The first instant after `month` in `zone`: midnight starting the 1st of the next month. */
export function monthEndsAt(month: Month, zone: string): DateTime {
  return DateTime.fromISO(`${addMonths(month, 1)}-01`, { zone })
}

/**
 * A stored summary counts as the month's only when it was written after the
 * month ended: one a partner tapped on the 20th covers 1-20 only.
 */
export function coversWholeMonth(storedAt: DateTime, month: Month, zone: string): boolean {
  return storedAt >= monthEndsAt(month, zone)
}

/**
 * Generate (replacing a partial summary), or skip and say why. A household on
 * its way out is never looked at.
 */
export function decideMonthlyInsight(facts: MonthlyInsightFacts): MonthlyInsightDecision {
  if (facts.status === 'pending_deletion') return skip('pending-deletion')
  if (facts.status === 'suspended') return skip('suspended')
  const complete =
    facts.storedAt !== null && coversWholeMonth(facts.storedAt, facts.month, facts.zone)
  if (complete && !facts.force) return skip('already-generated')
  if (!hasActivityIn(facts.postings, facts.month)) return skip('no-activity')
  if (!facts.llmAvailable) return skip('llm-unavailable')
  return { generate: true, replace: facts.storedAt !== null }
}

function skip(reason: MonthlyInsightSkipReason): MonthlyInsightDecision {
  return { generate: false, reason }
}
