import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { freezeClock } from '#tests/helpers/ledger'
import MonthlyInsight from '#models/monthly_insight'
import PushSubscription from '#models/push_subscription'
import { createHousehold } from '#tests/helpers/household'
import { Scheduler } from '#services/scheduler/scheduler'
import { TransactionFactory } from '#database/factories/transaction_factory'
import MonthlyInsightsJob from '#services/insights/monthly_insights_job'
import SummaryReadyJob, { SUMMARY_READY_JOB } from '#services/push/summary_ready_job'
import { fakePush, preferNotifications, subscribeDevice } from '#tests/helpers/push'

/** The scheduled run of September: 1 October, 08:30 in Brisbane. */
const FIRST_OF_OCTOBER = DateTime.fromISO('2026-10-01T08:30:00+10:00', { setZone: true })

/** A household of two (owner reads English, the partner Spanish), each with one phone. */
async function couple() {
  const fixture = await createHousehold({ users: 2, accounts: [{ name: 'Everyday' }] })
  await fixture.member.merge({ locale: 'es' }).save()
  const ownerPhone = await subscribeDevice(fixture.owner, fixture.household)
  const partnerPhone = await subscribeDevice(fixture.member, fixture.household)
  return { ...fixture, ownerPhone, partnerPhone }
}

/** September's summary as the scheduler writes it (no person behind it). */
async function scheduledSummary(
  householdId: number,
  options: { generatedAt?: DateTime; byUserId?: number | null } = {}
) {
  const stamp = (options.generatedAt ?? FIRST_OF_OCTOBER.minus({ minutes: 1 })).toJSDate()
  const [row] = await db
    .table('monthly_insights')
    .insert({
      household_id: householdId,
      month: '2026-09',
      locale: 'en',
      headline: 'Spent $812.40 at Woolworths',
      body_markdown: 'Groceries were **$812.40**.',
      highlights: '[]',
      input_json: '{}',
      model: 'fake',
      generated_by_user_id: options.byUserId ?? null,
      generated_at: stamp,
      created_at: stamp,
      updated_at: stamp,
    })
    .returning('id')
  return MonthlyInsight.findOrFail(row.id)
}

function tickAt(job: SummaryReadyJob, instant: DateTime) {
  return job.tick({ now: () => instant, signal: new AbortController().signal })
}

function runsOf(householdId: number) {
  return db
    .from('scheduler_runs')
    .where('job', SUMMARY_READY_JOB)
    .where('household_id', householdId)
    .orderBy('user_id')
    .select('period_key', 'user_id', 'attempts', 'outcome')
}

test.group('Summary ready push', (group) => {
  group.each.setup(() => freezeClock(FIRST_OF_OCTOBER.toISO()!))

  test('test_every_member_is_told_once_in_their_own_language', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household, owner, member, ownerPhone, partnerPhone } = await couple()
    const insight = await scheduledSummary(household.id)
    const job = await app.container.make(SummaryReadyJob)

    await tickAt(job, FIRST_OF_OCTOBER)
    await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes: 15 }))
    await tickAt(job, FIRST_OF_OCTOBER.plus({ hours: 3 }))

    assert.deepEqual(push.to(ownerPhone.endpoint), [
      {
        title: 'Your September summary is ready',
        body: 'See how September went in a minute.',
        url: '/month/2026-09',
        tag: 'summary-2026-09',
      },
    ])
    assert.deepEqual(push.to(partnerPhone.endpoint), [
      {
        title: 'Tu resumen de septiembre está listo',
        body: 'Mira en un minuto cómo te fue en septiembre.',
        url: '/month/2026-09',
        tag: 'summary-2026-09',
      },
    ])
    assert.equal(push.sent[0].options.ttlSeconds, 24 * 60 * 60)
    // The month only: never what the summary says.
    assert.notMatch(
      JSON.stringify(push.sent.map((sent) => sent.payload)),
      /812[.,]40|Woolworths|\$/
    )
    await insight.refresh()
    assert.equal(insight.notifiedAt?.toMillis(), FIRST_OF_OCTOBER.toMillis())
    const runs = await runsOf(household.id)
    assert.deepEqual(
      runs.map((run) => [run.period_key, run.user_id, run.attempts, run.outcome]),
      [
        ['2026-09', owner.id, 1, 'sent'],
        ['2026-09', member.id, 1, 'sent'],
      ]
    )
    await ownerPhone.refresh()
    assert.equal(ownerPhone.lastUsedAt?.toMillis(), FIRST_OF_OCTOBER.toMillis())
  })

  test('test_the_scheduled_summary_is_announced_in_the_tick_that_writes_it', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const { household, owner, accounts, ownerPhone, partnerPhone } = await couple()
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      createdByUserId: owner.id,
      date: '2026-09-03',
      amountCents: -8_000,
    }).create()
    const scheduler = new Scheduler(
      [await app.container.make(MonthlyInsightsJob), await app.container.make(SummaryReadyJob)],
      () => FIRST_OF_OCTOBER,
      { info: () => undefined, warn: () => undefined, error: () => undefined }
    )

    await scheduler.tick()

    assert.lengthOf(await MonthlyInsight.query().where('household_id', household.id), 1)
    assert.lengthOf(push.to(ownerPhone.endpoint), 1)
    assert.lengthOf(push.to(partnerPhone.endpoint), 1)
  })

  test('test_a_member_who_turned_the_summary_off_or_has_no_device_gets_nothing', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const fixture = await createHousehold({ users: 3 })
    const [owner, partner, third] = fixture.users
    const ownerPhone = await subscribeDevice(owner, fixture.household)
    const partnerPhone = await subscribeDevice(partner, fixture.household)
    await preferNotifications(partner, { summaryReady: false })
    const insight = await scheduledSummary(fixture.household.id)

    await tickAt(await app.container.make(SummaryReadyJob), FIRST_OF_OCTOBER)

    assert.lengthOf(push.to(ownerPhone.endpoint), 1)
    assert.lengthOf(push.to(partnerPhone.endpoint), 0)
    assert.lengthOf(push.sent, 1)
    const runs = await runsOf(fixture.household.id)
    assert.deepEqual(
      runs.map((run) => run.user_id),
      [owner.id],
      `no run for ${partner.id} (off) nor ${third.id} (no device)`
    )
    await insight.refresh()
    assert.isNotNull(insight.notifiedAt)
  })

  test('test_a_summary_someone_tapped_or_written_long_ago_is_not_announced', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const tapped = await couple()
    const old = await couple()
    await scheduledSummary(tapped.household.id, { byUserId: tapped.owner.id })
    await scheduledSummary(old.household.id, {
      generatedAt: FIRST_OF_OCTOBER.minus({ days: 2 }),
    })

    await tickAt(await app.container.make(SummaryReadyJob), FIRST_OF_OCTOBER)

    assert.deepEqual(push.sent, [])
  })

  test('test_a_regenerated_summary_is_never_announced_twice', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household, ownerPhone } = await couple()
    const insight = await scheduledSummary(household.id)
    const job = await app.container.make(SummaryReadyJob)
    await tickAt(job, FIRST_OF_OCTOBER)

    // `insights:generate --force` rewrites the month; the flag is cleared by hand.
    await insight
      .merge({ notifiedAt: null, generatedAt: FIRST_OF_OCTOBER.plus({ hours: 1 }) })
      .save()
    await tickAt(job, FIRST_OF_OCTOBER.plus({ hours: 2 }))

    assert.lengthOf(push.to(ownerPhone.endpoint), 1)
    await insight.refresh()
    assert.isNotNull(insight.notifiedAt, 'nothing left to send: told again')
  })

  test('test_a_gone_device_is_deleted_and_the_other_ones_still_get_it', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const { household, owner, ownerPhone, partnerPhone } = await couple()
    const ownerTablet = await subscribeDevice(owner, household)
    push.answer(ownerPhone.endpoint, { status: 'gone', statusCode: 410 })
    await scheduledSummary(household.id)

    await tickAt(await app.container.make(SummaryReadyJob), FIRST_OF_OCTOBER)

    assert.isNull(await PushSubscription.find(ownerPhone.id), '410: subscription deleted')
    assert.lengthOf(push.to(ownerTablet.endpoint), 1)
    assert.lengthOf(push.to(partnerPhone.endpoint), 1)
  })

  test('test_a_push_no_device_took_is_retried_an_hour_later', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household, member, ownerPhone, partnerPhone } = await couple()
    push.answer(partnerPhone.endpoint, {
      status: 'failed',
      error: 'E_PUSH_REJECTED: 503',
      statusCode: 503,
    })
    const insight = await scheduledSummary(household.id)
    const job = await app.container.make(SummaryReadyJob)

    await tickAt(job, FIRST_OF_OCTOBER)
    await partnerPhone.refresh()
    assert.equal(partnerPhone.failures, 1, 'kept, one failure counted')
    await insight.refresh()
    assert.isNull(insight.notifiedAt, 'the partner is still owed it')

    await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes: 30 }))
    assert.lengthOf(push.to(partnerPhone.endpoint), 1, 'not within the hour')

    push.answer(partnerPhone.endpoint, { status: 'sent' })
    await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes: 75 }))

    assert.lengthOf(push.to(partnerPhone.endpoint), 2)
    assert.lengthOf(push.to(ownerPhone.endpoint), 1, 'the owner is not told again')
    await partnerPhone.refresh()
    assert.equal(partnerPhone.failures, 0)
    await insight.refresh()
    assert.isNotNull(insight.notifiedAt)
    const runs = await runsOf(household.id)
    assert.deepInclude(
      runs.map((run) => [run.user_id, run.attempts, run.outcome]),
      [member.id, 2, 'sent']
    )
  })

  test('test_a_household_pending_deletion_is_not_told', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household } = await couple()
    await household
      .merge({ status: 'pending_deletion', deletionScheduledAt: DateTime.now().plus({ days: 30 }) })
      .save()
    const insight = await scheduledSummary(household.id)

    await tickAt(await app.container.make(SummaryReadyJob), FIRST_OF_OCTOBER)

    assert.deepEqual(push.sent, [])
    await insight.refresh()
    assert.isNotNull(insight.notifiedAt)
  })
})
