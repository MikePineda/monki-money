import { test } from '@japa/runner'
import Clock from '#services/clock'
import type { HouseholdRef } from '#models/mixins/household_scoped'
import { createHousehold } from '#tests/helpers/household'
import { categoryBySlug } from '#tests/helpers/ledger'
import TransactionService from '#services/ledger/transaction_service'
import LedgerReferences from '#services/ledger/ledger_references'
import PostingsRepository from '#repositories/postings_repository'
import TransactionListing from '#services/ledger/transaction_listing'
import CandidatesRepository from '#repositories/candidates_repository'
import { TransactionFactory } from '#database/factories/transaction_factory'

test.group('Ledger repositories', () => {
  test('test_postings_flatten_split_lines_with_their_own_category', async ({ assert }) => {
    const { household, owner, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{}, {}],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const base = { householdId: household.id, accountId: accounts[0].id, date: '2026-10-05' }
    const plain = await TransactionFactory.merge({
      ...base,
      amountCents: -500,
      categoryId: groceries.id,
      paidByUserId: owner.id,
    }).create()
    const split = await TransactionFactory.merge({ ...base, amountCents: -1_001 })
      .apply('split')
      .create()
    await TransactionFactory.merge({ ...base, date: '2026-11-01' }).create()

    const postings = await new PostingsRepository().between(household, '2026-10-01', '2026-10-31')

    assert.lengthOf(postings, 3)
    const [first] = postings.filter((posting) => posting.transactionId === plain.id)
    assert.include(first, {
      splitId: null,
      amountCents: -500,
      categoryId: groceries.id,
      groupId: groceries.categoryGroupId,
      groupKind: 'expense',
      paidByUserId: owner.id,
      kind: 'expense',
      status: 'cleared',
      hidden: false,
    })
    const lines = postings.filter((posting) => posting.transactionId === split.id)
    assert.deepEqual(
      lines.map((line) => line.amountCents),
      [-501, -500]
    )
    assert.isTrue(lines.every((line) => line.splitId !== null && line.categoryId !== null))

    const onlySecondAccount = await new PostingsRepository().between(
      household,
      '2026-10-01',
      '2026-10-31',
      { accountIds: [accounts[1].id] }
    )
    assert.lengthOf(onlySecondAccount, 0)
  })

  test('test_candidates_match_account_amount_and_date_window', async ({ assert }) => {
    const { household, accounts } = await createHousehold({ accounts: [{}, {}] })
    const other = await createHousehold({ accounts: [{}] })
    const base = { householdId: household.id, accountId: accounts[0].id, amountCents: -4_250 }
    const manual = await TransactionFactory.merge({ ...base, date: '2026-10-03' }).create()
    const pendingImport = await TransactionFactory.merge({ ...base, date: '2026-10-05' })
      .apply('imported', 'pending')
      .create()
    // Outside the window, another amount, another account, another household.
    await TransactionFactory.merge({ ...base, date: '2026-09-20' }).create()
    await TransactionFactory.merge({ ...base, date: '2026-10-03', amountCents: -4_251 }).create()
    await TransactionFactory.merge({
      ...base,
      accountId: accounts[1].id,
      date: '2026-10-03',
    }).create()
    await TransactionFactory.merge({
      householdId: other.household.id,
      accountId: other.accounts[0].id,
      amountCents: -4_250,
      date: '2026-10-03',
    }).create()

    const repository = new CandidatesRepository()
    const window = {
      accountId: accounts[0].id,
      amountCents: -4_250,
      from: '2026-10-01',
      to: '2026-10-06',
    }

    const all = await repository.find(household, window)
    assert.deepEqual(
      all.map((candidate) => candidate.id),
      [manual.id, pendingImport.id]
    )
    assert.include(all[1], { source: 'import', status: 'pending', cardSuffix: '0001' })

    const manualOnly = await repository.find(household, {
      ...window,
      sources: ['manual', 'receipt'],
    })
    assert.deepEqual(
      manualOnly.map((candidate) => candidate.id),
      [manual.id]
    )
    const unclaimed = await repository.find(household, { ...window, excludeIds: [manual.id] })
    assert.deepEqual(
      unclaimed.map((candidate) => candidate.id),
      [pendingImport.id]
    )
  })

  test('test_client_id_race_returns_the_row_that_won', async ({ assert }) => {
    const { household, owner, accounts } = await createHousehold({ accounts: [{}] })
    const clientId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    const winner = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      clientId,
    }).create()

    // The pre-check misses (the concurrent insert landed right after it);
    // the unique index then rejects the insert and the service answers
    // with the row that won.
    class RacingService extends TransactionService {
      #checks = 0
      protected override async findByClientId(target: HouseholdRef, key: string) {
        this.#checks++
        return this.#checks === 1 ? null : super.findByClientId(target, key)
      }
    }
    const service = new RacingService(new LedgerReferences(), new TransactionListing(), new Clock())

    const result = await service.create(household, owner, {
      clientId,
      accountId: accounts[0].id,
      kind: 'expense',
      date: '2026-10-01',
      amountCents: 100,
    })

    assert.isFalse(result.created)
    assert.equal(result.transaction.id, winner.id)
  })
})
