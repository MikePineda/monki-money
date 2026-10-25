import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import LlmUsage from '#models/llm_usage'
import app from '@adonisjs/core/services/app'
import { LlmProvider } from '#llm/llm_provider'
import MonthlyInsight from '#models/monthly_insight'
import { createHousehold } from '#tests/helpers/household'
import { readDataBlock } from '#llm/prompts/untrusted_data'
import InsightService from '#services/insights/insight_service'
import { FakeLlmProvider } from '#llm/providers/fake_llm_provider'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

/** Mid-October 2026 in Brisbane (the households' time zone). */
const NOW = '2026-10-15T09:00:00+10:00'
const GENERATED_AT = '2026-10-14T23:00:00.000Z'

/** The fake model's answers per locale (tests/fixtures/llm/insight.json). */
async function insightFixtures() {
  return JSON.parse(await readFile(app.makePath('tests/fixtures/llm/insight.json'), 'utf8'))
}

async function fakeLlm() {
  const llm = await app.container.make(LlmProvider)
  if (!(llm instanceof FakeLlmProvider)) throw new Error('Tests run with LLM_PROVIDER=fake')
  return llm
}

/**
 * A synthetic September 2026 (and its August): salary 5,000.00; groceries
 * 800.00; restaurants 200.00; an uncategorized 15.00; two private
 * purchases (the member's gift 300.00, the owner's electronics 400.00)
 * and a transfer that never counts. August: salary 5,000.00, groceries
 * 600.00.
 */
async function seededHousehold() {
  const fixture = await createHousehold({
    users: 2,
    taxonomy: true,
    accounts: [{ name: 'Everyday' }, { name: 'Savings', kind: 'savings' }],
  })
  const { household, owner, member, accounts } = fixture
  const [groceries, restaurants, salary, gifts, electronics] = await Promise.all(
    ['groceries', 'restaurants-takeaway', 'salary', 'gifts', 'electronics'].map((slug) =>
      categoryBySlug(household.id, slug)
    )
  )
  const base = { householdId: household.id, accountId: accounts[0].id, createdByUserId: owner.id }

  await TransactionFactory.merge([
    { ...base, kind: 'income', date: '2026-09-01', amountCents: 500_000, categoryId: salary.id },
    { ...base, date: '2026-09-03', amountCents: -80_000, categoryId: groceries.id },
    { ...base, date: '2026-09-05', amountCents: -20_000, categoryId: restaurants.id },
    { ...base, date: '2026-09-06', amountCents: -1_500 },
    { ...base, kind: 'income', date: '2026-08-01', amountCents: 500_000, categoryId: salary.id },
    { ...base, date: '2026-08-03', amountCents: -60_000, categoryId: groceries.id },
  ]).createMany(6)
  await TransactionFactory.merge([
    {
      ...base,
      date: '2026-09-10',
      amountCents: -30_000,
      categoryId: gifts.id,
      paidByUserId: member.id,
      createdByUserId: member.id,
    },
    {
      ...base,
      date: '2026-09-11',
      amountCents: -40_000,
      categoryId: electronics.id,
      paidByUserId: owner.id,
    },
  ])
    .apply('private')
    .createMany(2)
  await TransferFactory.merge({
    householdId: household.id,
    fromAccountId: accounts[0].id,
    toAccountId: accounts[1].id,
    date: '2026-09-20',
    amountCents: 100_000,
  }).create()

  return fixture
}

test.group('Monthly insights', (group) => {
  group.each.setup(() => freezeClock(NOW))

  test('test_generate_insight_uses_fake_llm_and_stores_row', async ({ client, assert }) => {
    const fixtures = await insightFixtures()
    const { household, owner, member } = await seededHousehold()

    const response = await client.post('/api/v1/insights/2026-09/generate').actingAs(owner)

    response.assertStatus(201)
    assert.deepEqual(response.body().data, {
      month: '2026-09',
      locale: 'en',
      headline: fixtures.en.headline,
      bodyMarkdown: fixtures.en.body,
      highlights: fixtures.en.highlights,
      model: 'fake',
      generatedAt: GENERATED_AT,
      fresh: true,
    })
    const row = await MonthlyInsight.query().where('household_id', household.id).firstOrFail()
    assert.include(row.serialize(), {
      month: '2026-09',
      locale: 'en',
      generatedByUserId: owner.id,
    })
    const usage = await LlmUsage.query().where('household_id', household.id)
    assert.deepEqual(
      usage.map((entry) => [entry.purpose, entry.status, entry.userId]),
      [['insight', 'ok', owner.id]]
    )

    // Any member reads the stored summary.
    const shown = await client.get('/api/v1/insights/2026-09').actingAs(member)
    shown.assertStatus(200)
    const { fresh, ...stored } = response.body().data
    assert.isTrue(fresh)
    assert.deepEqual(shown.body().data, stored)
  })

  test('test_generate_insight_is_idempotent_unless_forced', async ({ client, assert }) => {
    const fixtures = await insightFixtures()
    const { household, owner } = await seededHousehold()
    const llm = await fakeLlm()
    const url = '/api/v1/insights/2026-09/generate'

    const first = await client.post(url).actingAs(owner)
    first.assertStatus(201)
    const calls = llm.requests.length

    const again = await client.post(url).json({ force: false }).actingAs(owner)
    again.assertStatus(200)
    assert.isFalse(again.body().data.fresh)
    assert.equal(again.body().data.headline, fixtures.en.headline)
    assert.equal(llm.requests.length, calls, 'the stored summary costs no call')

    llm.script(
      JSON.stringify({ headline: 'A second look', body: 'Still **fine**.', highlights: [] })
    )
    const forced = await client.post(url).json({ force: true }).actingAs(owner)
    forced.assertStatus(201)
    assert.include(forced.body().data, { headline: 'A second look', fresh: true })
    assert.deepEqual(forced.body().data.highlights, [])
    assert.equal(llm.requests.length, calls + 1)

    const rows = await MonthlyInsight.query().where('household_id', household.id)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].headline, 'A second look')
  })

  test('test_generate_insight_is_blocked_when_llm_quota_exceeded', async ({
    client,
    assert,
    cleanup,
  }) => {
    const previous = app.config.get('llm.monthlyCapOverride')
    app.config.set('llm.monthlyCapOverride', 0)
    cleanup(() => app.config.set('llm.monthlyCapOverride', previous))
    const { household, owner } = await seededHousehold()
    const llm = await fakeLlm()
    const calls = llm.requests.length

    const response = await client.post('/api/v1/insights/2026-09/generate').actingAs(owner)

    response.assertStatus(402)
    response.assertBodyContains({ code: 'E_LLM_QUOTA_EXCEEDED' })
    assert.equal(llm.requests.length, calls)
    assert.lengthOf(await MonthlyInsight.query().where('household_id', household.id), 0)
  })

  test('test_generate_insight_for_empty_month_returns_422_without_calling_llm', async ({
    client,
    assert,
  }) => {
    const { household, owner, accounts } = await seededHousehold()
    // July only moved money between own accounts.
    await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      date: '2026-07-20',
      amountCents: 100_000,
    }).create()
    const llm = await fakeLlm()
    const calls = llm.requests.length

    for (const month of ['2026-07', '2026-06']) {
      const response = await client.post(`/api/v1/insights/${month}/generate`).actingAs(owner)
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field: 'month', rule: 'noActivity' }] })
    }

    assert.equal(llm.requests.length, calls)
    assert.lengthOf(await LlmUsage.query().where('household_id', household.id), 0)
    assert.lengthOf(await MonthlyInsight.query().where('household_id', household.id), 0)
  })

  test('test_generate_insight_for_future_month_returns_422', async ({ client, assert }) => {
    const { owner, household, accounts } = await seededHousehold()
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-11-02',
      amountCents: -1_000,
    }).create()

    const future = await client.post('/api/v1/insights/2026-11/generate').actingAs(owner)
    future.assertStatus(422)
    future.assertBodyContains({ errors: [{ field: 'month', rule: 'future' }] })

    // The month in progress is fine once it has activity.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-10-02',
      amountCents: -1_000,
    }).create()
    const current = await client.post('/api/v1/insights/2026-10/generate').actingAs(owner)
    current.assertStatus(201)
    assert.equal(current.body().data.month, '2026-10')
  })

  test('test_show_insight_returns_404_when_not_generated', async ({ client }) => {
    const { owner, member } = await seededHousehold()
    await member.merge({ locale: 'es' }).save()

    const missing = await client.get('/api/v1/insights/2026-09').actingAs(owner)
    missing.assertStatus(404)
    missing.assertBodyContains({ code: 'E_ROW_NOT_FOUND' })

    // Generated in Spanish only: still missing in English.
    const spanish = await client.post('/api/v1/insights/2026-09/generate').actingAs(member)
    spanish.assertStatus(201)
    const english = await client.get('/api/v1/insights/2026-09').actingAs(owner)
    english.assertStatus(404)

    // Not a month at all.
    const invalid = await client.get('/api/v1/insights/2026-13').actingAs(owner)
    invalid.assertStatus(404)
  })

  test('test_insight_input_excludes_private_lines_but_keeps_totals', async ({ client, assert }) => {
    const { household, owner } = await seededHousehold()
    const llm = await fakeLlm()

    const response = await client.post('/api/v1/insights/2026-09/generate').actingAs(owner)
    response.assertStatus(201)

    const row = await MonthlyInsight.query().where('household_id', household.id).firstOrFail()
    assert.deepEqual(row.inputJson, {
      month: '2026-09',
      currencyCode: 'AUD',
      // 800 + 200 + 15 + 300 (private) + 400 (private).
      totals: { incomeCents: 500_000, expenseCents: 171_500, netCents: 328_500 },
      previousTotals: { incomeCents: 500_000, expenseCents: 60_000, netCents: 440_000 },
      byCategory: [
        {
          slug: 'groceries',
          name: 'Groceries',
          kind: 'expense',
          amountCents: 80_000,
          previousAmountCents: 60_000,
        },
        {
          slug: 'restaurants-takeaway',
          name: 'Restaurants & takeaway',
          kind: 'expense',
          amountCents: 20_000,
          previousAmountCents: 0,
        },
        {
          slug: 'uncategorized',
          name: 'Uncategorized',
          kind: 'expense',
          amountCents: 1_500,
          previousAmountCents: 0,
        },
        {
          slug: 'salary',
          name: 'Salary',
          kind: 'income',
          amountCents: 500_000,
          previousAmountCents: 500_000,
        },
      ],
    })
    // Exactly what the model received.
    const request = llm.requests.at(-1)!
    const user = request.messages[0].content.find((block) => block.type === 'text')
    assert.deepEqual(readDataBlock(user && 'text' in user ? user.text : ''), row.inputJson)
    // Neither private purchase (the owner's own included) is named anywhere.
    const sent = JSON.stringify(request.messages).toLowerCase()
    assert.notInclude(sent, 'gifts')
    assert.notInclude(sent, 'electronics')
  })

  test('test_insight_is_generated_in_the_requested_locale', async ({ client, assert }) => {
    const fixtures = await insightFixtures()
    const { household, owner, member } = await seededHousehold()
    await member.merge({ locale: 'es' }).save()
    const llm = await fakeLlm()

    const spanish = await client.post('/api/v1/insights/2026-09/generate').actingAs(member)

    spanish.assertStatus(201)
    assert.include(spanish.body().data, { locale: 'es', headline: fixtures.es.headline })
    assert.equal(llm.requests.at(-1)!.locale, 'es')
    const row = await MonthlyInsight.query()
      .where('household_id', household.id)
      .where('locale', 'es')
      .firstOrFail()
    assert.deepEqual(
      row.inputJson.byCategory.map((line) => line.name),
      ['Supermercado', 'Restaurantes y comida para llevar', 'Sin categoría', 'Sueldo']
    )

    // Each language is its own summary.
    const english = await client.post('/api/v1/insights/2026-09/generate').actingAs(owner)
    english.assertStatus(201)
    assert.include(english.body().data, { locale: 'en', headline: fixtures.en.headline })
    assert.lengthOf(await MonthlyInsight.query().where('household_id', household.id), 2)
    const shown = await client.get('/api/v1/insights/2026-09').actingAs(member)
    assert.equal(shown.body().data.headline, fixtures.es.headline)
  })

  test('test_generate_insight_answers_503_without_a_live_llm_outside_tests', async ({
    client,
    assert,
    cleanup,
  }) => {
    class ProductionInsightService extends InsightService {
      protected override fakeLlmAllowed() {
        return false
      }
    }
    app.container.swap(InsightService, (resolver) => resolver.make(ProductionInsightService))
    cleanup(() => app.container.restore(InsightService))
    const { household, owner } = await seededHousehold()
    const llm = await fakeLlm()
    const calls = llm.requests.length

    const response = await client.post('/api/v1/insights/2026-09/generate').actingAs(owner)

    response.assertStatus(503)
    assert.deepEqual(response.body(), {
      code: 'E_INSIGHTS_UNAVAILABLE',
      message: 'Monthly summaries are not available right now. Try again later',
    })
    assert.equal(llm.requests.length, calls)
    assert.lengthOf(await MonthlyInsight.query().where('household_id', household.id), 0)
  })

  test('test_the_month_in_progress_is_compared_with_the_same_days_of_the_previous_month', async ({
    client,
    assert,
  }) => {
    const { household, owner, accounts } = await createHousehold({
      users: 1,
      taxonomy: true,
      accounts: [{ name: 'Everyday' }],
    })
    const [groceries, restaurants, salary] = await Promise.all(
      ['groceries', 'restaurants-takeaway', 'salary'].map((slug) =>
        categoryBySlug(household.id, slug)
      )
    )
    const base = { householdId: household.id, accountId: accounts[0].id, createdByUserId: owner.id }
    await TransactionFactory.merge([
      // 1-15 October: today is the 15th in Brisbane.
      { ...base, kind: 'income', date: '2026-10-01', amountCents: 500_000, categoryId: salary.id },
      { ...base, date: '2026-10-04', amountCents: -30_000, categoryId: groceries.id },
      // September up to the 15th: the base of the comparison.
      { ...base, kind: 'income', date: '2026-09-01', amountCents: 500_000, categoryId: salary.id },
      { ...base, date: '2026-09-15', amountCents: -20_000, categoryId: groceries.id },
      // The rest of September never counts against half a month.
      { ...base, date: '2026-09-16', amountCents: -50_000, categoryId: groceries.id },
      { ...base, date: '2026-09-28', amountCents: -12_000, categoryId: restaurants.id },
    ]).createMany(6)
    const llm = await fakeLlm()

    const response = await client.post('/api/v1/insights/2026-10/generate').actingAs(owner)

    response.assertStatus(201)
    const row = await MonthlyInsight.query().where('household_id', household.id).firstOrFail()
    assert.deepEqual(row.inputJson, {
      month: '2026-10',
      currencyCode: 'AUD',
      inProgress: { daysElapsed: 15, daysInMonth: 31, previousThroughDay: 15 },
      totals: { incomeCents: 500_000, expenseCents: 30_000, netCents: 470_000 },
      previousTotals: { incomeCents: 500_000, expenseCents: 20_000, netCents: 480_000 },
      byCategory: [
        {
          slug: 'groceries',
          name: 'Groceries',
          kind: 'expense',
          amountCents: 30_000,
          previousAmountCents: 20_000,
        },
        {
          slug: 'salary',
          name: 'Salary',
          kind: 'income',
          amountCents: 500_000,
          previousAmountCents: 500_000,
        },
      ],
    })
    // The model is told, outside the data, how far the month has got.
    const request = llm.requests.at(-1)!
    const user = request.messages[0].content.find((block) => block.type === 'text')
    const text = user && 'text' in user ? user.text : ''
    assert.include(text, 'in progress')
    assert.include(text, '15 days elapsed of 31')
  })

  test('test_a_previous_month_quiet_in_the_same_days_compares_as_zero_not_as_missing', async ({
    client,
    assert,
  }) => {
    const { household, owner, accounts } = await createHousehold({
      users: 1,
      taxonomy: true,
      accounts: [{ name: 'Everyday' }],
    })
    const base = { householdId: household.id, accountId: accounts[0].id, createdByUserId: owner.id }
    await TransactionFactory.merge([
      { ...base, date: '2026-10-02', amountCents: -4_000 },
      // September had movements, only after the 15th.
      { ...base, date: '2026-09-20', amountCents: -9_000 },
    ]).createMany(2)

    const response = await client.post('/api/v1/insights/2026-10/generate').actingAs(owner)

    response.assertStatus(201)
    const row = await MonthlyInsight.query().where('household_id', household.id).firstOrFail()
    assert.deepEqual(row.inputJson.previousTotals, {
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    })
    assert.deepEqual(
      row.inputJson.byCategory.map((line) => [
        line.slug,
        line.amountCents,
        line.previousAmountCents,
      ]),
      [['uncategorized', 4_000, 0]]
    )
  })

  test('test_a_finished_month_keeps_the_full_previous_month_and_no_progress_note', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await seededHousehold()
    const llm = await fakeLlm()

    const response = await client.post('/api/v1/insights/2026-09/generate').actingAs(owner)

    response.assertStatus(201)
    const row = await MonthlyInsight.query().where('household_id', household.id).firstOrFail()
    assert.notProperty(row.inputJson, 'inProgress')
    const request = llm.requests.at(-1)!
    const user = request.messages[0].content.find((block) => block.type === 'text')
    assert.notInclude(user && 'text' in user ? user.text : '', 'in progress')
  })
})
