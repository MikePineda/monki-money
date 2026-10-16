import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import PushSubscription from '#models/push_subscription'
import { createHousehold } from '#tests/helpers/household'
import SchedulerRuns from '#services/scheduler/scheduler_runs'
import { Scheduler } from '#services/scheduler/scheduler'
import PushNotifier from '#services/push/push_notifier'
import type { PushPayload } from '#domain/push/push_payload'
import {
  PushSender,
  type PushDelivery,
  type PushSendOptions,
  type PushTarget,
} from '#services/push/push_sender'
import DailyReminderJob, { DAILY_REMINDER_JOB } from '#services/push/daily_reminder_job'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'
import { fakePush, preferNotifications, subscribeDevice } from '#tests/helpers/push'

/** Friday 16 October 2026 in Brisbane (UTC+10, no daylight saving). */
const EVENING = DateTime.fromISO('2026-10-16T20:05:00+10:00', { setZone: true })

/** A person (Brisbane) who asked for the 20:00 reminder, with a phone. */
async function reminded(options: { reminderTime?: string; locale?: 'en' | 'es' } = {}) {
  const fixture = await createHousehold({
    users: 2,
    locale: options.locale,
    accounts: [{ name: 'Everyday' }, { name: 'Savings', kind: 'savings' }],
  })
  await preferNotifications(fixture.owner, {
    dailyReminder: true,
    reminderTime: options.reminderTime ?? '20:00',
  })
  const phone = await subscribeDevice(fixture.owner, fixture.household)
  return { ...fixture, phone }
}

/** An entry `userId` typed in at `createdAt` (booked on `date`). */
function entry(
  fixture: Awaited<ReturnType<typeof reminded>>,
  userId: number,
  createdAt: DateTime,
  date = '2026-10-10'
) {
  return TransactionFactory.merge({
    householdId: fixture.household.id,
    accountId: fixture.accounts[0].id,
    createdByUserId: userId,
    payee: 'Woolworths Metro',
    amountCents: -4_250,
    date,
    createdAt,
  }).create()
}

function tickAt(job: DailyReminderJob, instant: DateTime) {
  return job.tick({ now: () => instant, signal: new AbortController().signal })
}

interface RunRow {
  period_key: string
  household_id: number
  attempts: number
  outcome: string | null
}

function runsOf(userId: number): Promise<RunRow[]> {
  return db
    .from('scheduler_runs')
    .where('job', DAILY_REMINDER_JOB)
    .where('user_id', userId)
    .orderBy('id')
    .select('period_key', 'household_id', 'attempts', 'outcome')
}

/** One column of the person's runs, oldest first. */
async function runColumn<Value>(userId: number, pick: (run: RunRow) => Value): Promise<Value[]> {
  const runs = await runsOf(userId)
  return runs.map(pick)
}

test.group('Daily reminder push', () => {
  test('test_the_reminder_is_sent_once_after_the_reminder_time', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded()
    const job = await app.container.make(DailyReminderJob)

    await tickAt(job, EVENING.set({ hour: 19, minute: 50 }))
    assert.deepEqual(push.sent, [], 'not before 20:00')

    await tickAt(job, EVENING)
    await tickAt(job, EVENING.plus({ minutes: 15 }))
    await tickAt(job, EVENING.plus({ hours: 2 }))

    assert.deepEqual(push.to(fixture.phone.endpoint), [
      {
        title: 'Did you log anything today?',
        body: 'A quick entry now keeps the month accurate.',
        url: '/add',
        tag: 'daily-reminder',
      },
    ])
    assert.equal(push.sent[0].options.ttlSeconds, 4 * 60 * 60)
    assert.deepEqual(await runsOf(fixture.owner.id), [
      {
        period_key: '2026-10-16',
        household_id: fixture.household.id,
        attempts: 1,
        outcome: 'sent',
      },
    ])
  })

  test('test_the_reminder_is_skipped_when_the_person_logged_something_today', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded()
    // Typed in this morning, booked on a date last week: today's logging all the same.
    await entry(fixture, fixture.owner.id, EVENING.set({ hour: 8 }))
    const job = await app.container.make(DailyReminderJob)

    await tickAt(job, EVENING)
    await tickAt(job, EVENING.plus({ hours: 1 }))

    assert.deepEqual(push.sent, [])
    assert.deepEqual(await runColumn(fixture.owner.id, (run) => [run.period_key, run.outcome]), [
      ['2026-10-16', 'skipped:logged-today'],
    ])
  })

  test('test_a_transfer_counts_as_logging_too', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded()
    await TransferFactory.merge({
      householdId: fixture.household.id,
      fromAccountId: fixture.accounts[0].id,
      toAccountId: fixture.accounts[1].id,
      createdByUserId: fixture.owner.id,
      date: '2026-10-16',
      amountCents: 10_000,
    }).create()

    await tickAt(await app.container.make(DailyReminderJob), EVENING)

    assert.deepEqual(push.sent, [])
  })

  test('test_entries_from_yesterday_or_by_the_partner_do_not_count', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded()
    // 23:30 yesterday in Brisbane, and the partner's entry today.
    await entry(fixture, fixture.owner.id, DateTime.fromISO('2026-10-15T23:30:00+10:00'))
    await entry(fixture, fixture.member.id, EVENING.set({ hour: 12 }))

    await tickAt(await app.container.make(DailyReminderJob), EVENING)

    assert.lengthOf(push.to(fixture.phone.endpoint), 1)
  })

  test('test_the_reminder_follows_the_household_time_zone_and_the_chosen_time', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const brisbane = await reminded({ reminderTime: '19:30' })
    const mexico = await reminded()
    await mexico.household.merge({ timezone: 'America/Mexico_City' }).save()
    const job = await app.container.make(DailyReminderJob)

    // 19:35 in Brisbane = 03:35 in Mexico City.
    await tickAt(job, EVENING.set({ hour: 19, minute: 35 }))
    assert.lengthOf(push.to(brisbane.phone.endpoint), 1)
    assert.lengthOf(push.to(mexico.phone.endpoint), 0)

    // 20:00 in Mexico City (UTC-6) is 12:00 on Saturday in Brisbane.
    await tickAt(job, DateTime.fromISO('2026-10-17T02:00:00Z'))
    assert.lengthOf(push.to(mexico.phone.endpoint), 1)
    assert.deepEqual(await runColumn(mexico.owner.id, (run) => run.period_key), ['2026-10-16'])
  })

  test('test_each_day_gets_its_own_reminder', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded()
    const job = await app.container.make(DailyReminderJob)

    await tickAt(job, EVENING)
    await tickAt(job, EVENING.plus({ days: 1 }).set({ hour: 7 }))
    await tickAt(job, EVENING.plus({ days: 1 }))

    assert.lengthOf(push.to(fixture.phone.endpoint), 2)
    assert.deepEqual(await runColumn(fixture.owner.id, (run) => run.period_key), [
      '2026-10-16',
      '2026-10-17',
    ])
  })

  test('test_the_reminder_is_opt_in_and_needs_a_device', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded()
    // The partner has a phone but never turned the reminder on.
    const partnerPhone = await subscribeDevice(fixture.member, fixture.household)
    // A third person turned it on but has no device.
    const lonely = await createHousehold()
    await preferNotifications(lonely.owner, { dailyReminder: true })

    await tickAt(await app.container.make(DailyReminderJob), EVENING)

    assert.lengthOf(push.to(fixture.phone.endpoint), 1)
    assert.lengthOf(push.to(partnerPhone.endpoint), 0)
    assert.lengthOf(push.sent, 1)
    assert.lengthOf(await runsOf(lonely.owner.id), 0)
  })

  test('test_a_410_removes_the_subscription_and_the_day_is_recorded', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded()
    push.answer(fixture.phone.endpoint, { status: 'gone', statusCode: 410 })
    const job = await app.container.make(DailyReminderJob)

    await tickAt(job, EVENING)
    await tickAt(job, EVENING.plus({ hours: 2 }))

    assert.isNull(await PushSubscription.find(fixture.phone.id))
    assert.lengthOf(push.sent, 1, 'never posted to the gone endpoint again')
    assert.deepEqual(await runColumn(fixture.owner.id, (run) => run.outcome), ['skipped:no-device'])
  })

  test('test_a_failed_push_is_retried_an_hour_later_unless_something_was_logged', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded()
    push.answer(fixture.phone.endpoint, {
      status: 'failed',
      error: 'E_PUSH_FAILED: timeout',
      statusCode: null,
    })
    const job = await app.container.make(DailyReminderJob)

    await tickAt(job, EVENING)
    assert.deepEqual(await runColumn(fixture.owner.id, (run) => [run.attempts, run.outcome]), [
      [1, 'failed'],
    ])

    // Logged before the retry: the reminder is no longer needed.
    await entry(fixture, fixture.owner.id, EVENING.plus({ minutes: 30 }))
    push.answer(fixture.phone.endpoint, { status: 'sent' })
    await tickAt(job, EVENING.plus({ minutes: 70 }))

    assert.lengthOf(push.sent, 1, 'only the failed attempt')
    assert.deepEqual(await runColumn(fixture.owner.id, (run) => [run.attempts, run.outcome]), [
      [2, 'skipped:logged-today'],
    ])
  })

  test('test_the_reminder_speaks_the_persons_language_and_never_names_money', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const fixture = await reminded({ locale: 'es' })
    // The partner's purchase today (a merchant and an amount the payload must not carry).
    await entry(fixture, fixture.member.id, EVENING.set({ hour: 9 }))

    await tickAt(await app.container.make(DailyReminderJob), EVENING)

    assert.deepEqual(push.to(fixture.phone.endpoint), [
      {
        title: '¿Registraste algo hoy?',
        body: 'Un registro rápido ahora mantiene el mes al día.',
        url: '/add',
        tag: 'daily-reminder',
      },
    ])
    assert.notMatch(JSON.stringify(push.sent.map((sent) => sent.payload)), /Woolworths|42[.,]50|\$/)
  })
})

test.group('Daily reminder push: a push service that never answers', () => {
  test('test_a_send_that_never_settles_fails_at_its_deadline_and_the_tick_finishes', async ({
    assert,
    cleanup,
  }) => {
    /** A push service that accepts the request and never answers. */
    class HangingSender extends PushSender {
      readonly signals: AbortSignal[] = []
      send(_target: PushTarget, _payload: PushPayload, options: PushSendOptions) {
        this.signals.push(options.signal)
        return new Promise<PushDelivery>(() => {})
      }
    }
    class QuickDeadlineNotifier extends PushNotifier {
      protected override sendTimeoutMs = 50
    }
    const sender = new HangingSender()
    app.container.swap(PushNotifier, () => new QuickDeadlineNotifier(sender))
    cleanup(() => app.container.restore(PushNotifier))
    const first = await reminded()
    const second = await reminded()
    const scheduler = new Scheduler([await app.container.make(DailyReminderJob)], () => EVENING, {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    })
    const started = Date.now()

    await scheduler.tick()

    assert.isBelow(Date.now() - started, 2_000, 'the tick did not wait on the push service')
    assert.lengthOf(sender.signals, 2, 'the next person still got their turn')
    assert.isTrue(
      sender.signals.every((signal) => signal.aborted),
      'each request was dropped'
    )
    for (const fixture of [first, second]) {
      const [run] = await runsOf(fixture.owner.id)
      assert.include(run, { attempts: 1, outcome: 'failed' })
      await fixture.phone.refresh()
      assert.equal(fixture.phone.failures, 1)
    }
    const errors = await db
      .from('scheduler_runs')
      .whereIn('user_id', [first.owner.id, second.owner.id])
      .select('error')
    assert.deepEqual(
      errors.map((row) => row.error),
      ['E_PUSH_TIMEOUT: no answer within 50 ms', 'E_PUSH_TIMEOUT: no answer within 50 ms']
    )
  })
})

test.group('Scheduler lock: runs per person', () => {
  test('test_a_person_level_run_is_claimed_once_per_person_and_period', async ({ assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const runs = await app.container.make(SchedulerRuns)
    const key = { job: DAILY_REMINDER_JOB, periodKey: '2026-10-16', householdId: household.id }

    const mine = await runs.claim({ ...key, userId: owner.id }, EVENING)
    const partners = await runs.claim({ ...key, userId: member.id }, EVENING)
    const householdWide = await runs.claim(key, EVENING)

    assert.isNotNull(mine)
    assert.isNotNull(partners)
    assert.isNotNull(householdWide, 'a household-wide run is its own row')
    assert.isNull(await runs.claim({ ...key, userId: owner.id }, EVENING.plus({ minutes: 1 })))
    assert.isNull(await runs.claim(key, EVENING.plus({ minutes: 1 })))
    assert.isTrue(await runs.isOpen({ ...key, userId: owner.id }), 'still running')
    await runs.finish(mine!, EVENING, { outcome: 'sent' })
    assert.isFalse(await runs.isOpen({ ...key, userId: owner.id }))
  })
})
