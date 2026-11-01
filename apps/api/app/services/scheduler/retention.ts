import type { DateTime } from 'luxon'

/**
 * How long `scheduler_runs` keeps a run. Thirteen months keeps last year's
 * run of the same month next to this year's (the monthly jobs) and is far
 * longer than any job looks back to decide whether a period still needs
 * its run (a day, or the first days of a month), so pruning never makes a
 * job run a period again.
 */
export const RUNS_RETENTION_MONTHS = 13

/** Runs that started before this instant are pruned (UTC; months clamp at month ends). */
export function retentionCutoff(now: DateTime): DateTime {
  return now.toUTC().minus({ months: RUNS_RETENTION_MONTHS })
}

/** The period the prune claims: one per UTC day, whatever the containers or ticks. */
export function retentionDay(now: DateTime): string {
  return now.toUTC().toISODate()!
}
