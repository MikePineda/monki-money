import type { DateTime } from 'luxon'
import type { HouseholdStatus } from '@monkimoney/shared'
import type { Posting } from '#domain/ledger/posting'
import { excludeTransfers } from '#domain/reports/month_summary'
import { addMonths, currentMonth, monthOf, type Month } from '#domain/calendar/month'

/**
 * When the monthly summary is written without anyone asking: on the 1st of
 * each month, from 08:00 in the household's time zone, for the month that
 * just ended. Pure: `now` is always passed in.
 */

/** Local hour (household time zone) from which the 1st is due. */
export const MONTHLY_INSIGHT_HOUR = 8

/** Why a household gets no scheduled summary for a month. */
export type MonthlyInsightSkipReason =
  'pending-deletion' | 'suspended' | 'already-generated' | 'no-activity' | 'llm-unavailable'

export interface MonthlyInsightFacts {
  status: HouseholdStatus
  /** The month being summarised. */
  month: Month
  /** Postings of the household; only those dated in `month` count. */
  postings: Posting[]
  /** The month already has a summary in the household's language. */
  alreadyGenerated: boolean
  /** Regenerate even when it does (the command's --force). */
  force: boolean
  /** A live model is configured (the fake only ever serves the test suite). */
  llmAvailable: boolean
}

export type MonthlyInsightDecision =
  { generate: true } | { generate: false; reason: MonthlyInsightSkipReason }

/**
 * Due from 08:00 to midnight on the 1st, household local time. A 1st missed
 * entirely (the app down all day) is caught up by hand
 * (`node ace insights:generate`).
 */
export function isMonthlyInsightDue(now: DateTime, zone: string): boolean {
  const local = now.setZone(zone)
  return local.isValid && local.day === 1 && local.hour >= MONTHLY_INSIGHT_HOUR
}

/** The month a run at `now` summarises: the one before the household's current month. */
export function insightPeriodKey(now: DateTime, zone: string): Month {
  return addMonths(currentMonth(now, zone), -1)
}

/** At least one income or spending posting (transfers are neither) dated in `month`. */
export function hasActivityIn(postings: Posting[], month: Month): boolean {
  return excludeTransfers(postings).some((posting) => monthOf(posting.date) === month)
}

/** Generate, or skip and say why. A household on its way out is never looked at. */
export function decideMonthlyInsight(facts: MonthlyInsightFacts): MonthlyInsightDecision {
  if (facts.status === 'pending_deletion') return skip('pending-deletion')
  if (facts.status === 'suspended') return skip('suspended')
  if (facts.alreadyGenerated && !facts.force) return skip('already-generated')
  if (!hasActivityIn(facts.postings, facts.month)) return skip('no-activity')
  if (!facts.llmAvailable) return skip('llm-unavailable')
  return { generate: true }
}

function skip(reason: MonthlyInsightSkipReason): MonthlyInsightDecision {
  return { generate: false, reason }
}
