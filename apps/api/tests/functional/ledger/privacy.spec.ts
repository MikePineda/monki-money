import { test } from '@japa/runner'
import HouseholdMember from '#models/household_member'
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
    const { member, gift, gifts } = await surpriseGift()

    for (const request of [
      client.patch(`/api/v1/transactions/${gift.id}`).json({ isPrivate: false }),
      client.delete(`/api/v1/transactions/${gift.id}`),
      client.put(`/api/v1/transactions/${gift.id}/splits`).json({ splits: [] }),
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

  test('test_bulk_categorize_skips_the_partners_private_rows', async ({ client, assert }) => {
    const { member, household, accounts, gift, gifts } = await surpriseGift()
    const books = await categoryBySlug(household.id, 'books-courses')
    const mine = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      paidByUserId: member.id,
    }).create()

    const response = await client
      .post('/api/v1/transactions/bulk-categorize')
      .json({ ids: [gift.id, mine.id], categoryId: books.id })
      .actingAs(member)

    response.assertStatus(200)
    response.assertBodyContains({ data: { updated: 1, skipped: 1 } })
    await gift.refresh()
    assert.equal(gift.categoryId, gifts.id)
    await mine.refresh()
    assert.equal(mine.categoryId, books.id)
  })

  test('test_partner_review_queue_excludes_private_rows', async ({ client, assert }) => {
    const { owner, member, gift } = await surpriseGift()
    await gift.merge({ needsReview: true }).save()

    const partner = await client.get('/api/v1/transactions?needsReview=1').actingAs(member)
    const payer = await client.get('/api/v1/transactions?needsReview=1').actingAs(owner)

    assert.lengthOf(partner.body().data, 0)
    assert.lengthOf(payer.body().data, 1)
  })

  test('test_private_row_of_a_former_member_is_visible_and_editable', async ({
    client,
    assert,
  }) => {
    const { owner, member, household, accounts } = await surpriseGift()
    const left = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      payee: 'Old secret',
      paidByUserId: member.id,
      createdByUserId: member.id,
    })
      .apply('private')
      .create()
    await HouseholdMember.query()
      .where('household_id', household.id)
      .where('user_id', member.id)
      .delete()

    const show = await client.get(`/api/v1/transactions/${left.id}`).actingAs(owner)
    show.assertBodyContains({ data: { isMasked: false, payee: 'Old secret' } })

    const update = await client
      .patch(`/api/v1/transactions/${left.id}`)
      .json({ isPrivate: false })
      .actingAs(owner)
    update.assertStatus(200)
    await left.refresh()
    assert.isFalse(left.isPrivate)
  })

  test('test_private_row_without_an_owner_is_visible_to_the_household', async ({ client }) => {
    const { member, household, accounts } = await surpriseGift()
    const orphan = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      payee: 'Nobody owns me',
      paidByUserId: null,
      createdByUserId: null,
    })
      .apply('private')
      .create()

    const response = await client.get(`/api/v1/transactions/${orphan.id}`).actingAs(member)

    response.assertBodyContains({ data: { isMasked: false, payee: 'Nobody owns me' } })
  })
})
