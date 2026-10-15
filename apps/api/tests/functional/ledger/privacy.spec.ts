import { test } from '@japa/runner'
import { categoryBySlug } from '#tests/helpers/ledger'
import { createHousehold } from '#tests/helpers/household'
import { TransactionFactory } from '#database/factories/transaction_factory'

/** Owner buys a surprise gift (private); the member is the partner. */
async function surpriseGift() {
  const fixture = await createHousehold({ users: 2, taxonomy: true, accounts: [{ name: 'Joint' }] })
  const { household, owner, accounts } = fixture
  const gifts = await categoryBySlug(household.id, 'gifts')
  const gift = await TransactionFactory.merge({
    householdId: household.id,
    accountId: accounts[0].id,
    date: '2026-10-10',
    amountCents: -20_000,
    payee: 'Jewellery store',
    description: 'Anniversary ring',
    categoryId: gifts.id,
    paidByUserId: owner.id,
    createdByUserId: owner.id,
    tags: ['anniversary'],
  })
    .apply('private')
    .create()
  return { ...fixture, gift, gifts }
}

test.group('Private transactions', () => {
  test('test_private_transaction_hides_details_from_the_partner', async ({ client, assert }) => {
    const { owner, member, gift, gifts } = await surpriseGift()

    const partner = await client.get(`/api/v1/transactions/${gift.id}`).actingAs(member)
    partner.assertStatus(200)
    partner.assertBodyContains({
      data: {
        amountCents: -20_000,
        date: '2026-10-10',
        paidByUserId: owner.id,
        isPrivate: true,
        isMasked: true,
        payee: null,
        description: null,
        rawDescription: null,
        categoryId: null,
        tags: [],
      },
    })
    assert.notInclude(JSON.stringify(partner.body()), 'Jewellery')

    const payer = await client.get(`/api/v1/transactions/${gift.id}`).actingAs(owner)
    payer.assertBodyContains({
      data: {
        isMasked: false,
        payee: 'Jewellery store',
        description: 'Anniversary ring',
        categoryId: gifts.id,
        tags: ['anniversary'],
      },
    })

    const list = await client.get('/api/v1/transactions').actingAs(member)
    assert.deepEqual(
      list.body().data.map((row: any) => [row.id, row.isMasked, row.payee]),
      [[gift.id, true, null]]
    )
  })

  test('test_partner_search_never_matches_private_details', async ({ client, assert }) => {
    const { owner, member, gifts } = await surpriseGift()

    for (const query of ['q=Jewellery', 'q=ring', `categoryId=${gifts.id}`, 'uncategorized=1']) {
      const partner = await client.get(`/api/v1/transactions?${query}`).actingAs(member)
      assert.lengthOf(partner.body().data, 0, query)
    }
    const payer = await client.get('/api/v1/transactions?q=Jewellery').actingAs(owner)
    assert.lengthOf(payer.body().data, 1)
  })

  test('test_partner_cannot_change_a_private_transaction', async ({ client, assert }) => {
    const { member, household, gift, gifts } = await surpriseGift()
    const books = await categoryBySlug(household.id, 'books-courses')

    for (const request of [
      client.patch(`/api/v1/transactions/${gift.id}`).json({ isPrivate: false }),
      client.delete(`/api/v1/transactions/${gift.id}`),
      client.put(`/api/v1/transactions/${gift.id}/splits`).json({ splits: [] }),
      client
        .post('/api/v1/transactions/bulk-categorize')
        .json({ ids: [gift.id], categoryId: books.id }),
    ]) {
      const response = await request.actingAs(member)
      response.assertStatus(403)
      response.assertBodyContains({ code: 'E_TRANSACTION_PRIVATE' })
    }

    await gift.refresh()
    assert.isTrue(gift.isPrivate)
    assert.equal(gift.categoryId, gifts.id)
  })

  test('test_month_report_shows_the_private_bucket_to_the_partner', async ({ client, assert }) => {
    const { owner, member, gifts } = await surpriseGift()

    const partner = await client.get('/api/v1/reports/month?month=2026-10').actingAs(member)
    const payer = await client.get('/api/v1/reports/month?month=2026-10').actingAs(owner)

    assert.equal(partner.body().data.expenseCents, 20_000)
    assert.deepEqual(
      partner.body().data.byCategory.map((line: any) => [line.bucket, line.categoryId]),
      [['private', null]]
    )
    assert.deepEqual(
      partner.body().data.byGroup.map((line: any) => [line.bucket, line.groupId]),
      [['private', null]]
    )
    assert.deepEqual(
      payer.body().data.byCategory.map((line: any) => [line.bucket, line.categoryId]),
      [['category', gifts.id]]
    )

    const trend = await client
      .get(`/api/v1/reports/category/${gifts.id}?month=2026-10&months=1`)
      .actingAs(member)
    assert.equal(trend.body().data.totalCents, 0)
  })
})
