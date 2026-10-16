import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Transaction from '#models/transaction'
import { createHousehold } from '#tests/helpers/household'
import { categoryBySlug } from '#tests/helpers/ledger'
import PostingsRepository from '#repositories/postings_repository'
import { TransactionFactory } from '#database/factories/transaction_factory'

const TRIP = 'Bali 2027'

/**
 * A synthetic trip, tagged "Bali 2027": 800.00 moved to savings in July,
 * flights 50.00 in December with a 20.00 refund, a 100.00 receipt split
 * 70/30 (accommodation/flights) in January paid jointly; plus a camping
 * weekend, an untagged expense, and the partner's private "anniversary"
 * gift also tagged for the trip.
 */
async function seededTrip(client: any) {
  const fixture = await createHousehold({
    users: 2,
    taxonomy: true,
    accounts: [{ name: 'Everyday' }, { name: 'Savings', kind: 'savings' }],
  })
  const { household, owner, member, accounts } = fixture
  const [flights, accommodation] = await Promise.all(
    ['flights', 'accommodation'].map((slug) => categoryBySlug(household.id, slug))
  )
  const base = { householdId: household.id, accountId: accounts[0].id, createdByUserId: owner.id }

  await TransactionFactory.merge([
    {
      ...base,
      date: '2026-12-02',
      amountCents: -5_000,
      categoryId: flights.id,
      paidByUserId: owner.id,
      tags: [TRIP],
    },
    {
      ...base,
      kind: 'income',
      date: '2026-12-09',
      amountCents: 2_000,
      categoryId: flights.id,
      paidByUserId: owner.id,
      tags: [TRIP],
    },
    { ...base, date: '2026-10-20', amountCents: -3_000, paidByUserId: owner.id, tags: ['camping'] },
    { ...base, date: '2026-12-03', amountCents: -9_999, paidByUserId: owner.id },
    {
      ...base,
      date: '2026-11-11',
      amountCents: -12_000,
      paidByUserId: member.id,
      createdByUserId: member.id,
      isPrivate: true,
      tags: [TRIP, 'anniversary'],
    },
  ]).createMany(5)

  const receipt = await TransactionFactory.merge({
    ...base,
    date: '2027-01-10',
    amountCents: -10_000,
    paidByUserId: null,
    tags: [TRIP],
  }).create()
  await receipt.related('splits').createMany([
    { householdId: household.id, categoryId: accommodation.id, amountCents: -7_000, sortOrder: 0 },
    { householdId: household.id, categoryId: flights.id, amountCents: -3_000, sortOrder: 1 },
  ])
  await receipt.merge({ isSplit: true }).save()

  const transfer = await client
    .post('/api/v1/transfers')
    .json({
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      date: '2026-07-15',
      amountCents: 80_000,
      tags: [TRIP],
    })
    .actingAs(owner)
  transfer.assertStatus(201)

  return { ...fixture, categories: { flights, accommodation }, receipt }
}

test.group('Tags', () => {
  test('test_transactions_can_be_filtered_by_tag', async ({ client, assert }) => {
    const { owner, member } = await seededTrip(client)

    const mine = await client.get('/api/v1/transactions').qs({ tag: TRIP }).actingAs(owner)
    const partners = await client.get('/api/v1/transactions').qs({ tag: TRIP }).actingAs(member)

    mine.assertStatus(200)
    // Flights, the refund, the split receipt and both legs of the transfer;
    // never the partner's private gift, whose tags the owner cannot see.
    assert.deepEqual(
      mine
        .body()
        .data.map((row: any) => [row.date, row.amountCents])
        .sort(),
      [
        ['2026-07-15', -80_000],
        ['2026-07-15', 80_000],
        ['2026-12-02', -5_000],
        ['2026-12-09', 2_000],
        ['2027-01-10', -10_000],
      ]
    )
    assert.isTrue(mine.body().data.every((row: any) => row.tags.includes(TRIP)))
    assert.equal(partners.body().metadata.total, 6)
  })

  test('test_the_tag_filter_matches_the_whole_tag_exactly', async ({ client, assert }) => {
    const { owner } = await seededTrip(client)

    for (const tag of ['bali 2027', 'Bali', 'Bali 2027 trip']) {
      const response = await client.get('/api/v1/transactions').qs({ tag }).actingAs(owner)
      response.assertStatus(200)
      assert.deepEqual(response.body().data, [], tag)
    }
    const invalid = await client
      .get('/api/v1/transactions')
      .qs({ tag: 'x'.repeat(41) })
      .actingAs(owner)
    invalid.assertStatus(422)
  })

  test('test_tags_index_lists_every_tag_with_its_totals_by_last_use', async ({
    client,
    assert,
  }) => {
    const { owner } = await seededTrip(client)

    const response = await client.get('/api/v1/tags').actingAs(owner)

    response.assertStatus(200)
    assert.deepEqual(response.body().data, [
      {
        tag: TRIP,
        // Flights, refund, split receipt, transfer.
        count: 4,
        // 50 - 20 + 100.
        expenseCents: 13_000,
        incomeCents: 0,
        netCents: -13_000,
        setAsideCents: 80_000,
        firstDate: '2026-07-15',
        lastDate: '2027-01-10',
      },
      {
        tag: 'camping',
        count: 1,
        expenseCents: 3_000,
        incomeCents: 0,
        netCents: -3_000,
        setAsideCents: 0,
        firstDate: '2026-10-20',
        lastDate: '2026-10-20',
      },
    ])
  })

  test('test_the_payer_of_a_private_row_sees_its_tags', async ({ client, assert }) => {
    const { member } = await seededTrip(client)

    const response = await client.get('/api/v1/tags').actingAs(member)

    assert.deepEqual(
      response.body().data.map((line: any) => [line.tag, line.count, line.expenseCents]),
      [
        [TRIP, 5, 25_000],
        ['anniversary', 1, 12_000],
        ['camping', 1, 3_000],
      ]
    )
  })

  test('test_tags_index_is_scoped_to_the_date_range', async ({ client, assert }) => {
    const { owner } = await seededTrip(client)

    const december = await client
      .get('/api/v1/tags')
      .qs({ from: '2026-12-01', to: '2026-12-31' })
      .actingAs(owner)
    const invalid = await client.get('/api/v1/tags').qs({ from: '2026-13-01' }).actingAs(owner)

    december.assertStatus(200)
    assert.deepEqual(
      december.body().data.map((line: any) => [line.tag, line.count, line.expenseCents]),
      [[TRIP, 2, 3_000]]
    )
    invalid.assertStatus(422)
  })

  test('test_tag_show_breaks_the_tag_down_by_category_month_and_person', async ({
    client,
    assert,
  }) => {
    const { owner, categories } = await seededTrip(client)

    const response = await client.get(`/api/v1/tags/${encodeURIComponent(TRIP)}`).actingAs(owner)

    response.assertStatus(200)
    const detail = response.body().data
    assert.include(detail, {
      tag: TRIP,
      count: 4,
      expenseCents: 13_000,
      setAsideCents: 80_000,
      firstDate: '2026-07-15',
      lastDate: '2027-01-10',
    })
    assert.deepEqual(
      detail.byCategory.map((line: any) => [line.bucket, line.categoryId, line.amountCents]),
      [
        ['category', categories.accommodation.id, 7_000],
        // 50 - 20 refund + 30 split line.
        ['category', categories.flights.id, 6_000],
      ]
    )
    assert.deepEqual(
      detail.byMonth.map((line: any) => [line.month, line.expenseCents, line.setAsideCents]),
      [
        ['2026-07', 0, 80_000],
        ['2026-08', 0, 0],
        ['2026-09', 0, 0],
        ['2026-10', 0, 0],
        ['2026-11', 0, 0],
        ['2026-12', 3_000, 0],
        ['2027-01', 10_000, 0],
      ]
    )
    assert.deepEqual(
      detail.byPerson.map((line: any) => [line.bucket, line.userId, line.expenseCents]),
      [
        ['member', owner.id, 3_000],
        ['joint', null, 10_000],
      ]
    )
  })

  test('test_tag_show_is_scoped_to_the_date_range', async ({ client, assert }) => {
    const { owner } = await seededTrip(client)

    const response = await client
      .get(`/api/v1/tags/${encodeURIComponent(TRIP)}`)
      .qs({ from: '2027-01-01' })
      .actingAs(owner)

    response.assertStatus(200)
    assert.include(response.body().data, {
      count: 1,
      expenseCents: 10_000,
      setAsideCents: 0,
      firstDate: '2027-01-10',
    })
  })

  test('test_an_unknown_tag_answers_404', async ({ client }) => {
    const { owner } = await seededTrip(client)

    const unknown = await client.get('/api/v1/tags/lombok').actingAs(owner)
    // Only on the partner's private gift: it does not exist for the owner.
    const hidden = await client.get('/api/v1/tags/anniversary').actingAs(owner)

    unknown.assertStatus(404)
    unknown.assertBodyContains({ code: 'E_ROW_NOT_FOUND' })
    hidden.assertStatus(404)
  })

  test('test_the_tag_param_is_url_decoded_and_validated_like_the_form', async ({
    client,
    assert,
  }) => {
    const { owner, household, accounts } = await seededTrip(client)
    const awkward = 'Bali/Lombok #2 · 100%'
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-12-20',
      amountCents: -4_200,
      tags: [awkward],
    }).create()

    const found = await client.get(`/api/v1/tags/${encodeURIComponent(awkward)}`).actingAs(owner)
    // Surrounding spaces are trimmed, as the form does.
    const padded = await client
      .get(`/api/v1/tags/${encodeURIComponent(`  ${awkward}  `)}`)
      .actingAs(owner)
    const tooLong = await client.get(`/api/v1/tags/${'x'.repeat(41)}`).actingAs(owner)
    const blank = await client.get('/api/v1/tags/%20%20').actingAs(owner)

    found.assertStatus(200)
    assert.include(found.body().data, { tag: awkward, expenseCents: 4_200 })
    padded.assertStatus(200)
    tooLong.assertStatus(422)
    blank.assertStatus(422)
  })

  test('test_transfers_carry_their_tags_on_both_legs', async ({ client, assert }) => {
    const { owner, accounts } = await createHousehold({
      accounts: [{ name: 'Everyday' }, { name: 'Savings', kind: 'savings' }],
    })
    const legTags = async (transferId: number) => {
      const legs = await Transaction.query()
        .where('transfer_id', transferId)
        .orderBy('amount_cents')
      return legs.map((leg) => leg.tags)
    }

    const created = await client
      .post('/api/v1/transfers')
      .json({
        fromAccountId: accounts[0].id,
        toAccountId: accounts[1].id,
        date: '2026-10-04',
        amountCents: 25_000,
        tags: [TRIP],
      })
      .actingAs(owner)
    created.assertStatus(201)
    const id = created.body().data.id
    assert.deepEqual(
      created.body().data.legs.map((leg: any) => leg.tags),
      [[TRIP], [TRIP]]
    )

    const memoOnly = await client
      .patch(`/api/v1/transfers/${id}`)
      .json({ memo: 'For the trip' })
      .actingAs(owner)
    memoOnly.assertStatus(200)
    assert.deepEqual(await legTags(id), [[TRIP], [TRIP]])

    const retagged = await client
      .patch(`/api/v1/transfers/${id}`)
      .json({ tags: ['Lombok', 'Bali 2027'] })
      .actingAs(owner)
    retagged.assertStatus(200)
    assert.deepEqual(await legTags(id), [
      ['Lombok', TRIP],
      ['Lombok', TRIP],
    ])

    const duplicated = await client
      .patch(`/api/v1/transfers/${id}`)
      .json({ tags: ['Lombok', 'Lombok'] })
      .actingAs(owner)
    duplicated.assertStatus(422)
  })

  test('test_postings_carry_the_parent_tags_on_every_split_line', async ({ client, assert }) => {
    const { household, receipt, accounts } = await seededTrip(client)

    const postings = await new PostingsRepository().tagged(household, { tag: TRIP })
    const lines = postings.filter((posting) => posting.transactionId === receipt.id)
    const everyTagged = await new PostingsRepository().tagged(household)

    assert.lengthOf(lines, 2)
    assert.isTrue(lines.every((line) => line.splitId !== null && line.tags.includes(TRIP)))
    const savingsLeg = postings.find((posting) => posting.accountId === accounts[1].id)
    assert.include(savingsLeg, { kind: 'transfer', accountKind: 'savings', amountCents: 80_000 })
    // Untagged rows never come back; the private gift does (the caller masks it).
    assert.isTrue(everyTagged.every((posting) => posting.tags.length > 0))
    assert.isTrue(everyTagged.some((posting) => posting.tags.includes('anniversary')))
  })

  test('test_transaction_tags_have_a_gin_index', async ({ assert }) => {
    const result = await db.rawQuery(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'transactions' AND indexdef ILIKE '%gin%'`
    )

    assert.isTrue(
      result.rows.some((row: { indexdef: string }) => row.indexdef.includes('(tags')),
      'a GIN index on transactions.tags serves the `@>` containment filter'
    )
  })
})
