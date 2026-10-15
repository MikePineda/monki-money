import { test } from '@japa/runner'
import Account from '#models/account'
import AccountCard from '#models/account_card'
import { createHousehold } from '#tests/helpers/household'
import { TransactionFactory } from '#database/factories/transaction_factory'

test.group('Accounts', () => {
  test('test_account_list_includes_cleared_and_available_balance', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      accounts: [
        { name: 'Everyday', openingBalanceCents: 0 },
        { name: 'Savings', kind: 'savings', openingBalanceCents: 1250 },
      ],
    })
    const everydayRows = { householdId: household.id, accountId: accounts[0].id }
    await TransactionFactory.merge({ ...everydayRows, amountCents: 10_000 })
      .apply('income')
      .create()
    await TransactionFactory.merge({ ...everydayRows, amountCents: -2_500 }).create()
    await TransactionFactory.merge({ ...everydayRows, amountCents: -1_000 })
      .apply('pending')
      .create()

    const response = await client.get('/api/v1/accounts').actingAs(owner)

    response.assertStatus(200)
    const [everyday, savings] = response.body().data
    assert.equal(everyday.name, 'Everyday')
    // Opening balance + ledger; the pending purchase only lowers "available".
    assert.equal(everyday.clearedBalanceCents, 7_500)
    assert.equal(everyday.availableBalanceCents, 6_500)
    // No movements: the opening balance.
    assert.equal(savings.clearedBalanceCents, 1250)
    assert.equal(savings.availableBalanceCents, 1250)
    assert.deepEqual(everyday.cards, [])
  })

  test('test_balance_counts_only_rows_after_the_opening_balance_date', async ({
    client,
    assert,
  }) => {
    const { owner, household, accounts } = await createHousehold({
      accounts: [
        { name: 'Everyday', openingBalanceCents: 10_000, openingBalanceDate: '2026-10-05' },
        { name: 'Cash', openingBalanceCents: 500 },
      ],
    })
    const rows = { householdId: household.id, accountId: accounts[0].id }
    // The opening balance is the balance at the end of its date: rows dated
    // on or before it are already inside it.
    await TransactionFactory.merge({ ...rows, date: '2026-10-04', amountCents: -1_000 }).create()
    await TransactionFactory.merge({ ...rows, date: '2026-10-05', amountCents: -2_000 }).create()
    await TransactionFactory.merge({ ...rows, date: '2026-10-06', amountCents: -300 }).create()
    // Without a date, every row counts.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[1].id,
      date: '2020-01-01',
      amountCents: -100,
    }).create()

    const response = await client.get('/api/v1/accounts').actingAs(owner)

    const [everyday, cash] = response.body().data
    assert.equal(everyday.clearedBalanceCents, 9_700)
    assert.equal(everyday.availableBalanceCents, 9_700)
    assert.equal(cash.clearedBalanceCents, 400)
  })

  test('test_create_a_personal_account_with_an_opening_balance', async ({ client, assert }) => {
    const { owner, member, household } = await createHousehold({ users: 2 })

    const response = await client
      .post('/api/v1/accounts')
      .json({
        name: 'Wallet',
        institution: 'Hnry',
        kind: 'wallet',
        ownerUserId: member.id,
        openingBalanceCents: -1999,
        openingBalanceDate: '2026-02-28',
      })
      .actingAs(owner)

    response.assertStatus(201)
    response.assertBodyContains({
      data: {
        name: 'Wallet',
        kind: 'wallet',
        ownerUserId: member.id,
        isJoint: false,
        currencyCode: 'AUD',
        openingBalanceCents: -1999,
        openingBalanceDate: '2026-02-28',
      },
    })
    const account = await Account.findOrFail(response.body().data.id)
    assert.equal(account.householdId, household.id)
    assert.equal(account.createdByUserId, owner.id)
  })

  test('test_joint_account_with_one_card_per_person', async ({ client, assert }) => {
    const { owner, member } = await createHousehold({ users: 2 })

    const created = await client
      .post('/api/v1/accounts')
      .json({ name: 'Everyday', kind: 'transaction', externalAccountNumber: '000111222' })
      .actingAs(owner)
    created.assertStatus(201)
    created.assertBodyContains({ data: { ownerUserId: null, isJoint: true } })
    const accountId = created.body().data.id

    for (const [suffix, user] of [
      ['1111', owner],
      ['2222', member],
    ] as const) {
      const card = await client
        .post(`/api/v1/accounts/${accountId}/cards`)
        .json({ cardSuffix: suffix, userId: user.id })
        .actingAs(owner)
      card.assertStatus(201)
    }

    const duplicate = await client
      .post(`/api/v1/accounts/${accountId}/cards`)
      .json({ cardSuffix: '1111', userId: member.id })
      .actingAs(owner)
    duplicate.assertStatus(422)
    duplicate.assertBodyContains({ errors: [{ field: 'cardSuffix', rule: 'taken' }] })

    const show = await client.get(`/api/v1/accounts/${accountId}`).actingAs(member)
    show.assertStatus(200)
    assert.sameDeepMembers(
      show.body().data.cards.map((c: any) => ({ cardSuffix: c.cardSuffix, userId: c.userId })),
      [
        { cardSuffix: '1111', userId: owner.id },
        { cardSuffix: '2222', userId: member.id },
      ]
    )
  })

  test('test_external_account_number_is_unique_per_household', async ({ client }) => {
    const { owner } = await createHousehold({
      accounts: [{ name: 'Everyday', externalAccountNumber: '000111222' }],
    })
    // The same number in another household is fine.
    await createHousehold({ accounts: [{ externalAccountNumber: '000111999' }] })

    const response = await client
      .post('/api/v1/accounts')
      .json({ name: 'Copy', kind: 'transaction', externalAccountNumber: '000111222' })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'externalAccountNumber', rule: 'taken' }] })
  })

  test('test_account_creation_respects_the_plan_limit', async ({ client, assert }) => {
    // Free plan: 6 accounts.
    const { owner, household } = await createHousehold({
      accounts: Array.from({ length: 6 }, (_, index) => ({ name: `Account ${index}` })),
    })

    const response = await client
      .post('/api/v1/accounts')
      .json({ name: 'Seventh', kind: 'cash' })
      .actingAs(owner)

    response.assertStatus(402)
    response.assertBodyContains({ code: 'E_ACCOUNT_LIMIT_REACHED' })
    assert.lengthOf(await Account.query().where('household_id', household.id), 6)
  })

  test('test_owner_must_be_a_member_of_the_household', async ({ client }) => {
    const { owner } = await createHousehold()
    const outsider = await createHousehold()

    const response = await client
      .post('/api/v1/accounts')
      .json({ name: 'Sneaky', kind: 'transaction', ownerUserId: outsider.owner.id })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'ownerUserId', rule: 'database.exists' }] })
  })

  test('test_update_account_fields', async ({ client, assert }) => {
    const { owner, accounts } = await createHousehold({ accounts: [{ name: 'Everyday' }] })

    const response = await client
      .patch(`/api/v1/accounts/${accounts[0].id}`)
      .json({ name: 'Bills', isActive: false, openingBalanceDate: null })
      .actingAs(owner)

    response.assertStatus(200)
    await accounts[0].refresh()
    assert.equal(accounts[0].name, 'Bills')
    assert.isFalse(accounts[0].isActive)
  })

  test('test_members_can_manage_accounts_too', async ({ client }) => {
    const { member } = await createHousehold({ users: 2 })

    const response = await client
      .post('/api/v1/accounts')
      .json({ name: 'Mine', kind: 'savings', ownerUserId: member.id })
      .actingAs(member)

    response.assertStatus(201)
  })

  test('test_reorder_updates_sort_order', async ({ client, assert }) => {
    const { owner, accounts } = await createHousehold({
      accounts: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    })
    const [a, b, c] = accounts

    const response = await client
      .put('/api/v1/accounts/reorder')
      .json({ ids: [c.id, a.id, b.id] })
      .actingAs(owner)
    response.assertStatus(204)

    const list = await client.get('/api/v1/accounts').actingAs(owner)
    assert.deepEqual(
      list.body().data.map((row: any) => row.name),
      ['C', 'A', 'B']
    )
  })

  test('test_delete_account_without_transactions', async ({ client, assert }) => {
    const { owner, accounts } = await createHousehold({ accounts: [{ name: 'Old' }] })

    const response = await client.delete(`/api/v1/accounts/${accounts[0].id}`).actingAs(owner)

    response.assertStatus(204)
    assert.isNull(await Account.find(accounts[0].id))
  })

  test('test_account_with_transactions_cannot_be_deleted', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({ accounts: [{ name: 'Busy' }] })
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
    }).create()

    const response = await client.delete(`/api/v1/accounts/${accounts[0].id}`).actingAs(owner)

    response.assertStatus(409)
    response.assertBodyContains({ code: 'E_ACCOUNT_IN_USE' })
    assert.isNotNull(await Account.find(accounts[0].id))
  })

  test('test_account_with_only_a_transfer_cannot_be_deleted', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      accounts: [{ name: 'Everyday' }, { name: 'Savings' }],
    })
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -100,
    })
      .apply('transfer')
      .create()

    const response = await client.delete(`/api/v1/accounts/${accounts[1].id}`).actingAs(owner)

    response.assertStatus(409)
    response.assertBodyContains({ code: 'E_ACCOUNT_IN_USE' })
    assert.isNotNull(await Account.find(accounts[1].id))
  })

  test('test_remove_a_card', async ({ client, assert }) => {
    const { owner, accounts } = await createHousehold({ accounts: [{ name: 'Everyday' }] })
    const card = await AccountCard.create({
      accountId: accounts[0].id,
      cardSuffix: '3333',
      userId: owner.id,
    })

    const response = await client
      .delete(`/api/v1/accounts/${accounts[0].id}/cards/${card.id}`)
      .actingAs(owner)

    response.assertStatus(204)
    assert.isNull(await AccountCard.find(card.id))
  })

  test('test_validation_rejects_unknown_kind_and_bad_dates', async ({ client }) => {
    const { owner } = await createHousehold()

    const response = await client
      .post('/api/v1/accounts')
      .json({
        name: 'X',
        kind: 'credit',
        openingBalanceDate: '2026-02-30',
        openingBalanceCents: 1.5,
      })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [
        { field: 'kind', rule: 'enum' },
        { field: 'openingBalanceCents', rule: 'withoutDecimals' },
        { field: 'openingBalanceDate', rule: 'dateString' },
      ],
    })
  })
})
