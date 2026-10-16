import { test } from '@japa/runner'
import { createHousehold } from '#tests/helpers/household'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

const URL = '/api/v1/transactions/suggestions'

/** A couple with three accounts and their seeded taxonomy, on 15 October 2026 in Brisbane. */
async function couple() {
  const fixture = await createHousehold({
    users: 2,
    taxonomy: true,
    accounts: [{ name: 'Everyday' }, { name: 'Savings', kind: 'savings' }, { name: 'Card' }],
  })
  const { household } = fixture
  const [groceries, restaurants, salary, gifts] = await Promise.all(
    ['groceries', 'restaurants-takeaway', 'salary', 'gifts'].map((slug) =>
      categoryBySlug(household.id, slug)
    )
  )
  return { ...fixture, categories: { groceries, restaurants, salary, gifts } }
}

test.group('Transactions: quick add suggestions', (group) => {
  group.each.setup(() => freezeClock('2026-10-15T00:00:00Z'))

  test('test_suggestions_rank_categories_payees_and_routes_by_recent_use', async ({
    client,
    assert,
  }) => {
    const { owner, household, accounts, categories } = await couple()
    const base = { householdId: household.id, accountId: accounts[0].id, createdByUserId: owner.id }
    await TransactionFactory.merge([
      { ...base, date: '2026-10-14', categoryId: categories.restaurants.id, payee: 'Café Nero' },
      { ...base, date: '2026-10-13', categoryId: categories.restaurants.id, payee: 'cafe nero' },
      { ...base, date: '2026-10-10', categoryId: categories.groceries.id, payee: 'Woolworths' },
    ]).createMany(3)
    await TransactionFactory.merge({
      ...base,
      date: '2026-10-01',
      categoryId: categories.salary.id,
      payee: 'Employer',
    })
      .apply('income')
      .create()
    await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      date: '2026-10-12',
      amountCents: 50_000,
    }).createMany(2)

    const response = await client.get(URL).actingAs(owner)

    response.assertStatus(200)
    const data = response.body().data
    assert.equal(data.asOf, '2026-10-15')
    assert.deepEqual(
      data.categories.expense.map((line: any) => line.categoryId),
      [categories.restaurants.id, categories.groceries.id]
    )
    assert.deepEqual(
      data.categories.income.map((line: any) => line.categoryId),
      [categories.salary.id]
    )
    assert.deepEqual(
      data.payees.expense.map((line: any) => line.payee),
      ['Café Nero', 'Woolworths']
    )
    assert.deepEqual(data.routes, [
      {
        fromAccountId: accounts[0].id,
        toAccountId: accounts[1].id,
        score: data.routes[0].score,
        lastDate: '2026-10-12',
      },
    ])
    assert.isAbove(data.routes[0].score, 1.8)
    assert.isAbove(data.categories.expense[0].score, data.categories.expense[1].score)
  })

  test('test_suggestions_give_the_last_account_the_viewer_used', async ({ client, assert }) => {
    const { owner, member, household, accounts } = await couple()
    // The owner used the card last; the member typed something on Everyday after that.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[2].id,
      createdByUserId: owner.id,
      date: '2026-10-10',
    }).create()
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      createdByUserId: member.id,
      date: '2026-10-11',
    }).create()

    const mine = await client.get(URL).actingAs(owner)
    const theirs = await client.get(URL).actingAs(member)
    const fresh = await createHousehold({ accounts: [{ name: 'Cash' }] })
    const nothing = await client.get(URL).actingAs(fresh.owner)

    assert.equal(mine.body().data.lastAccountId, accounts[2].id)
    assert.equal(theirs.body().data.lastAccountId, accounts[0].id)
    nothing.assertStatus(200)
    assert.isNull(nothing.body().data.lastAccountId)
    assert.deepEqual(nothing.body().data.categories, { expense: [], income: [] })
  })

  test('test_suggestions_never_reveal_the_partners_private_rows', async ({ client, assert }) => {
    const { owner, member, household, accounts, categories } = await couple()
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-10-14',
      payee: 'Jewellery store',
      categoryId: categories.gifts.id,
      paidByUserId: owner.id,
      createdByUserId: owner.id,
    })
      .apply('private')
      .create()

    const partner = await client.get(URL).actingAs(member)
    const payer = await client.get(URL).actingAs(owner)

    assert.notInclude(JSON.stringify(partner.body()), 'Jewellery')
    assert.deepEqual(partner.body().data.categories.expense, [])
    assert.deepEqual(
      payer.body().data.payees.expense.map((line: any) => line.payee),
      ['Jewellery store']
    )
    assert.deepEqual(
      payer.body().data.categories.expense.map((line: any) => line.categoryId),
      [categories.gifts.id]
    )
  })

  test('test_a_private_row_the_viewer_entered_for_the_partner_stays_hidden', async ({
    client,
    assert,
  }) => {
    const { owner, member, household, accounts, categories } = await couple()
    // Typed by the owner, paid by the partner, private: the partner's secret.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-10-14',
      payee: 'Surprise Florist',
      categoryId: categories.gifts.id,
      paidByUserId: member.id,
      createdByUserId: owner.id,
    })
      .apply('private')
      .create()

    const typist = await client.get(URL).actingAs(owner)
    const payer = await client.get(URL).actingAs(member)

    assert.notInclude(JSON.stringify(typist.body()), 'Surprise Florist')
    assert.deepEqual(typist.body().data.categories.expense, [])
    assert.deepEqual(
      payer.body().data.payees.expense.map((line: any) => line.payee),
      ['Surprise Florist']
    )
  })

  test('test_another_households_rows_never_reach_the_suggestions', async ({ client, assert }) => {
    const { owner } = await couple()
    const other = await createHousehold({ accounts: [{ name: 'Elsewhere' }] })
    await TransactionFactory.merge({
      householdId: other.household.id,
      accountId: other.accounts[0].id,
      date: '2026-10-14',
      payee: 'Neighbour Bakery',
      createdByUserId: other.owner.id,
      paidByUserId: other.owner.id,
    }).createMany(3)

    const response = await client.get(URL).actingAs(owner)

    response.assertStatus(200)
    assert.notInclude(JSON.stringify(response.body()), 'Neighbour Bakery')
    assert.deepEqual(response.body().data.payees, { expense: [], income: [] })
    assert.isNull(response.body().data.lastAccountId)
  })

  test('test_suggestions_read_the_viewers_rows_beyond_the_households_last_hundred', async ({
    client,
    assert,
  }) => {
    const { owner, member, household, accounts, categories } = await couple()
    // The owner's own lunch, a month ago...
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-09-15',
      categoryId: categories.restaurants.id,
      payee: 'Sushi Train',
      paidByUserId: owner.id,
      createdByUserId: owner.id,
    }).create()
    // ...then a hundred newer rows typed by the partner.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-10-01',
      categoryId: categories.groceries.id,
      payee: 'Corner Grocer',
      paidByUserId: member.id,
      createdByUserId: member.id,
    }).createMany(100)

    const mine = await client.get(URL).actingAs(owner)

    assert.deepEqual(
      mine.body().data.categories.expense.map((line: any) => line.categoryId),
      [categories.groceries.id, categories.restaurants.id]
    )
    assert.include(
      mine.body().data.payees.expense.map((line: any) => line.payee),
      'Sushi Train'
    )
  })
})
