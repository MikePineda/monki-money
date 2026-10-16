import { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import { Logger } from '@adonisjs/core/logger'
import db from '@adonisjs/lucid/services/db'
import PushNotifier from '#services/push/push_notifier'
import SchedulerRuns from '#services/scheduler/scheduler_runs'
import { dailyReminderPayload } from '#services/push/push_messages'
import { describeReport, pushRunResult } from '#services/push/push_outcome'
import type { ScheduledJob, TickContext } from '#services/scheduler/scheduler'
import {
  isDailyReminderDue,
  loggedSomethingToday,
  reminderDay,
  startOfLocalDay,
} from '#domain/push/daily_reminder'

/** Name in `scheduler_runs.job` and in the logs. */
export const DAILY_REMINDER_JOB = 'daily-reminder'

/** A reminder still undelivered after this (phone off all evening) is dropped. */
const TTL_SECONDS = 4 * 60 * 60

/** One person who asked for the reminder, with a device in their current household. */
interface Candidate {
  userId: number
  locale: string
  householdId: number
  timezone: string
  reminderTime: string
}

/**
 * The opt-in "did you log anything today?" push. Every tick, for each
 * person with the reminder on and a device registered in their (active)
 * current household: once the household's local time passes their reminder
 * time, the local day is claimed in `scheduler_runs` (job, 'YYYY-MM-DD',
 * household, person), so a day gets one decision whatever the number of
 * ticks, containers or restarts. The reminder is sent only when the person
 * created nothing that day (any source: quick add, receipt, import,
 * transfer); otherwise the day is recorded as skipped. A push no device
 * took is retried an hour later (scheduler_runs.ts), the "nothing logged"
 * check included. The payload says nothing about money.
 */
@inject()
export default class DailyReminderJob implements ScheduledJob {
  readonly name = DAILY_REMINDER_JOB

  constructor(
    protected notifier: PushNotifier,
    protected runs: SchedulerRuns,
    protected logger: Logger
  ) {}

  async tick({ now, signal }: TickContext): Promise<void> {
    for (const candidate of await this.candidates()) {
      if (signal.aborted) return
      const startedAt = now()
      if (!isDailyReminderDue(startedAt, candidate.timezone, candidate.reminderTime)) continue
      const day = reminderDay(startedAt, candidate.timezone)

      try {
        const claim = await this.runs.claim(
          {
            job: this.name,
            periodKey: day,
            householdId: candidate.householdId,
            userId: candidate.userId,
          },
          startedAt
        )
        if (claim === null) continue
        if (signal.aborted) {
          await this.runs.release(claim, now())
          return
        }

        const outcome = await this.remind(candidate, now())
        await this.runs.finish(claim, now(), outcome.result)
        this.logger.info(
          { job: this.name, userId: candidate.userId, day, outcome: outcome.result.outcome },
          `daily reminder: user ${candidate.userId} ${day}: ${outcome.summary}`
        )
      } catch (error) {
        this.logger.error(
          { err: error, job: this.name, userId: candidate.userId, day },
          'daily reminder: could not record the run'
        )
      }
    }
  }

  protected async remind(candidate: Candidate, now: DateTime) {
    const created = await this.createdToday(candidate, now)
    if (loggedSomethingToday(created, now, candidate.timezone)) {
      return { result: { outcome: 'skipped:logged-today' }, summary: 'skipped (logged today)' }
    }
    const devices = await this.notifier.devicesOf(candidate.userId, candidate.householdId)
    const report = await this.notifier.notify(
      devices,
      dailyReminderPayload(candidate.locale),
      { ttlSeconds: TTL_SECONDS },
      now
    )
    return { result: pushRunResult(report), summary: describeReport(report) }
  }

  /** The latest entry the person created in the household since local midnight (at most one). */
  protected async createdToday(candidate: Candidate, now: DateTime): Promise<DateTime[]> {
    const rows = await db
      .from('transactions')
      .where('household_id', candidate.householdId)
      .where('created_by_user_id', candidate.userId)
      .where('created_at', '>=', startOfLocalDay(now, candidate.timezone).toJSDate())
      .orderBy('created_at', 'desc')
      .limit(1)
      .select('created_at')
    return rows.map((row) => DateTime.fromJSDate(row.created_at))
  }

  /** People with the reminder on, a membership in their active current household and a device there. */
  protected async candidates(): Promise<Candidate[]> {
    return db
      .from('user_notification_settings as settings')
      .join('users', 'users.id', 'settings.user_id')
      .join('household_members as members', (join) => {
        join
          .on('members.user_id', 'users.id')
          .andOn('members.household_id', 'users.current_household_id')
      })
      .join('households', 'households.id', 'members.household_id')
      .where('settings.daily_reminder', true)
      .where('households.status', 'active')
      .whereExists((devices) => {
        devices
          .from('push_subscriptions')
          .whereColumn('push_subscriptions.user_id', 'users.id')
          .whereColumn('push_subscriptions.household_id', 'households.id')
      })
      .orderBy('users.id')
      .select(
        'users.id as userId',
        'users.locale as locale',
        'households.id as householdId',
        'households.timezone as timezone',
        'settings.reminder_time as reminderTime'
      )
  }
}
