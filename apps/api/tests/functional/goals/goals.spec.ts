import { test } from '@japa/runner'
import SavingsGoal from '#models/savings_goal'
import { freezeClock } from '#tests/helpers/ledger'
import { countQueries } from '#tests/helpers/queries'
import { createHousehold } from '#tests/helpers/household'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

/** Mid-October 2026 in Brisbane (the households' time zone). */
const NOW = '2026-10-15T09:00:00+10:00'

const GOAL_FIELDS = [
  'id',
  'name',
  'targetCents',
  'targetDate',
  'startingCents',
  'monthlyContributionCents',
  'accountId',
  'userId',
  'status',
  'reachedAt',
  'sortOrder',
  'createdAt',
  'updatedAt',
]

test.group('Goals', (group) => {
  group.each.setup(() => freezeClock(NOW))

  test('test_goal_crud_round_trip', async ({ client, assert }) => {
    const { owner, member, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Savings', kind: 'savings' }],
    })

    const created = await client
      .post('/api/v1/goals')
      .json({
        name: 'Trip to Japan',
        targetCents: 800_000,
        targetDate: '2027-09-30',
        startingCents: 50_000,
        monthlyContributionCents: 40_000,
        accountId: accounts[0].id,
        userId: member.id,
      })
      .actingAs(owner)

    created.assertStatus(201)
    const goal = created.body().data
    assert.sameMembers(Object.keys(goal), GOAL_FIELDS)
    assert.include(goal, {
      name: 'Trip to Japan',
      targetCents: 800_000,
      targetDate: '2027-09-30',
      startingCents: 50_000,
      monthlyContributionCents: 40_000,
      accountId: accounts[0].id,
      userId: member.id,
      status: 'active',
      reachedAt: null,
      sortOrder: 0,
    })

    const shown = await client.get(`/api/v1/goals/${goal.id}`).actingAs(member)
    shown.assertStatus(200)
    assert.deepEqual(shown.body().data, goal)

    const updated = await client
      .patch(`/api/v1/goals/${goal.id}`)
      .json({ name: 'Japan', targetDate: null, accountId: null, userId: null })
      .actingAs(member)
    updated.assertStatus(200)
    assert.include(updated.body().data, {
      name: 'Japan',
      targetDate: null,
      accountId: null,
      userId: null,
      targetCents: 800_000,
    })

    const deleted = await client.delete(`/api/v1/goals/${goal.id}`).actingAs(owner)
    deleted.assertStatus(204)
    assert.isNull(await SavingsGoal.find(goal.id))
  })

  test('test_goals_list_is_ordered_and_filtered_by_status', async ({ client, assert }) => {
    const { owner } = await createHousehold()
    for (const name of ['Emergency fund', 'Car', 'Sofa']) {
      const response = await client
        .post('/api/v1/goals')
        .json({ name, targetCents: 100_000 })
        .actingAs(owner)
      response.assertStatus(201)
    }
    const sofa = await SavingsGoal.findByOrFail('name', 'Sofa')
    await client.patch(`/api/v1/goals/${sofa.id}`).json({ status: 'archived' }).actingAs(owner)

    const all = await client.get('/api/v1/goals').actingAs(owner)
    all.assertStatus(200)
    assert.deepEqual(
      all.body().data.map((goal: any) => [goal.name, goal.sortOrder]),
      [
        ['Emergency fund', 0],
        ['Car', 1],
        ['Sofa', 2],
      ]
    )

    const active = await client.get('/api/v1/goals?status=active').actingAs(owner)
    assert.deepEqual(
      active.body().data.map((goal: any) => goal.name),
      ['Emergency fund', 'Car']
    )

    const invalid = await client.get('/api/v1/goals?status=paused').actingAs(owner)
    invalid.assertStatus(422)
  })

  test('test_create_goal_validates_amounts_and_dates', async ({ client }) => {
    const { owner } = await createHousehold()
    const valid = { name: 'Emergency fund', targetCents: 100_000 }

    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ ...valid, name: '' }, 'name', 'required'],
      [{ ...valid, targetCents: 0 }, 'targetCents', 'positive'],
      [{ ...valid, targetCents: 10.5 }, 'targetCents', 'withoutDecimals'],
      [{ ...valid, startingCents: -1 }, 'startingCents', 'min'],
      [{ ...valid, monthlyContributionCents: -1 }, 'monthlyContributionCents', 'min'],
      [{ ...valid, targetDate: '2027-02-30' }, 'targetDate', 'dateString'],
      [{ targetCents: 100_000 }, 'name', 'required'],
    ]

    for (const [body, field, rule] of cases) {
      const response = await client.post('/api/v1/goals').json(body).actingAs(owner)
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field, rule }] })
    }
  })

  test('test_create_goal_with_foreign_account_is_rejected_with_422', async ({ client, assert }) => {
    const { owner } = await createHousehold({ accounts: [{ name: 'Mine' }] })
    const other = await createHousehold({ accounts: [{ name: 'Theirs' }] })

    const account = await client
      .post('/api/v1/goals')
      .json({ name: 'Emergency fund', targetCents: 100_000, accountId: other.accounts[0].id })
      .actingAs(owner)
    account.assertStatus(422)
    account.assertBodyContains({ errors: [{ field: 'accountId', rule: 'database.exists' }] })

    const person = await client
      .post('/api/v1/goals')
      .json({ name: 'Emergency fund', targetCents: 100_000, userId: other.owner.id })
      .actingAs(owner)
    person.assertStatus(422)
    person.assertBodyContains({ errors: [{ field: 'userId', rule: 'database.exists' }] })

    assert.lengthOf(await SavingsGoal.all(), 0)

    // Same rule on PATCH.
    const goal = await client
      .post('/api/v1/goals')
      .json({ name: 'Emergency fund', targetCents: 100_000 })
      .actingAs(owner)
    const patch = await client
      .patch(`/api/v1/goals/${goal.body().data.id}`)
      .json({ accountId: other.accounts[0].id })
      .actingAs(owner)
    patch.assertStatus(422)
    patch.assertBodyContains({ errors: [{ field: 'accountId', rule: 'database.exists' }] })
  })

  test('test_marking_goal_reached_stamps_reached_at', async ({ client, assert }) => {
    const { owner } = await createHousehold()
    const created = await client
      .post('/api/v1/goals')
      .json({ name: 'Emergency fund', targetCents: 100_000 })
      .actingAs(owner)
    const url = `/api/v1/goals/${created.body().data.id}`

    const reached = await client.patch(url).json({ status: 'reached' }).actingAs(owner)
    reached.assertStatus(200)
    assert.equal(reached.body().data.status, 'reached')
    assert.equal(reached.body().data.reachedAt, '2026-10-14T23:00:00.000Z')

    // Archiving keeps the date it was reached.
    const archived = await client.patch(url).json({ status: 'archived' }).actingAs(owner)
    assert.equal(archived.body().data.reachedAt, '2026-10-14T23:00:00.000Z')

    const active = await client.patch(url).json({ status: 'active' }).actingAs(owner)
    assert.equal(active.body().data.status, 'active')
    assert.isNull(active.body().data.reachedAt)
  })

  test('test_goals_reorder_updates_sort_order', async ({ client, assert }) => {
    const { owner } = await createHousehold()
    const other = await createHousehold()
    const ids: number[] = []
    for (const name of ['A', 'B', 'C']) {
      const response = await client
        .post('/api/v1/goals')
        .json({ name, targetCents: 1_000 })
        .actingAs(owner)
      ids.push(response.body().data.id)
    }

    const response = await client
      .put('/api/v1/goals/reorder')
      .json({ ids: [ids[2], ids[0], ids[1]] })
      .actingAs(owner)
    response.assertStatus(204)

    const list = await client.get('/api/v1/goals').actingAs(owner)
    assert.deepEqual(
      list.body().data.map((goal: any) => [goal.name, goal.sortOrder]),
      [
        ['C', 0],
        ['A', 1],
        ['B', 2],
      ]
    )

    const foreign = await SavingsGoal.create({
      householdId: other.household.id,
      name: 'Theirs',
      targetCents: 1_000,
      sortOrder: 7,
    })
    const rejected = await client
      .put('/api/v1/goals/reorder')
      .json({ ids: [ids[0], foreign.id] })
      .actingAs(owner)
    rejected.assertStatus(422)
    await foreign.refresh()
    assert.equal(foreign.sortOrder, 7)
  })

  test('test_deleting_an_account_used_by_a_goal_answers_409', async ({ client, assert }) => {
    const { owner, accounts } = await createHousehold({ accounts: [{ name: 'Savings' }] })
    await client
      .post('/api/v1/goals')
      .json({ name: 'Emergency fund', targetCents: 100_000, accountId: accounts[0].id })
      .actingAs(owner)

    const response = await client.delete(`/api/v1/accounts/${accounts[0].id}`).actingAs(owner)

    response.assertStatus(409)
    response.assertBodyContains({ code: 'E_ACCOUNT_IN_USE' })
    assert.lengthOf(await SavingsGoal.all(), 1)
  })
})

test.group('Goals: projection', (group) => {
  group.each.setup(() => freezeClock(NOW))

  test('test_goal_projection_uses_account_cleared_balance_as_saved_amount', async ({
    client,
    assert,
  }) => {
    const { household, owner, accounts } = await createHousehold({
      accounts: [{ name: 'Savings', kind: 'savings', openingBalanceCents: 50_000 }],
    })
    const base = { householdId: household.id, accountId: accounts[0].id }
    await TransactionFactory.merge({ ...base, date: '2026-10-02', amountCents: 20_000 })
      .apply('income')
      .create()
    // Pending money is not saved yet.
    await TransactionFactory.merge({ ...base, date: '2026-10-03', amountCents: 5_000 })
      .apply('income')
      .apply('pending')
      .create()
    const goal = await SavingsGoal.create({
      householdId: household.id,
      name: 'Emergency fund',
      targetCents: 100_000,
      startingCents: 99_999,
      monthlyContributionCents: 10_000,
      accountId: accounts[0].id,
      sortOrder: 0,
    })

    const response = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)

    response.assertStatus(200)
    assert.deepEqual(response.body().data, {
      goalId: goal.id,
      savedCents: 70_000,
      targetCents: 100_000,
      rateSource: 'contribution',
      monthlyRateCents: 10_000,
      remainingCents: 30_000,
      monthsToGoal: 3,
      projectedDate: '2027-01-01',
      requiredMonthlyForTargetDate: null,
      onTrack: null,
      series: [
        { month: '2026-10', projectedCents: 70_000 },
        { month: '2026-11', projectedCents: 80_000 },
        { month: '2026-12', projectedCents: 90_000 },
        { month: '2027-01', projectedCents: 100_000 },
      ],
      history: [
        { month: '2026-04', balanceCents: 50_000 },
        { month: '2026-05', balanceCents: 50_000 },
        { month: '2026-06', balanceCents: 50_000 },
        { month: '2026-07', balanceCents: 50_000 },
        { month: '2026-08', balanceCents: 50_000 },
        { month: '2026-09', balanceCents: 50_000 },
        { month: '2026-10', balanceCents: 70_000 },
      ],
    })
  })

  test('test_goal_projection_history_is_the_tracked_account_month_end_cleared_balance', async ({
    client,
    assert,
  }) => {
    const { household, owner, accounts } = await createHousehold({
      accounts: [
        { name: 'Savings', kind: 'savings', openingBalanceCents: 100_000 },
        { name: 'Everyday' },
      ],
    })
    const [savings, everyday] = accounts
    const row = (date: string, amountCents: number, accountId = savings.id) =>
      TransactionFactory.merge({ householdId: household.id, accountId, date, amountCents })
        .apply('income')
        .create()

    await row('2026-03-31', 7_000)
    await row('2026-05-31', 20_000)
    await row('2026-06-01', 5_000)
    // Another account never counts.
    await row('2026-07-15', 999_999, everyday.id)
    // A transfer in is money the account holds; one out of it is not.
    await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: everyday.id,
      toAccountId: savings.id,
      date: '2026-08-10',
      amountCents: 30_000,
    }).create()
    await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: savings.id,
      toAccountId: everyday.id,
      date: '2026-09-10',
      amountCents: 10_000,
    }).create()
    // Pending money is not saved yet.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: savings.id,
      date: '2026-10-05',
      amountCents: 40_000,
    })
      .apply('income')
      .apply('pending')
      .create()
    const goal = await SavingsGoal.create({
      householdId: household.id,
      name: 'House deposit',
      targetCents: 1_000_000,
      monthlyContributionCents: 50_000,
      accountId: savings.id,
      sortOrder: 0,
    })

    const response = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)

    response.assertStatus(200)
    assert.deepEqual(response.body().data.history, [
      { month: '2026-04', balanceCents: 107_000 },
      { month: '2026-05', balanceCents: 127_000 },
      { month: '2026-06', balanceCents: 132_000 },
      { month: '2026-07', balanceCents: 132_000 },
      { month: '2026-08', balanceCents: 162_000 },
      { month: '2026-09', balanceCents: 152_000 },
      { month: '2026-10', balanceCents: 152_000 },
    ])
    // The actual line ends where the projection starts.
    assert.equal(response.body().data.savedCents, 152_000)
    assert.deepEqual(response.body().data.series[0], { month: '2026-10', projectedCents: 152_000 })
  })

  test('test_goal_projection_history_without_account_is_the_starting_amount', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await createHousehold()
    const goal = await SavingsGoal.create({
      householdId: household.id,
      name: 'Sofa',
      targetCents: 200_000,
      startingCents: 30_000,
      monthlyContributionCents: 10_000,
      sortOrder: 0,
    })

    const response = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)

    assert.deepEqual(response.body().data.history, [{ month: '2026-10', balanceCents: 30_000 }])
  })

  test('test_goal_projection_falls_back_to_average_net_of_last_three_full_months', async ({
    client,
    assert,
  }) => {
    const { household, owner, accounts } = await createHousehold({
      accounts: [{ name: 'Everyday' }, { name: 'Savings', kind: 'savings' }],
    })
    const base = { householdId: household.id, accountId: accounts[0].id }
    const income = (date: string, amountCents: number) =>
      TransactionFactory.merge({ ...base, date, amountCents })
        .apply('income')
        .create()
    const expense = (date: string, amountCents: number) =>
      TransactionFactory.merge({ ...base, date, amountCents: -amountCents }).create()

    // June is outside the window; October is still in progress.
    await income('2026-06-10', 999_999)
    await income('2026-07-10', 300_000)
    await expense('2026-07-20', 100_000)
    await income('2026-08-10', 300_000)
    await expense('2026-08-20', 150_000)
    await income('2026-09-10', 300_000)
    await expense('2026-09-20', 200_000)
    await expense('2026-10-05', 900_000)
    // Moving money between own accounts is not saving.
    await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      date: '2026-09-25',
      amountCents: 50_000,
    }).create()
    const goal = await SavingsGoal.create({
      householdId: household.id,
      name: 'Emergency fund',
      targetCents: 1_000_000,
      startingCents: 100_000,
      targetDate: '2027-03-31',
      sortOrder: 0,
    })

    const response = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)

    response.assertStatus(200)
    // (200,000 + 150,000 + 100,000) / 3
    assert.include(response.body().data, {
      savedCents: 100_000,
      rateSource: 'average',
      monthlyRateCents: 150_000,
      remainingCents: 900_000,
      monthsToGoal: 6,
      projectedDate: '2027-04-01',
      requiredMonthlyForTargetDate: 180_000,
      onTrack: false,
    })
    assert.lengthOf(response.body().data.series, 7)
  })

  test('test_goal_projection_prefers_explicit_monthly_contribution', async ({ client, assert }) => {
    const { household, owner, accounts } = await createHousehold({ accounts: [{}] })
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-09-10',
      amountCents: 300_000,
    })
      .apply('income')
      .create()
    const goal = await SavingsGoal.create({
      householdId: household.id,
      name: 'Emergency fund',
      targetCents: 100_000,
      monthlyContributionCents: 25_000,
      sortOrder: 0,
    })

    const response = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)
    assert.include(response.body().data, {
      rateSource: 'contribution',
      monthlyRateCents: 25_000,
      monthsToGoal: 4,
    })

    // An explicit zero is respected: open-ended, not the average.
    await goal.merge({ monthlyContributionCents: 0 }).save()
    const zero = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)
    assert.include(zero.body().data, {
      rateSource: 'contribution',
      monthlyRateCents: 0,
      monthsToGoal: null,
      projectedDate: null,
    })
  })

  test('test_goal_projection_without_history_or_contribution_has_no_rate', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await createHousehold()
    const goal = await SavingsGoal.create({
      householdId: household.id,
      name: 'Emergency fund',
      targetCents: 100_000,
      startingCents: 100_000,
      sortOrder: 0,
    })

    const response = await client.get(`/api/v1/goals/${goal.id}/projection`).actingAs(owner)

    assert.include(response.body().data, {
      rateSource: 'none',
      monthlyRateCents: null,
      remainingCents: 0,
      monthsToGoal: 0,
    })
    // Reads never mutate: reaching the target does not change the status.
    await goal.refresh()
    assert.equal(goal.status, 'active')
    assert.isNull(goal.reachedAt)
  })
})

test.group('Goals: list with projections', (group) => {
  group.each.setup(() => freezeClock(NOW))

  /** A household with one savings account (and one goal tracking it) per name. */
  async function householdWithTrackedGoals(names: string[]) {
    const home = await createHousehold({
      accounts: names.map((name) => ({ name, kind: 'savings' as const })),
    })
    for (const [index, account] of home.accounts.entries()) {
      await TransactionFactory.merge({
        householdId: home.household.id,
        accountId: account.id,
        date: '2026-09-10',
        amountCents: 10_000 * (index + 1),
      })
        .apply('income')
        .create()
      await SavingsGoal.create({
        householdId: home.household.id,
        name: names[index],
        targetCents: 500_000,
        accountId: account.id,
        sortOrder: index,
      })
    }
    return home
  }

  test('test_goals_list_carries_each_projection_when_asked', async ({ client, assert }) => {
    const { household, owner, accounts } = await createHousehold({
      accounts: [{ name: 'Savings', kind: 'savings', openingBalanceCents: 40_000 }, {}],
    })
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[1].id,
      date: '2026-09-10',
      amountCents: 90_000,
    })
      .apply('income')
      .create()
    const tracked = await SavingsGoal.create({
      householdId: household.id,
      name: 'Tracked',
      targetCents: 100_000,
      monthlyContributionCents: 20_000,
      accountId: accounts[0].id,
      sortOrder: 0,
    })
    const averaged = await SavingsGoal.create({
      householdId: household.id,
      name: 'Averaged',
      targetCents: 300_000,
      startingCents: 30_000,
      sortOrder: 1,
    })
    const done = await SavingsGoal.create({
      householdId: household.id,
      name: 'Done',
      targetCents: 50_000,
      startingCents: 60_000,
      sortOrder: 2,
    })

    const response = await client.get('/api/v1/goals?include=projection').actingAs(owner)

    response.assertStatus(200)
    const rows = response.body().data
    assert.deepEqual(
      rows.map((row: any) => [row.name, row.projection.goalId]),
      [
        ['Tracked', tracked.id],
        ['Averaged', averaged.id],
        ['Done', done.id],
      ]
    )
    // The same numbers as each goal's own projection.
    for (const row of rows) {
      const { projection, ...goal } = row
      assert.sameMembers(Object.keys(goal), GOAL_FIELDS)
      const single = await client.get(`/api/v1/goals/${row.id}/projection`).actingAs(owner)
      assert.deepEqual(projection, single.body().data)
    }
    assert.include(rows[0].projection, { savedCents: 40_000, rateSource: 'contribution' })
    assert.include(rows[1].projection, { rateSource: 'average', monthlyRateCents: 90_000 })
    assert.include(rows[2].projection, { remainingCents: 0, monthsToGoal: 0 })

    // Without `include` the list stays plain goals.
    const plain = await client.get('/api/v1/goals').actingAs(owner)
    assert.sameMembers(Object.keys(plain.body().data[0]), GOAL_FIELDS)
  })

  test('test_goals_list_with_projections_reads_the_ledger_once_for_every_goal', async ({
    client,
    assert,
  }) => {
    const one = await householdWithTrackedGoals(['Car'])
    const three = await householdWithTrackedGoals(['Car', 'Holiday', 'Laptop'])

    // Warm up anything lazy (first request of the suite) before counting.
    await client.get('/api/v1/goals?include=projection').actingAs(one.owner)

    const forOne = await countQueries(() =>
      client.get('/api/v1/goals?include=projection').actingAs(one.owner)
    )
    let body: any
    const forThree = await countQueries(async () => {
      const response = await client.get('/api/v1/goals?include=projection').actingAs(three.owner)
      body = response.body()
    })

    assert.lengthOf(body.data, 3)
    assert.deepEqual(
      body.data.map((row: any) => row.projection.savedCents),
      [10_000, 20_000, 30_000]
    )
    assert.isAbove(forOne, 0)
    assert.equal(forThree, forOne)
  })

  test('test_goals_list_include_accepts_only_projection', async ({ client }) => {
    const { owner } = await createHousehold()

    const response = await client.get('/api/v1/goals?include=history').actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'include' }] })
  })

  test('test_goals_list_with_projections_is_empty_without_goals', async ({ client, assert }) => {
    const { owner } = await createHousehold()

    const response = await client
      .get('/api/v1/goals?status=reached&include=projection')
      .actingAs(owner)

    response.assertStatus(200)
    assert.deepEqual(response.body().data, [])
  })
})

test.group('Goals: reached', (group) => {
  group.each.setup(() => freezeClock(NOW))

  test('test_a_goal_at_its_target_can_be_marked_reached_and_reopened', async ({
    client,
    assert,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const goal = await SavingsGoal.create({
      householdId: household.id,
      name: 'New laptop',
      targetCents: 250_000,
      startingCents: 250_000,
      sortOrder: 0,
    })
    const url = `/api/v1/goals/${goal.id}`

    const projection = await client.get(`${url}/projection`).actingAs(owner)
    assert.equal(projection.body().data.remainingCents, 0)

    const reached = await client.patch(url).json({ status: 'reached' }).actingAs(member)
    reached.assertStatus(200)
    assert.include(reached.body().data, {
      status: 'reached',
      // 15 Oct 2026 in Brisbane, the household's day.
      reachedAt: '2026-10-14T23:00:00.000Z',
    })
    const reachedList = await client.get('/api/v1/goals?status=reached').actingAs(owner)
    assert.deepEqual(
      reachedList.body().data.map((row: any) => row.id),
      [goal.id]
    )

    const reopened = await client.patch(url).json({ status: 'active' }).actingAs(owner)
    reopened.assertStatus(200)
    assert.include(reopened.body().data, { status: 'active', reachedAt: null })
    const activeList = await client.get('/api/v1/goals?status=active').actingAs(owner)
    assert.deepEqual(
      activeList.body().data.map((row: any) => row.id),
      [goal.id]
    )
  })

  test('test_patching_other_fields_keeps_the_reached_status_and_its_date', async ({
    client,
    assert,
  }) => {
    const { owner } = await createHousehold()
    const created = await client
      .post('/api/v1/goals')
      .json({ name: 'Emergency fund', targetCents: 100_000 })
      .actingAs(owner)
    const url = `/api/v1/goals/${created.body().data.id}`
    await client.patch(url).json({ status: 'reached' }).actingAs(owner)

    // A day later: renaming it (or sending `reached` again) keeps the first date.
    freezeClock('2026-10-16T09:00:00+10:00')
    const renamed = await client.patch(url).json({ name: 'Rainy day' }).actingAs(owner)
    const again = await client.patch(url).json({ status: 'reached' }).actingAs(owner)

    assert.include(renamed.body().data, {
      name: 'Rainy day',
      status: 'reached',
      reachedAt: '2026-10-14T23:00:00.000Z',
    })
    assert.equal(again.body().data.reachedAt, '2026-10-14T23:00:00.000Z')
  })

  test('test_another_households_goal_cannot_be_marked_reached_or_reopened', async ({
    client,
    assert,
  }) => {
    const { owner } = await createHousehold()
    const victim = await createHousehold()
    const goal = await SavingsGoal.create({
      householdId: victim.household.id,
      name: 'Theirs',
      targetCents: 100_000,
      startingCents: 100_000,
      status: 'reached',
      sortOrder: 0,
    })

    for (const status of ['reached', 'active']) {
      const response = await client
        .patch(`/api/v1/goals/${goal.id}`)
        .json({ status })
        .actingAs(owner)
      response.assertStatus(404)
    }
    const list = await client.get('/api/v1/goals?include=projection').actingAs(owner)
    assert.deepEqual(list.body().data, [])

    await goal.refresh()
    assert.equal(goal.status, 'reached')
  })
})
