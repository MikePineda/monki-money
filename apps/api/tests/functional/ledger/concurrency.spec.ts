import { test } from '@japa/runner'
import Transfer from '#models/transfer'
import Transaction from '#models/transaction'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import TransactionSplit from '#models/transaction_split'
import { categoryBySlug } from '#tests/helpers/ledger'
import { createHousehold } from '#tests/helpers/household'
import AccountService from '#services/accounts/account_service'
import CategoryService from '#services/categories/category_service'
import TransferService from '#services/ledger/transfer_service'
import TransactionService from '#services/ledger/transaction_service'
import { untilSomeoneWaitsOnALock, withoutGlobalTransaction } from '#tests/helpers/committed'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

/**
 * Overlapping writes on real connections. A second transaction holds the
 * row lock and commits a competing change while the service call waits;
 * the service must then work from the committed row, not from what it read
 * before the lock.
 */
test.group('Ledger concurrency', () => {
  test('test_overlapping_transfer_updates_keep_legs_equal_to_the_transfer', async ({
    assert,
    cleanup,
  }) => {
    const committed = await withoutGlobalTransaction(cleanup)
    const { household, owner, accounts } = committed.track(
      await createHousehold({ accounts: [{}, {}] })
    )
    const transfer = await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      amountCents: 1_000,
    }).create()
    const service = await app.container.make(TransferService)

    // Request B (amount 2,500) holds the lock while request A (memo) starts.
    const other = await db.transaction()
    await other.from('transfers').where('id', transfer.id).forUpdate()
    const memoUpdate = service.update(household, owner, transfer.id, { memo: 'Rent buffer' })
    await untilSomeoneWaitsOnALock()
    await other.from('transfers').where('id', transfer.id).update({ amount_cents: 2_500 })
    await other
      .from('transactions')
      .where('transfer_id', transfer.id)
      .where('amount_cents', '<', 0)
      .update({ amount_cents: -2_500 })
    await other
      .from('transactions')
      .where('transfer_id', transfer.id)
      .where('amount_cents', '>', 0)
      .update({ amount_cents: 2_500 })
    await other.commit()
    await memoUpdate

    const fresh = await Transfer.findOrFail(transfer.id)
    const legs = await Transaction.query().where('transfer_id', transfer.id).orderBy('amount_cents')
    assert.equal(fresh.amountCents, 2_500)
    assert.equal(fresh.memo, 'Rent buffer')
    assert.deepEqual(
      legs.map((leg) => leg.amountCents),
      [-2_500, 2_500]
    )
  })

  test('test_overlapping_kind_flips_keep_split_lines_summing_to_the_parent', async ({
    assert,
    cleanup,
  }) => {
    const committed = await withoutGlobalTransaction(cleanup)
    const { household, owner, accounts } = committed.track(
      await createHousehold({ taxonomy: true, accounts: [{}] })
    )
    const split = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -1_000,
    })
      .apply('split')
      .create()
    const service = await app.container.make(TransactionService)

    // Request B (kind -> income) holds the lock while request A asks the same.
    const other = await db.transaction()
    await other.from('transactions').where('id', split.id).forUpdate()
    const flip = service.update(household, owner, split.id, { kind: 'income' })
    await untilSomeoneWaitsOnALock()
    await other
      .from('transactions')
      .where('id', split.id)
      .update({ kind: 'income', amount_cents: 1_000 })
    await other
      .from('transaction_splits')
      .where('transaction_id', split.id)
      .update({ amount_cents: 500 })
    await other.commit()
    await flip

    const parent = await Transaction.findOrFail(split.id)
    const lines = await TransactionSplit.query().where('transaction_id', split.id)
    assert.equal(parent.amountCents, 1_000)
    assert.equal(
      lines.reduce((total, line) => total + line.amountCents, 0),
      1_000
    )
  })

  test('test_category_delete_racing_an_insert_answers_in_use', async ({ assert, cleanup }) => {
    const committed = await withoutGlobalTransaction(cleanup)
    const { household, accounts } = committed.track(
      await createHousehold({ taxonomy: true, accounts: [{}] })
    )
    const snacks = await categoryBySlug(household.id, 'snacks')

    // Someone is saving a snack purchase right now (not committed yet).
    const other = await db.transaction()
    await other.table('transactions').insert({
      household_id: household.id,
      account_id: accounts[0].id,
      kind: 'expense',
      date: '2026-10-01',
      amount_cents: -100,
      category_id: snacks.id,
      created_at: new Date(),
      updated_at: new Date(),
    })
    const service = await app.container.make(CategoryService)
    const deletion = service.delete(household, snacks.id).catch((error) => error)
    await untilSomeoneWaitsOnALock()
    await other.commit()

    const error = await deletion
    assert.equal(error?.code, 'E_CATEGORY_IN_USE')
    assert.isNotNull(await db.from('categories').where('id', snacks.id).first())
  })

  test('test_account_delete_racing_an_insert_answers_in_use', async ({ assert, cleanup }) => {
    const committed = await withoutGlobalTransaction(cleanup)
    const { household, accounts } = committed.track(await createHousehold({ accounts: [{}] }))

    const other = await db.transaction()
    await other.table('transactions').insert({
      household_id: household.id,
      account_id: accounts[0].id,
      kind: 'expense',
      date: '2026-10-01',
      amount_cents: -100,
      created_at: new Date(),
      updated_at: new Date(),
    })
    const service = await app.container.make(AccountService)
    const deletion = service.delete(household, accounts[0].id).catch((error) => error)
    await untilSomeoneWaitsOnALock()
    await other.commit()

    const error = await deletion
    assert.equal(error?.code, 'E_ACCOUNT_IN_USE')
    assert.isNotNull(await db.from('accounts').where('id', accounts[0].id).first())
  })
})
