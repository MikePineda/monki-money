import type { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import { Logger } from '@adonisjs/core/logger'
import db from '@adonisjs/lucid/services/db'
import type Household from '#models/household'
import SavingsGoal from '#models/savings_goal'
import { reachAction } from '#domain/goals/reached'
import HouseholdMember from '#models/household_member'
import GoalService from '#services/goals/goal_service'
import PushNotifier from '#services/push/push_notifier'
import SchedulerRuns from '#services/scheduler/scheduler_runs'
import { goalReachedPayload } from '#services/push/push_messages'
import UserNotificationSetting from '#models/user_notification_setting'
import { describeReport, pushRunResult } from '#services/push/push_outcome'
import type { ScheduledJob, TickContext } from '#services/scheduler/scheduler'

/** Name in `scheduler_runs.job` and in the logs. */
export const GOAL_REACHED_JOB = 'goal-reached-push'

/**
 * A reach is announced (and its failed pushes retried, an hour apart, three
 * attempts) only this long after it was seen: a phone that missed it for a
 * day is not told late.
 */
export const ANNOUNCE_WITHIN = { hours: 24 }

/** The push service keeps an undelivered "goal reached" for a day (phone off). */
const TTL_SECONDS = 24 * 60 * 60

/**
 * "You reached {goal}": every tick, each goal that is active or was
 * announced is read with what it has saved today (GoalService.savedAmounts:
 * the tracked account's cleared balance, else the starting amount plus the
 * contributions), and domain/goals/reached.ts decides:
 *
 * - an active goal with nothing left to save and no `reached_notified_at`
 *   is stamped (a conditional update, so of two containers one wins) and
 *   every member is told, in their own language, on every device;
 * - a stamped goal short of its target again is unstamped (rearmed): the
 *   next time it gets there is a new reach and is announced again. While it
 *   stays at its target, however many ticks read it, nobody is told twice.
 *
 * Each member is claimed in `scheduler_runs` per reach (job, `goal-<id>@<the
 * stamp's unix seconds>`, household, person), so restarts and overlapping
 * containers never notify twice, and a push no device took is retried an
 * hour later while the reach is under a day old and the goal still at its
 * target. A member who turned the summary push off is not told (the app's
 * news share that switch until the goal gets its own); a member without a
 * device in the household is skipped. Households that are not active are
 * left alone. The payload names the goal, never an amount.
 */
@inject()
export default class GoalReachedJob implements ScheduledJob {
  readonly name = GOAL_REACHED_JOB

  constructor(
    protected goals: GoalService,
    protected notifier: PushNotifier,
    protected runs: SchedulerRuns,
    protected logger: Logger
  ) {}

  async tick({ now, signal }: TickContext): Promise<void> {
    const watched = await SavingsGoal.query()
      .where((query) => query.where('status', 'active').orWhereNotNull('reached_notified_at'))
      .preload('household')
      .orderBy('household_id')
      .orderBy('id')

    for (const goals of byHousehold(watched)) {
      if (signal.aborted) return
      const household = goals[0].household
      if (household.status !== 'active') continue
      try {
        await this.review(household, goals, { now, signal })
      } catch (error) {
        this.logger.error(
          { err: error, job: this.name, householdId: household.id },
          'goal reached push: could not review the household'
        )
      }
    }
  }

  /** One household's goals: stamps new reaches, rearms the lost ones, tells the members. */
  protected async review(household: Household, goals: SavingsGoal[], { now, signal }: TickContext) {
    const saved = await this.goals.savedAmounts(household, goals)

    for (const goal of goals) {
      if (signal.aborted) return
      const remainingCents = Math.max(0, goal.targetCents - (saved.get(goal.id) ?? 0))
      const action = reachAction({
        status: goal.status,
        notified: goal.reachedNotifiedAt !== null,
        remainingCents,
      })

      if (action === 'rearm') {
        await this.stamp(goal, null)
        continue
      }
      if (action === 'announce' && !(await this.stamp(goal, now()))) continue
      const stamp = goal.reachedNotifiedAt
      if (remainingCents === 0 && this.isRecent(stamp, now())) {
        await this.announce(household, goal, stamp, { now, signal })
      }
    }
  }

  /**
   * Sets (or clears) the goal's stamp only when nobody changed it since it
   * was read; false when another container got there first.
   */
  protected async stamp(goal: SavingsGoal, at: DateTime | null): Promise<boolean> {
    const query = db.from('savings_goals').where('id', goal.id)
    if (goal.reachedNotifiedAt === null) query.whereNull('reached_notified_at')
    else query.where('reached_notified_at', goal.reachedNotifiedAt.toJSDate())
    const updated = await query.update({ reached_notified_at: at?.toJSDate() ?? null })
    const changed = (Array.isArray(updated) ? updated.length : Number(updated)) > 0
    if (changed) goal.reachedNotifiedAt = at
    return changed
  }

  protected isRecent(stamp: DateTime | null, now: DateTime): stamp is DateTime {
    return stamp !== null && stamp >= now.minus(ANNOUNCE_WITHIN)
  }

  /** Tells every member due about this reach; each one once (scheduler_runs). */
  protected async announce(
    household: Household,
    goal: SavingsGoal,
    stamp: DateTime,
    { now, signal }: TickContext
  ) {
    const members = await HouseholdMember.query()
      .where('household_id', household.id)
      .preload('user')
      .orderBy('id')
    const optedOut = await this.optedOut(members.map((member) => member.userId))
    const periodKey = `goal-${goal.id}@${stamp.toUnixInteger()}`

    for (const { user } of members) {
      if (signal.aborted) return
      if (optedOut.has(user.id)) continue
      const devices = await this.notifier.devicesOf(user.id, household.id)
      if (devices.length === 0) continue

      const claim = await this.runs.claim(
        { job: this.name, periodKey, householdId: household.id, userId: user.id },
        now()
      )
      if (claim === null) continue
      const report = await this.notifier.notify(
        devices,
        goalReachedPayload(goal, user.locale),
        { ttlSeconds: TTL_SECONDS },
        now()
      )
      const result = pushRunResult(report)
      await this.runs.finish(claim, now(), result)
      this.logger.info(
        { job: this.name, householdId: household.id, userId: user.id, outcome: result.outcome },
        `goal reached push: household ${household.id} goal ${goal.id} user ${user.id}: ${describeReport(report)}`
      )
    }
  }

  /** Members who turned the summary push off (no row = the default, on). */
  protected async optedOut(userIds: number[]): Promise<Set<number>> {
    if (userIds.length === 0) return new Set()
    const rows = await UserNotificationSetting.query()
      .whereIn('user_id', userIds)
      .where('summary_ready', false)
      .select('user_id')
    return new Set(rows.map((row) => row.userId))
  }
}

/** The goals grouped by household, in the order read (by household id). */
function byHousehold(goals: SavingsGoal[]): SavingsGoal[][] {
  const groups = new Map<number, SavingsGoal[]>()
  for (const goal of goals) {
    const group = groups.get(goal.householdId) ?? []
    group.push(goal)
    groups.set(goal.householdId, group)
  }
  return [...groups.values()]
}
