import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import SavingsGoal from '#models/savings_goal'
import { freezeClock } from '#tests/helpers/ledger'
import GoalContribution from '#models/goal_contribution'
import { countQueries } from '#tests/helpers/queries'
import { createHousehold } from '#tests/helpers/household'

/** Mid-October 2026 in Brisbane (the households' time zone). */
const NOW = '2026-10-15T09:00:00+10:00'

const CONTRIBUTION_FIELDS = ['id', 'goalId', 'userId', 'amountCents', 'date', 'memo', 'createdAt']

/** A goal without an account, started in August with $500 already saved. */
async function manualGoal(householdId: number, overrides: Partial<SavingsGoal> = {}) {
  const goal = await SavingsGoal.create({
    householdId,
    name: 'Sofa',
    targetCents: 300_000,
    startingCents: 50_000,
    monthlyContributionCents: 20_000,
    sortOrder: 0,
    ...overrides,
  })
  goal.createdAt = DateTime.fromISO('2026-08-14T10:00:00+10:00')
  await goal.save()
  return goal
}

function contribute(
  goal: SavingsGoal,
  userId: number | null,
  amountCents: number,
  date: string,
  memo: string | null = null
) {
  return GoalContribution.create({
    householdId: goal.householdId,
    goalId: goal.id,
    userId,
    amountCents,
    date,
    memo,
  })
}

test.group('Goal contributions', (group) => {
  group.each.setup(() => freezeClock(NOW))

  test('test_a_member_logs_a_contribution_on_a_goal_without_an_account', async ({
    client,
    assert,
    db,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const goal = await manualGoal(household.id)

    const response = await client
      .post(`/api/v1/goals/${goal.id}/contributions`)
      .json({ amountCents: 25_000, date: '2026-10-15', memo: '  Birthday money ' })
      .actingAs(member)

    response.assertStatus(201)
    const created = response.body().data
    assert.sameMembers(Object.keys(created), CONTRIBUTION_FIELDS)
    assert.include(created, {
      goalId: goal.id,
      userId: member.id,
      amountCents: 25_000,
      date: '2026-10-15',
      memo: 'Birthday money',
    })
    await db.assertHas('goal_contributions', {
      id: created.id,
      household_id: household.id,
      goal_id: goal.id,
      user_id: member.id,
      amount_cents: 25_000,
    })

    // The partner sees it too.
    const listed = await client.get(`/api/v1/goals/${goal.id}/contributions`).actingAs(owner)
    listed.assertStatus(200)
    assert.deepEqual(listed.body().data, [created])
  })

  test('test_a_withdrawal_is_a_negative_contribution', async ({ client, assert }) => {
    const { household, owner } = await createHousehold()
    const goal = await manualGoal(household.id)

    const response = await client
      .post(`/api/v1/goals/${goal.id}/contributions`)
      .json({ amountCents: -10_000, date: '2026-10-01' })
      .actingAs(owner)

    response.assertStatus(201)
    assert.include(response.body().data, { amountCents: -10_000, memo: null })
    const projection = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)
    assert.equal(projection.body().data.savedCents, 40_000)
  })

  test('test_contributions_are_listed_newest_first', async ({ client, assert }) => {
    const { household, owner } = await createHousehold()
    const goal = await manualGoal(household.id)
    const older = await contribute(goal, owner.id, 1_000, '2026-09-02')
    const sameDayFirst = await contribute(goal, owner.id, 2_000, '2026-10-03')
    const sameDayLater = await contribute(goal, owner.id, 3_000, '2026-10-03')
    const newest = await contribute(goal, null, 4_000, '2026-10-10', 'Cash')
    // Another goal's are not listed.
    const other = await manualGoal(household.id, { name: 'Car', sortOrder: 1 })
    await contribute(other, owner.id, 9_000, '2026-10-12')

    const response = await client.get(`/api/v1/goals/${goal.id}/contributions`).actingAs(owner)

    response.assertStatus(200)
    assert.deepEqual(
      response.body().data.map((row: any) => row.id),
      [newest.id, sameDayLater.id, sameDayFirst.id, older.id]
    )
    assert.include(response.body().data[0], { userId: null, memo: 'Cash', date: '2026-10-10' })
  })

  test('test_contributions_count_in_the_saved_amount_projection_and_history', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await createHousehold()
    const goal = await manualGoal(household.id)
    await contribute(goal, owner.id, 20_000, '2026-08-31')
    await contribute(goal, owner.id, 15_000, '2026-09-01')
    await contribute(goal, owner.id, -5_000, '2026-09-20')
    await contribute(goal, owner.id, 10_000, '2026-10-02')

    const response = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)

    response.assertStatus(200)
    const projection = response.body().data
    assert.include(projection, {
      savedCents: 90_000,
      remainingCents: 210_000,
      rateSource: 'contribution',
      monthlyRateCents: 20_000,
      monthsToGoal: 11,
    })
    // Real months from the goal's start, the current month last.
    assert.deepEqual(projection.history, [
      { month: '2026-08', balanceCents: 70_000 },
      { month: '2026-09', balanceCents: 80_000 },
      { month: '2026-10', balanceCents: 90_000 },
    ])
    assert.deepEqual(projection.series[0], { month: '2026-10', projectedCents: 90_000 })

    // The list's projections say the same.
    const listed = await client.get('/api/v1/goals?include=projection').actingAs(owner)
    assert.deepEqual(listed.body().data[0].projection, projection)
  })

  test('test_a_contribution_before_the_goal_was_created_starts_its_history', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await createHousehold()
    const goal = await manualGoal(household.id)
    await contribute(goal, owner.id, 5_000, '2026-06-10')

    const response = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)

    assert.deepEqual(
      response.body().data.history.map((point: any) => point.month),
      ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    )
  })

  test('test_the_goals_list_reads_contributions_once_for_every_goal', async ({
    client,
    assert,
  }) => {
    async function homeWith(count: number) {
      const home = await createHousehold()
      for (let index = 0; index < count; index++) {
        const goal = await manualGoal(home.household.id, {
          name: `Goal ${index}`,
          sortOrder: index,
        })
        await contribute(goal, home.owner.id, 1_000 * (index + 1), '2026-10-01')
      }
      return home
    }
    const one = await homeWith(1)
    const three = await homeWith(3)
    await client.get('/api/v1/goals?include=projection').actingAs(one.owner)

    const forOne = await countQueries(() =>
      client.get('/api/v1/goals?include=projection').actingAs(one.owner)
    )
    let body: any
    const forThree = await countQueries(async () => {
      const response = await client.get('/api/v1/goals?include=projection').actingAs(three.owner)
      body = response.body()
    })

    assert.deepEqual(
      body.data.map((row: any) => row.projection.savedCents),
      [51_000, 52_000, 53_000]
    )
    assert.equal(forThree, forOne)
  })

  test('test_a_contribution_is_deleted_and_leaves_the_saved_amount', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const goal = await manualGoal(household.id)
    const kept = await contribute(goal, owner.id, 10_000, '2026-10-01')
    const mistake = await contribute(goal, owner.id, 99_000, '2026-10-02')

    // Any member deletes any contribution of the household's goals.
    const response = await client
      .delete(`/api/v1/goals/${goal.id}/contributions/${mistake.id}`)
      .actingAs(member)

    response.assertStatus(204)
    assert.isNull(await GoalContribution.find(mistake.id))
    assert.isNotNull(await GoalContribution.find(kept.id))
    const projection = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)
    assert.equal(projection.body().data.savedCents, 60_000)

    const again = await client
      .delete(`/api/v1/goals/${goal.id}/contributions/${mistake.id}`)
      .actingAs(member)
    again.assertStatus(404)
  })

  test('test_a_contribution_is_only_reached_through_its_own_goal', async ({ client, assert }) => {
    const { household, owner } = await createHousehold()
    const goal = await manualGoal(household.id)
    const other = await manualGoal(household.id, { name: 'Car', sortOrder: 1 })
    const contribution = await contribute(other, owner.id, 10_000, '2026-10-01')

    const response = await client
      .delete(`/api/v1/goals/${goal.id}/contributions/${contribution.id}`)
      .actingAs(owner)

    response.assertStatus(404)
    assert.isNotNull(await GoalContribution.find(contribution.id))
  })

  test('test_a_goal_that_tracks_an_account_takes_no_contributions', async ({ client, assert }) => {
    const { household, owner, accounts } = await createHousehold({
      accounts: [{ name: 'Savings', kind: 'savings', openingBalanceCents: 70_000 }],
    })
    const goal = await manualGoal(household.id)
    // Logged while it had no account, then it was pointed at one.
    await contribute(goal, owner.id, 10_000, '2026-10-01')
    goal.accountId = accounts[0].id
    await goal.save()

    const response = await client
      .post(`/api/v1/goals/${goal.id}/contributions`)
      .json({ amountCents: 5_000, date: '2026-10-15' })
      .actingAs(owner)

    response.assertStatus(409)
    response.assertBodyContains({ code: 'E_GOAL_TRACKS_ACCOUNT' })
    // The account's balance is what is saved; the old rows are ignored but kept.
    const projection = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)
    assert.equal(projection.body().data.savedCents, 70_000)
    assert.lengthOf(await GoalContribution.query().where('goal_id', goal.id), 1)
  })

  test('test_a_contribution_needs_an_amount_and_a_day_up_to_today', async ({ client, assert }) => {
    const { household, owner } = await createHousehold()
    const goal = await manualGoal(household.id)
    const url = `/api/v1/goals/${goal.id}/contributions`

    const zero = await client.post(url).json({ amountCents: 0, date: '2026-10-15' }).actingAs(owner)
    zero.assertStatus(422)
    zero.assertBodyContains({ errors: [{ field: 'amountCents', rule: 'notZero' }] })

    const decimals = await client
      .post(url)
      .json({ amountCents: 10.5, date: '2026-10-15' })
      .actingAs(owner)
    decimals.assertStatus(422)

    // Tomorrow in Brisbane is not saved yet.
    const future = await client
      .post(url)
      .json({ amountCents: 1_000, date: '2026-10-16' })
      .actingAs(owner)
    future.assertStatus(422)
    future.assertBodyContains({ errors: [{ field: 'date', rule: 'future' }] })

    const badDate = await client
      .post(url)
      .json({ amountCents: 1_000, date: '2026-02-30' })
      .actingAs(owner)
    badDate.assertStatus(422)

    const longMemo = await client
      .post(url)
      .json({ amountCents: 1_000, date: '2026-10-15', memo: 'x'.repeat(141) })
      .actingAs(owner)
    longMemo.assertStatus(422)

    assert.lengthOf(await GoalContribution.query().where('goal_id', goal.id), 0)
  })

  test('test_deleting_a_goal_drops_its_contributions', async ({ client, assert }) => {
    const { household, owner } = await createHousehold()
    const goal = await manualGoal(household.id)
    await contribute(goal, owner.id, 10_000, '2026-10-01')

    const response = await client.delete(`/api/v1/goals/${goal.id}`).actingAs(owner)

    response.assertStatus(204)
    assert.lengthOf(await GoalContribution.query().where('goal_id', goal.id), 0)
  })
})
