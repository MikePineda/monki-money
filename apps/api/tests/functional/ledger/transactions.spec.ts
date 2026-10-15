import { test } from '@japa/runner'
import Transaction from '#models/transaction'
import AccountCard from '#models/account_card'
import TransactionSplit from '#models/transaction_split'
import { createHousehold } from '#tests/helpers/household'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { TransactionFactory } from '#database/factories/transaction_factory'

const CLIENT_ID = '7d444840-9dc0-11d1-b245-5ffdce74fad2'

test.group('Transactions: create', () => {
  test('test_expense_is_stored_negative_income_positive', async ({ client, assert }) => {
    const { owner, accounts } = await createHousehold({ accounts: [{ name: 'Everyday' }] })

    const expense = await client
      .post('/api/v1/transactions')
      .json({ accountId: accounts[0].id, kind: 'expense', date: '2026-10-03', amountCents: 1_250 })
      .actingAs(owner)
    const income = await client
      .post('/api/v1/transactions')
      .json({ accountId: accounts[0].id, kind: 'income', date: '2026-10-03', amountCents: 9_900 })
      .actingAs(owner)

    expense.assertStatus(201)
    expense.assertBodyContains({ data: { kind: 'expense', amountCents: -1_250, categoryId: null } })
    income.assertStatus(201)
    income.assertBodyContains({ data: { kind: 'income', amountCents: 9_900 } })
    const stored = await Transaction.findOrFail(expense.body().data.id)
    assert.equal(stored.amountCents, -1_250)
    assert.equal(stored.source, 'manual')
    assert.equal(stored.status, 'cleared')
    assert.equal(stored.createdByUserId, owner.id)
  })

  test('test_create_defaults_payer_to_account_owner_then_card_then_creator', async ({ client }) => {
    const { owner, member, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Joint' }, { name: 'Member wallet', owner: 1 }],
    })
    await AccountCard.create({ accountId: accounts[0].id, cardSuffix: '2222', userId: member.id })
    const body = { kind: 'expense', date: '2026-10-03', amountCents: 500 }

    // Joint account, manual entry: whoever entered it.
    const joint = await client
      .post('/api/v1/transactions')
      .json({ ...body, accountId: accounts[0].id })
      .actingAs(owner)
    joint.assertBodyContains({ data: { paidByUserId: owner.id } })

    // Personal account: its owner, whoever entered it.
    const personal = await client
      .post('/api/v1/transactions')
      .json({ ...body, accountId: accounts[1].id })
      .actingAs(owner)
    personal.assertBodyContains({ data: { paidByUserId: member.id } })

    // "Both of us" is an explicit choice.
    const both = await client
      .post('/api/v1/transactions')
      .json({ ...body, accountId: accounts[0].id, paidByUserId: null })
      .actingAs(owner)
    both.assertBodyContains({ data: { paidByUserId: null } })
  })

  test('test_create_with_same_client_id_is_idempotent', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({ accounts: [{}] })
    const body = {
      clientId: CLIENT_ID,
      accountId: accounts[0].id,
      kind: 'expense',
      date: '2026-10-03',
      amountCents: 4_200,
      payee: 'Bakery',
    }

    const first = await client.post('/api/v1/transactions').json(body).actingAs(owner)
    const retry = await client.post('/api/v1/transactions').json(body).actingAs(owner)

    first.assertStatus(201)
    retry.assertStatus(200)
    assert.equal(retry.body().data.id, first.body().data.id)
    assert.lengthOf(await Transaction.query().where('household_id', household.id), 1)

    // The key only has to be unique per household.
    const other = await createHousehold({ accounts: [{}] })
    const elsewhere = await client
      .post('/api/v1/transactions')
      .json({ ...body, accountId: other.accounts[0].id })
      .actingAs(other.owner)
    elsewhere.assertStatus(201)
    assert.notEqual(elsewhere.body().data.id, first.body().data.id)
  })

  test('test_create_split_transaction_rejects_mismatched_sum', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const alcohol = await categoryBySlug(household.id, 'alcohol')

    const response = await client
      .post('/api/v1/transactions')
      .json({
        accountId: accounts[0].id,
        kind: 'expense',
        date: '2026-10-03',
        amountCents: 10_000,
        splits: [
          { categoryId: groceries.id, amountCents: 7_000 },
          { categoryId: alcohol.id, amountCents: 2_000 },
        ],
      })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'splits', rule: 'sumMismatch' }] })
    assert.lengthOf(await Transaction.query().where('household_id', household.id), 0)
  })

  test('test_create_split_transaction_stores_signed_lines', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const alcohol = await categoryBySlug(household.id, 'alcohol')

    const response = await client
      .post('/api/v1/transactions')
      .json({
        accountId: accounts[0].id,
        kind: 'expense',
        date: '2026-10-03',
        amountCents: 10_000,
        payee: 'Supermarket',
        splits: [
          { categoryId: groceries.id, amountCents: 7_000, memo: 'food' },
          { categoryId: alcohol.id, amountCents: 3_000 },
        ],
      })
      .actingAs(owner)

    response.assertStatus(201)
    response.assertBodyContains({
      data: {
        isSplit: true,
        categoryId: null,
        amountCents: -10_000,
        splits: [
          { categoryId: groceries.id, amountCents: -7_000, memo: 'food' },
          { categoryId: alcohol.id, amountCents: -3_000 },
        ],
      },
    })
    const lines = await TransactionSplit.query().where('transaction_id', response.body().data.id)
    assert.isTrue(lines.every((line) => line.householdId === household.id))
  })

  test('test_create_rejects_a_category_together_with_splits', async ({ client }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')

    const response = await client
      .post('/api/v1/transactions')
      .json({
        accountId: accounts[0].id,
        kind: 'expense',
        date: '2026-10-03',
        amountCents: 1_000,
        categoryId: groceries.id,
        splits: [
          { categoryId: groceries.id, amountCents: 500 },
          { categoryId: groceries.id, amountCents: 500 },
        ],
      })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'categoryId', rule: 'split' }] })
  })

  test('test_validation_rejects_bad_amounts_kinds_and_keys', async ({ client }) => {
    const { owner, accounts } = await createHousehold({ accounts: [{}] })

    const response = await client
      .post('/api/v1/transactions')
      .json({
        accountId: accounts[0].id,
        kind: 'transfer',
        date: '2026-02-30',
        amountCents: -5,
        clientId: 'not-a-uuid',
        tags: ['trip', 'trip'],
      })
      .actingAs(owner)

    response.assertStatus(422)
    const fields = response.body().errors.map((error: any) => error.field)
    for (const field of ['kind', 'date', 'amountCents', 'clientId', 'tags']) {
      if (!fields.includes(field)) throw new Error(`Expected a 422 on ${field}, got ${fields}`)
    }
  })

  test('test_private_flag_and_tags_are_stored', async ({ client, assert }) => {
    const { owner, accounts } = await createHousehold({ accounts: [{}] })

    const response = await client
      .post('/api/v1/transactions')
      .json({
        accountId: accounts[0].id,
        kind: 'expense',
        date: '2026-10-03',
        amountCents: 20_000,
        isPrivate: true,
        tags: ['trip'],
      })
      .actingAs(owner)

    response.assertStatus(201)
    response.assertBodyContains({ data: { isPrivate: true, isMasked: false, tags: ['trip'] } })
    const stored = await Transaction.findOrFail(response.body().data.id)
    assert.deepEqual(stored.tags, ['trip'])
  })
})

test.group('Transactions: quick add', () => {
  test('test_quick_create_defaults_date_to_today_in_brisbane', async ({ client, cleanup }) => {
    // 15:30 UTC on the 15th is 01:30 on the 16th in Brisbane (UTC+10).
    cleanup(freezeClock('2026-10-15T15:30:00Z'))
    const { owner } = await createHousehold({ accounts: [{ name: 'Everyday' }] })

    const response = await client
      .post('/api/v1/transactions/quick')
      .json({ amountCents: 450 })
      .actingAs(owner)

    response.assertStatus(201)
    response.assertBodyContains({
      data: { date: '2026-10-16', kind: 'expense', amountCents: -450, categoryId: null },
    })
  })

  test('test_quick_create_uses_the_last_account_this_person_used', async ({ client }) => {
    const { owner, member, household, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Everyday' }, { name: 'Savings' }, { name: 'Cash' }],
    })
    // The member used Cash last; the owner used Savings.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[1].id,
      createdByUserId: owner.id,
    }).create()
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[2].id,
      createdByUserId: member.id,
    }).create()

    const mine = await client
      .post('/api/v1/transactions/quick')
      .json({ amountCents: 100 })
      .actingAs(owner)
    mine.assertBodyContains({ data: { accountId: accounts[1].id } })

    const theirs = await client
      .post('/api/v1/transactions/quick')
      .json({ amountCents: 100 })
      .actingAs(member)
    theirs.assertBodyContains({ data: { accountId: accounts[2].id } })
  })

  test('test_quick_create_falls_back_to_the_first_active_account', async ({ client }) => {
    const { owner, accounts } = await createHousehold({
      accounts: [{ name: 'Everyday' }, { name: 'Savings' }],
    })
    await accounts[0].merge({ isActive: false }).save()

    const response = await client
      .post('/api/v1/transactions/quick')
      .json({ amountCents: 100, kind: 'income' })
      .actingAs(owner)

    response.assertStatus(201)
    response.assertBodyContains({ data: { accountId: accounts[1].id, amountCents: 100 } })
  })

  test('test_quick_create_without_any_account_is_a_validation_error', async ({ client }) => {
    const { owner } = await createHousehold()

    const response = await client
      .post('/api/v1/transactions/quick')
      .json({ amountCents: 100 })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'accountId', rule: 'required' }] })
  })
})

test.group('Transactions: list', () => {
  test('test_list_filters_by_month_account_category_and_text', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{ name: 'Everyday' }, { name: 'Savings' }],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const base = { householdId: household.id, accountId: accounts[0].id }
    const october = await TransactionFactory.merge({
      ...base,
      date: '2026-10-02',
      payee: 'Corner 100% Bakery',
      categoryId: groceries.id,
    }).create()
    const split = await TransactionFactory.merge({ ...base, date: '2026-10-05', payee: 'Mall' })
      .apply('split')
      .create()
    await TransactionFactory.merge({ ...base, date: '2026-09-30', payee: 'September' }).create()
    const savings = await TransactionFactory.merge({
      ...base,
      accountId: accounts[1].id,
      date: '2026-10-09',
      payee: 'Interest',
    }).create()

    const month = await client.get('/api/v1/transactions?month=2026-10').actingAs(owner)
    month.assertStatus(200)
    assert.deepEqual(
      month.body().data.map((row: any) => row.id),
      [savings.id, split.id, october.id]
    )
    assert.equal(month.body().metadata.total, 3)

    const byAccount = await client
      .get(`/api/v1/transactions?month=2026-10&accountId[]=${accounts[1].id}`)
      .actingAs(owner)
    assert.deepEqual(
      byAccount.body().data.map((row: any) => row.id),
      [savings.id]
    )

    const splitLine = await TransactionSplit.query().where('transaction_id', split.id).firstOrFail()
    const byCategory = await client
      .get(`/api/v1/transactions?categoryId[]=${groceries.id}&categoryId[]=${splitLine.categoryId}`)
      .actingAs(owner)
    assert.sameMembers(
      byCategory.body().data.map((row: any) => row.id),
      [october.id, split.id]
    )

    // LIKE wildcards in the search are literal.
    const search = await client.get('/api/v1/transactions?q=100%25').actingAs(owner)
    assert.deepEqual(
      search.body().data.map((row: any) => row.id),
      [october.id]
    )
  })

  test('test_list_accepts_a_single_account_id_and_paginates', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({ accounts: [{}, {}] })
    await TransactionFactory.merge({ householdId: household.id, accountId: accounts[0].id })
      .apply('pending')
      .createMany(3)
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[1].id,
    }).create()

    const page = await client
      .get(`/api/v1/transactions?accountId=${accounts[0].id}&perPage=2&page=2&status=pending`)
      .actingAs(owner)

    page.assertStatus(200)
    assert.lengthOf(page.body().data, 1)
    assert.include(page.body().metadata, { total: 3, perPage: 2, currentPage: 2, lastPage: 2 })

    const tooBig = await client.get('/api/v1/transactions?perPage=101').actingAs(owner)
    tooBig.assertStatus(422)
    tooBig.assertBodyContains({ errors: [{ field: 'perPage' }] })
  })

  test('test_list_sorts_by_amount_and_filters_triage', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const base = { householdId: household.id, accountId: accounts[0].id, date: '2026-10-01' }
    const small = await TransactionFactory.merge({ ...base, amountCents: -100 })
      .apply('imported')
      .create()
    const big = await TransactionFactory.merge({ ...base, amountCents: -9_000 }).create()
    await TransactionFactory.merge({
      ...base,
      amountCents: -500,
      categoryId: groceries.id,
    }).create()

    const uncategorized = await client
      .get('/api/v1/transactions?uncategorized=true&sort=amount')
      .actingAs(owner)
    assert.deepEqual(
      uncategorized.body().data.map((row: any) => row.id),
      [big.id, small.id]
    )

    const review = await client.get('/api/v1/transactions?needsReview=1').actingAs(owner)
    assert.deepEqual(
      review.body().data.map((row: any) => row.id),
      [small.id]
    )
  })
})

test.group('Transactions: update and delete', () => {
  test('test_update_changes_amount_kind_and_category', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const transaction = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -1_000,
    })
      .apply('imported')
      .create()

    const categorized = await client
      .patch(`/api/v1/transactions/${transaction.id}`)
      .json({ categoryId: groceries.id, amountCents: 1_500, payee: 'Grocer' })
      .actingAs(owner)
    categorized.assertStatus(200)
    categorized.assertBodyContains({
      data: { categoryId: groceries.id, amountCents: -1_500, payee: 'Grocer', needsReview: false },
    })

    const refund = await client
      .patch(`/api/v1/transactions/${transaction.id}`)
      .json({ kind: 'income' })
      .actingAs(owner)
    refund.assertBodyContains({ data: { kind: 'income', amountCents: 1_500 } })

    await transaction.refresh()
    assert.equal(transaction.updatedByUserId, owner.id)
  })

  test('test_split_transaction_keeps_its_lines_consistent', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const split = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -1_000,
    })
      .apply('split')
      .create()

    const amount = await client
      .patch(`/api/v1/transactions/${split.id}`)
      .json({ amountCents: 2_000 })
      .actingAs(owner)
    amount.assertStatus(422)
    amount.assertBodyContains({ errors: [{ field: 'amountCents', rule: 'splitSum' }] })

    const category = await client
      .patch(`/api/v1/transactions/${split.id}`)
      .json({ categoryId: groceries.id })
      .actingAs(owner)
    category.assertStatus(422)
    category.assertBodyContains({ errors: [{ field: 'categoryId', rule: 'split' }] })

    // Turning it into income flips every line.
    const flipped = await client
      .patch(`/api/v1/transactions/${split.id}`)
      .json({ kind: 'income' })
      .actingAs(owner)
    flipped.assertStatus(200)
    assert.deepEqual(
      flipped.body().data.splits.map((line: any) => line.amountCents),
      [500, 500]
    )
  })

  test('test_update_splits_replaces_lines_and_unsplits', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const alcohol = await categoryBySlug(household.id, 'alcohol')
    const transaction = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -1_000,
      categoryId: groceries.id,
    })
      .apply('imported')
      .create()

    const split = await client
      .put(`/api/v1/transactions/${transaction.id}/splits`)
      .json({
        splits: [
          { categoryId: groceries.id, amountCents: 600 },
          { categoryId: alcohol.id, amountCents: 400 },
        ],
      })
      .actingAs(owner)
    split.assertStatus(200)
    split.assertBodyContains({ data: { isSplit: true, categoryId: null, needsReview: false } })
    assert.lengthOf(await TransactionSplit.query().where('transaction_id', transaction.id), 2)

    const mismatch = await client
      .put(`/api/v1/transactions/${transaction.id}/splits`)
      .json({
        splits: [
          { categoryId: groceries.id, amountCents: 600 },
          { categoryId: alcohol.id, amountCents: 500 },
        ],
      })
      .actingAs(owner)
    mismatch.assertStatus(422)
    mismatch.assertBodyContains({ errors: [{ field: 'splits', rule: 'sumMismatch' }] })

    const unsplit = await client
      .put(`/api/v1/transactions/${transaction.id}/splits`)
      .json({ splits: [], categoryId: alcohol.id })
      .actingAs(owner)
    unsplit.assertStatus(200)
    unsplit.assertBodyContains({ data: { isSplit: false, categoryId: alcohol.id, splits: [] } })
    assert.lengthOf(await TransactionSplit.query().where('transaction_id', transaction.id), 0)
  })

  test('test_delete_transaction_removes_its_splits', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}],
    })
    const split = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
    })
      .apply('split')
      .create()

    const response = await client.delete(`/api/v1/transactions/${split.id}`).actingAs(owner)

    response.assertStatus(204)
    assert.isNull(await Transaction.find(split.id))
    assert.lengthOf(await TransactionSplit.query().where('transaction_id', split.id), 0)
  })

  test('test_transfer_leg_cannot_be_edited_as_a_transaction', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({ accounts: [{}, {}] })
    const leg = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -5_000,
    })
      .apply('transfer')
      .create()

    for (const request of [
      client.patch(`/api/v1/transactions/${leg.id}`).json({ amountCents: 1 }),
      client.delete(`/api/v1/transactions/${leg.id}`),
      client.put(`/api/v1/transactions/${leg.id}/splits`).json({ splits: [] }),
    ]) {
      const response = await request.actingAs(owner)
      response.assertStatus(409)
      response.assertBodyContains({ code: 'E_TRANSFER_LEG' })
    }
    await leg.refresh()
    assert.equal(leg.amountCents, -5_000)

    // Reading it is fine.
    const show = await client.get(`/api/v1/transactions/${leg.id}`).actingAs(owner)
    show.assertStatus(200)
    show.assertBodyContains({ data: { kind: 'transfer', transferId: leg.transferId } })
  })

  test('test_bulk_categorize_sets_category_and_skips_transfer_legs', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}, {}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const base = { householdId: household.id, accountId: accounts[0].id }
    const rows = await TransactionFactory.merge(base).apply('imported').createMany(2)
    const leg = await TransactionFactory.merge({ ...base, amountCents: -100 })
      .apply('transfer')
      .create()
    const split = await TransactionFactory.merge(base).apply('split').create()

    const response = await client
      .post('/api/v1/transactions/bulk-categorize')
      .json({ ids: [...rows.map((row) => row.id), leg.id, split.id], categoryId: groceries.id })
      .actingAs(owner)

    response.assertStatus(200)
    response.assertBodyContains({ data: { updated: 2, skipped: 2 } })
    for (const row of rows) {
      await row.refresh()
      assert.equal(row.categoryId, groceries.id)
      assert.isFalse(row.needsReview)
    }
    await leg.refresh()
    assert.isNull(leg.categoryId)
  })

  test('test_changing_the_account_takes_its_currency', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({ accounts: [{}] })
    const wise = await household
      .related('accounts')
      .create({ name: 'Wise USD', kind: 'wallet', currencyCode: 'USD' })
    const transaction = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
    }).create()

    const response = await client
      .patch(`/api/v1/transactions/${transaction.id}`)
      .json({ accountId: wise.id })
      .actingAs(owner)

    response.assertBodyContains({ data: { accountId: wise.id, currencyCode: 'USD' } })
    await transaction.refresh()
    assert.equal(transaction.currencyCode, 'USD')
  })
})
