import { inject } from '@adonisjs/core'
import { Logger } from '@adonisjs/core/logger'
import MonthlyInsight from '#models/monthly_insight'
import HouseholdMember from '#models/household_member'
import PushNotifier from '#services/push/push_notifier'
import SchedulerRuns, { RETRYABLE_FAILURE } from '#services/scheduler/scheduler_runs'
import { summaryReadyPayload } from '#services/push/push_messages'
import UserNotificationSetting from '#models/user_notification_setting'
import { describeReport, pushRunResult } from '#services/push/push_outcome'
import type { ScheduledJob, TickContext } from '#services/scheduler/scheduler'

/** Name in `scheduler_runs.job` and in the logs. */
export const SUMMARY_READY_JOB = 'summary-ready-push'

/**
 * Only summaries written this recently are announced: it covers the
 * retries of a failed push (an hour apart, three attempts) and keeps an old
 * month from ever being announced late.
 */
export const ANNOUNCE_WITHIN = { hours: 24 }

/** The push service keeps an undelivered "summary ready" for a day (phone off). */
const TTL_SECONDS = 24 * 60 * 60

/**
 * "Your summary of {month} is ready": after the scheduled monthly summary
 * is written (MonthlyInsightsJob, same tick, which runs first), every
 * member with the summary push on and a device gets one notification in
 * their own language. It picks the summaries the scheduler (or `node ace
 * insights:generate`) wrote, i.e. `generated_by_user_id` NULL, that nobody
 * was told about yet (`monthly_insights.notified_at` NULL); a summary someone
 * tapped is not announced. Each member is claimed once per month in
 * `scheduler_runs` (job, month, household, person), so a regenerated
 * summary, restarts and overlapping containers never notify twice. The
 * summary is marked as told once no member's push is left to retry.
 */
@inject()
export default class SummaryReadyJob implements ScheduledJob {
  readonly name = SUMMARY_READY_JOB

  constructor(
    protected notifier: PushNotifier,
    protected runs: SchedulerRuns,
    protected logger: Logger
  ) {}

  async tick({ now, signal }: TickContext): Promise<void> {
    const pending = await MonthlyInsight.query()
      .whereNull('notified_at')
      .whereNull('generated_by_user_id')
      .where('generated_at', '>=', now().minus(ANNOUNCE_WITHIN).toJSDate())
      .preload('household')
      .orderBy('id')

    for (const insight of pending) {
      if (signal.aborted) return
      try {
        const settled = await this.announce(insight, { now, signal })
        if (settled) await insight.merge({ notifiedAt: now() }).save()
      } catch (error) {
        this.logger.error(
          { err: error, job: this.name, householdId: insight.householdId, month: insight.month },
          'summary push: could not notify the household'
        )
      }
    }
  }

  /** Notifies every member due; true once none is left to retry. */
  protected async announce(insight: MonthlyInsight, { now, signal }: TickContext) {
    const { household } = insight
    if (household.status !== 'active') return true

    const members = await HouseholdMember.query()
      .where('household_id', household.id)
      .preload('user')
      .orderBy('id')
    const optedOut = await this.optedOut(members.map((member) => member.userId))

    let settled = true
    for (const { user } of members) {
      if (signal.aborted) return false
      if (optedOut.has(user.id)) continue
      const devices = await this.notifier.devicesOf(user.id, household.id)
      if (devices.length === 0) continue

      const key = {
        job: this.name,
        periodKey: insight.month,
        householdId: household.id,
        userId: user.id,
      }
      const claim = await this.runs.claim(key, now())
      if (claim === null) {
        if (await this.runs.isOpen(key)) settled = false
        continue
      }
      const report = await this.notifier.notify(
        devices,
        summaryReadyPayload(insight.month, user.locale),
        { ttlSeconds: TTL_SECONDS },
        now()
      )
      const result = pushRunResult(report)
      const recorded = await this.runs.finish(claim, now(), result)
      if (!recorded || result.outcome === RETRYABLE_FAILURE) settled = false
      this.logger.info(
        { job: this.name, householdId: household.id, userId: user.id, outcome: result.outcome },
        `summary push: household ${household.id} ${insight.month} user ${user.id}: ${describeReport(report)}`
      )
    }
    return settled
  }

  /** Members who turned the summary push off (no row = the default, on). */
  protected async optedOut(userIds: number[]): Promise<Set<number>> {
    const rows = await UserNotificationSetting.query()
      .whereIn('user_id', userIds)
      .where('summary_ready', false)
      .select('user_id')
    return new Set(rows.map((row) => row.userId))
  }
}
