import { test } from '@japa/runner'
import Transfer from '#models/transfer'
import Transaction from '#models/transaction'
import { createHousehold } from '#tests/helpers/household'
import { TransactionFactory } from '#database/factories/transaction_factory'

const CLIENT_ID = '3b241101-e2bb-4255-8caf-4136c566a962'

async function twoAccounts() {
  return createHousehold({
    users: 2,
    taxonomy: true,
    accounts: [
      { name: 'Everyday', openingBalanceCents: 100_000 },
      { name: 'Savings', kind: 'savings', owner: 1 },
    ],
  })
}

test.group('Transfers', () => {
  test('test_create_transfer_creates_two_legs_and_links_them', async ({ client, assert }) => {
    const { owner, member, household, accounts } = await twoAccounts()
    const [everyday, savings] = accounts

    const response = await client
      .post('/api/v1/transfers')
      .json({
        fromAccountId: everyday.id,
        toAccountId: savings.id,
        date: '2026-10-04',
        amountCents: 25_000,
        memo: 'Rainy day',
      })
      .actingAs(owner)

    response.assertStatus(201)
    const transfer = response.body().data
    assert.include(transfer, {
      fromAccountId: everyday.id,
      toAccountId: savings.id,
      amountCents: 25_000,
      memo: 'Rainy day',
    })
    assert.deepEqual(
      transfer.legs.map((leg: any) => [leg.accountId, leg.amountCents, leg.kind, leg.transferId]),
      [
        [everyday.id, -25_000, 'transfer', transfer.id],
        [savings.id, 25_000, 'transfer', transfer.id],
      ]
    )

    const legs = await Transaction.query().where('transfer_id', transfer.id).orderBy('amount_cents')
    assert.lengthOf(legs, 2)
    assert.isTrue(legs.every((leg) => leg.householdId === household.id && leg.categoryId === null))
    // Each leg's payer follows its account: joint -> creator, personal -> owner.
    assert.deepEqual(
      legs.map((leg) => leg.paidByUserId),
      [owner.id, member.id]
    )
    assert.equal(legs[0].description, 'Rainy day')
  })

  test('test_transfer_to_the_same_account_is_rejected', async ({ client, assert }) => {
    const { owner, household, accounts } = await twoAccounts()

    const response = await client
      .post('/api/v1/transfers')
      .json({
        fromAccountId: accounts[0].id,
        toAccountId: accounts[0].id,
        date: '2026-10-04',
        amountCents: 100,
      })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'toAccountId', rule: 'sameAccount' }] })
    assert.lengthOf(await Transfer.query().where('household_id', household.id), 0)
  })

  test('test_transfer_with_same_client_id_is_idempotent', async ({ client, assert }) => {
    const { owner, household, accounts } = await twoAccounts()
    const body = {
      clientId: CLIENT_ID,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      date: '2026-10-04',
      amountCents: 100,
    }

    const first = await client.post('/api/v1/transfers').json(body).actingAs(owner)
    const retry = await client.post('/api/v1/transfers').json(body).actingAs(owner)

    first.assertStatus(201)
    retry.assertStatus(200)
    assert.equal(retry.body().data.id, first.body().data.id)
    assert.lengthOf(await Transaction.query().where('household_id', household.id), 2)
  })

  test('test_update_transfer_rewrites_both_legs', async ({ client, assert }) => {
    const { owner, household, accounts } = await twoAccounts()
    const cash = await household.related('accounts').create({ name: 'Cash', kind: 'cash' })
    const created = await client
      .post('/api/v1/transfers')
      .json({
        fromAccountId: accounts[0].id,
        toAccountId: accounts[1].id,
        date: '2026-10-04',
        amountCents: 1_000,
      })
      .actingAs(owner)
    const id = created.body().data.id

    const response = await client
      .patch(`/api/v1/transfers/${id}`)
      .json({ toAccountId: cash.id, amountCents: 2_500, date: '2026-10-06', memo: null })
      .actingAs(owner)

    response.assertStatus(200)
    const legs = await Transaction.query().where('transfer_id', id).orderBy('amount_cents')
    assert.deepEqual(
      legs.map((leg) => [leg.accountId, leg.amountCents, leg.date]),
      [
        [accounts[0].id, -2_500, '2026-10-06'],
        [cash.id, 2_500, '2026-10-06'],
      ]
    )

    const same = await client
      .patch(`/api/v1/transfers/${id}`)
      .json({ fromAccountId: cash.id })
      .actingAs(owner)
    same.assertStatus(422)
    same.assertBodyContains({ errors: [{ field: 'toAccountId', rule: 'sameAccount' }] })
  })

  test('test_delete_transfer_removes_both_legs', async ({ client, assert }) => {
    const { owner, household, accounts } = await twoAccounts()
    const leg = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -700,
    })
      .apply('transfer')
      .create()

    const response = await client.delete(`/api/v1/transfers/${leg.transferId}`).actingAs(owner)

    response.assertStatus(204)
    assert.isNull(await Transfer.find(leg.transferId))
    assert.lengthOf(await Transaction.query().where('household_id', household.id), 0)
  })

  test('test_transfer_moves_balance_between_accounts', async ({ client, assert }) => {
    const { owner, accounts } = await twoAccounts()

    await client
      .post('/api/v1/transfers')
      .json({
        fromAccountId: accounts[0].id,
        toAccountId: accounts[1].id,
        date: '2026-10-04',
        amountCents: 30_000,
      })
      .actingAs(owner)

    const list = await client.get('/api/v1/accounts').actingAs(owner)
    assert.deepEqual(
      list.body().data.map((account: any) => account.clearedBalanceCents),
      [70_000, 30_000]
    )
  })

  test('test_transfer_legs_are_absent_from_month_report', async ({ client, assert }) => {
    const { owner, accounts } = await twoAccounts()

    await client
      .post('/api/v1/transfers')
      .json({
        fromAccountId: accounts[0].id,
        toAccountId: accounts[1].id,
        date: '2026-10-04',
        amountCents: 30_000,
      })
      .actingAs(owner)
    await client
      .post('/api/v1/transactions')
      .json({ accountId: accounts[0].id, kind: 'expense', date: '2026-10-05', amountCents: 1_200 })
      .actingAs(owner)

    const report = await client.get('/api/v1/reports/month?month=2026-10').actingAs(owner)

    report.assertStatus(200)
    const summary = report.body().data
    assert.equal(summary.expenseCents, 1_200)
    assert.equal(summary.incomeCents, 0)
    assert.equal(summary.transactionCount, 1)
    assert.deepEqual(
      summary.byCategory.map((line: any) => [line.bucket, line.amountCents]),
      [['uncategorized', 1_200]]
    )
  })
})
