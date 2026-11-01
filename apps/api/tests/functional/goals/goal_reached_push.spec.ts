import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import SavingsGoal from '#models/savings_goal'
import { freezeClock } from '#tests/helpers/ledger'
import GoalContribution from '#models/goal_contribution'
import { createHousehold } from '#tests/helpers/household'
import { TransactionFactory } from '#database/factories/transaction_factory'
import GoalReachedJob, { GOAL_REACHED_JOB } from '#services/goals/goal_reached_job'
import { fakePush, preferNotifications, subscribeDevice } from '#tests/helpers/push'

/** A Thursday morning in Brisbane. */
const NOW = DateTime.fromISO('2026-10-15T09:00:00+10:00', { setZone: true })

/** A household of two (owner reads English, the partner Spanish), each with one phone. */
async function couple(options: Parameters<typeof createHousehold>[0] = {}) {
  const fixture = await createHousehold({ users: 2, ...options })
  await fixture.member.merge({ locale: 'es' }).save()
  const ownerPhone = await subscribeDevice(fixture.owner, fixture.household)
  const partnerPhone = await subscribeDevice(fixture.member, fixture.household)
  return { ...fixture, ownerPhone, partnerPhone }
}

/** "Sofa": $3,000 to save, $2,500 already in, no account. */
function sofa(householdId: number, overrides: Partial<SavingsGoal> = {}) {
  return SavingsGoal.create({
    householdId,
    name: 'Sofa',
    targetCents: 300_000,
    startingCents: 250_000,
    sortOrder: 0,
    ...overrides,
  })
}

function contribute(goal: SavingsGoal, amountCents: number) {
  return GoalContribution.create({
    householdId: goal.householdId,
    goalId: goal.id,
    userId: null,
    amountCents,
    date: '2026-10-14',
  })
}

function tickAt(job: GoalReachedJob, instant: DateTime) {
  return job.tick({ now: () => instant, signal: new AbortController().signal })
}

function runsOf(householdId: number) {
  return db
    .from('scheduler_runs')
    .where('job', GOAL_REACHED_JOB)
    .where('household_id', householdId)
    .orderBy('id')
    .select('period_key', 'user_id', 'attempts', 'outcome')
}

test.group('Goal reached push', (group) => {
  group.each.setup(() => freezeClock(NOW.toISO()!))

  test('test_both_members_are_told_once_when_a_goal_reaches_its_target', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const { household, owner, member, ownerPhone, partnerPhone } = await couple()
    const goal = await sofa(household.id)
    await contribute(goal, 50_000)
    const job = await app.container.make(GoalReachedJob)

    await tickAt(job, NOW)
    await tickAt(job, NOW.plus({ minutes: 15 }))
    await tickAt(job, NOW.plus({ hours: 3 }))
    await tickAt(job, NOW.plus({ days: 2 }))

    assert.deepEqual(push.to(ownerPhone.endpoint), [
      {
        title: 'You reached Sofa',
        body: 'Nothing left to save. Open it to mark it as reached.',
        url: `/goals/${goal.id}`,
        tag: `goal-reached-${goal.id}`,
      },
    ])
    assert.deepEqual(push.to(partnerPhone.endpoint), [
      {
        title: 'Llegaste a tu meta: Sofa',
        body: 'Ya no falta nada por ahorrar. Ábrela para marcarla como alcanzada.',
        url: `/goals/${goal.id}`,
        tag: `goal-reached-${goal.id}`,
      },
    ])
    assert.equal(push.sent[0].options.ttlSeconds, 24 * 60 * 60)
    // The goal's name only: never an amount.
    assert.notMatch(JSON.stringify(push.sent.map((sent) => sent.payload)), /\$|3[.,]?000|2[.,]?500/)
    await goal.refresh()
    assert.equal(goal.reachedNotifiedAt?.toMillis(), NOW.toMillis())
    assert.equal(goal.status, 'active', 'reaching it is still the members’ call')
    const runs = await runsOf(household.id)
    assert.deepEqual(
      runs.map((run) => [run.period_key, run.user_id, run.attempts, run.outcome]),
      [
        [`goal-${goal.id}@${NOW.toUnixInteger()}`, owner.id, 1, 'sent'],
        [`goal-${goal.id}@${NOW.toUnixInteger()}`, member.id, 1, 'sent'],
      ]
    )
  })

  test('test_a_goal_on_an_account_is_announced_when_the_cleared_balance_gets_there', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const { household, accounts, ownerPhone, partnerPhone } = await couple({
      accounts: [{ name: 'Savings', kind: 'savings', openingBalanceCents: 90_000 }],
    })
    const goal = await sofa(household.id, { targetCents: 100_000, accountId: accounts[0].id })
    const job = await app.container.make(GoalReachedJob)
    // Pending money is not saved yet.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-10-14',
      amountCents: 10_000,
      status: 'pending',
    })
      .apply('income')
      .create()

    await tickAt(job, NOW)
    assert.deepEqual(push.sent, [])

    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-10-15',
      amountCents: 10_000,
    })
      .apply('income')
      .create()
    await tickAt(job, NOW.plus({ minutes: 15 }))

    assert.lengthOf(push.to(ownerPhone.endpoint), 1)
    assert.lengthOf(push.to(partnerPhone.endpoint), 1)
    await goal.refresh()
    assert.isNotNull(goal.reachedNotifiedAt)
  })

  test('test_a_goal_short_of_its_target_is_not_announced', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household } = await couple()
    const goal = await sofa(household.id)
    await contribute(goal, 49_999)

    await tickAt(await app.container.make(GoalReachedJob), NOW)

    assert.deepEqual(push.sent, [])
    await goal.refresh()
    assert.isNull(goal.reachedNotifiedAt)
    assert.lengthOf(await runsOf(household.id), 0)
  })

  test('test_a_goal_that_drops_below_its_target_and_gets_there_again_is_announced_again', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const { household, ownerPhone, partnerPhone } = await couple()
    const goal = await sofa(household.id)
    const reaching = await contribute(goal, 50_000)
    const job = await app.container.make(GoalReachedJob)

    await tickAt(job, NOW)
    assert.lengthOf(push.to(ownerPhone.endpoint), 1)

    // Money taken out: short again, so the next reach is a new one.
    const withdrawal = await contribute(goal, -20_000)
    await tickAt(job, NOW.plus({ hours: 1 }))
    await goal.refresh()
    assert.isNull(goal.reachedNotifiedAt, 'rearmed')
    assert.lengthOf(push.to(ownerPhone.endpoint), 1)

    await withdrawal.delete()
    await tickAt(job, NOW.plus({ hours: 2 }))
    await tickAt(job, NOW.plus({ hours: 2, minutes: 15 }))

    assert.lengthOf(push.to(ownerPhone.endpoint), 2)
    assert.lengthOf(push.to(partnerPhone.endpoint), 2)
    await goal.refresh()
    assert.equal(goal.reachedNotifiedAt?.toMillis(), NOW.plus({ hours: 2 }).toMillis())
    assert.isNotNull(await GoalContribution.find(reaching.id))
  })

  test('test_a_member_who_turned_the_summary_push_off_or_has_no_device_gets_nothing', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const fixture = await createHousehold({ users: 3 })
    const [owner, partner, third] = fixture.users
    const ownerPhone = await subscribeDevice(owner, fixture.household)
    const partnerPhone = await subscribeDevice(partner, fixture.household)
    // The app's news (summary ready, goal reached) share one switch.
    await preferNotifications(partner, { summaryReady: false })
    const goal = await sofa(fixture.household.id, { startingCents: 300_000 })

    await tickAt(await app.container.make(GoalReachedJob), NOW)

    assert.lengthOf(push.to(ownerPhone.endpoint), 1)
    assert.lengthOf(push.to(partnerPhone.endpoint), 0)
    assert.lengthOf(push.sent, 1)
    const runs = await runsOf(fixture.household.id)
    assert.deepEqual(
      runs.map((run) => run.user_id),
      [owner.id],
      `no run for ${partner.id} (off) nor ${third.id} (no device)`
    )
    await goal.refresh()
    assert.isNotNull(goal.reachedNotifiedAt)
  })

  test('test_a_goal_marked_reached_or_archived_is_not_announced', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household } = await couple()
    await sofa(household.id, { startingCents: 300_000, status: 'reached', reachedAt: NOW })
    await sofa(household.id, { name: 'Bike', startingCents: 300_000, status: 'archived' })

    await tickAt(await app.container.make(GoalReachedJob), NOW)

    assert.deepEqual(push.sent, [])
  })

  test('test_a_push_no_device_took_is_retried_an_hour_later', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household, member, ownerPhone, partnerPhone } = await couple()
    push.answer(partnerPhone.endpoint, {
      status: 'failed',
      error: 'E_PUSH_REJECTED: 503',
      statusCode: 503,
    })
    await sofa(household.id, { startingCents: 300_000 })
    const job = await app.container.make(GoalReachedJob)

    await tickAt(job, NOW)
    await tickAt(job, NOW.plus({ minutes: 30 }))
    assert.lengthOf(push.to(partnerPhone.endpoint), 1, 'not within the hour')

    push.answer(partnerPhone.endpoint, { status: 'sent' })
    await tickAt(job, NOW.plus({ minutes: 75 }))

    assert.lengthOf(push.to(partnerPhone.endpoint), 2)
    assert.lengthOf(push.to(ownerPhone.endpoint), 1, 'the owner is not told again')
    const runs = await runsOf(household.id)
    assert.deepInclude(
      runs.map((run) => [run.user_id, run.attempts, run.outcome]),
      [member.id, 2, 'sent']
    )
  })

  test('test_a_reach_older_than_a_day_is_no_longer_retried', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household, partnerPhone } = await couple()
    push.answer(partnerPhone.endpoint, {
      status: 'failed',
      error: 'E_PUSH_REJECTED: 503',
      statusCode: 503,
    })
    await sofa(household.id, { startingCents: 300_000 })
    const job = await app.container.make(GoalReachedJob)

    await tickAt(job, NOW)
    push.answer(partnerPhone.endpoint, { status: 'sent' })
    await tickAt(job, NOW.plus({ hours: 25 }))

    assert.lengthOf(push.to(partnerPhone.endpoint), 1)
  })

  test('test_a_household_pending_deletion_is_not_told', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household } = await couple()
    await household
      .merge({ status: 'pending_deletion', deletionScheduledAt: DateTime.now().plus({ days: 30 }) })
      .save()
    await sofa(household.id, { startingCents: 300_000 })

    await tickAt(await app.container.make(GoalReachedJob), NOW)

    assert.deepEqual(push.sent, [])
  })

  test('test_each_household_hears_only_about_its_own_goals', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const ours = await couple()
    const theirs = await couple()
    const goal = await sofa(theirs.household.id, { startingCents: 300_000 })

    await tickAt(await app.container.make(GoalReachedJob), NOW)

    assert.lengthOf(push.to(ours.ownerPhone.endpoint), 0)
    assert.lengthOf(push.to(ours.partnerPhone.endpoint), 0)
    assert.deepEqual(
      push.to(theirs.ownerPhone.endpoint).map((payload) => payload.url),
      [`/goals/${goal.id}`]
    )
  })
})
