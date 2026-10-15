import { DateTime } from 'luxon'
import Account from '#models/account'
import Category from '#models/category'
import Transfer from '#models/transfer'
import Transaction from '#models/transaction'
import factory from '@adonisjs/lucid/factories'
import CategoryGroup from '#models/category_group'
import { splitEvenly } from '#domain/money/cents'
import TransactionSplit from '#models/transaction_split'
import type { FactoryContextContract } from '@adonisjs/lucid/types/factory'

/**
 * Synthetic ledger rows. Always pass `householdId` and `accountId` through
 * `.merge()` (plus `paidByUserId`/`createdByUserId` when they matter).
 *
 * States:
 * - `income`: positive amount.
 * - `transfer`: a transfer leg; creates the `transfers` row and the
 *   opposite leg on another account of the household (created if needed).
 * - `split`: two lines over two categories of the household.
 * - `imported`: as the CSV import leaves it (raw description, bank date,
 *   card suffix, needs review).
 * - `private`: only the payer sees the details.
 * - `pending`: not settled yet.
 */

async function otherAccountOf(row: Transaction, ctx: FactoryContextContract) {
  const existing = await Account.query({ client: ctx.$trx })
    .where('household_id', row.householdId)
    .whereNot('id', row.accountId)
    .orderBy('id')
    .first()
  if (existing) return existing
  return Account.create(
    { householdId: row.householdId, name: 'Factory savings', kind: 'savings' },
    { client: ctx.$trx }
  )
}

async function twoCategoriesOf(householdId: number, ctx: FactoryContextContract) {
  const categories = await Category.query({ client: ctx.$trx })
    .where('household_id', householdId)
    .orderBy('id')
    .limit(2)
  if (categories.length === 2) return categories

  const group = await CategoryGroup.create(
    { householdId, name: 'Factory group', slug: `factory-${Date.now()}`, kind: 'expense' },
    { client: ctx.$trx }
  )
  return Promise.all(
    ['a', 'b'].map((suffix) =>
      Category.create(
        {
          householdId,
          categoryGroupId: group.id,
          name: `Factory ${suffix}`,
          slug: `factory-${group.id}-${suffix}`,
        },
        { client: ctx.$trx }
      )
    )
  )
}

export const TransactionFactory = factory
  .define(Transaction, ({ faker }) => ({
    kind: 'expense' as const,
    date: DateTime.now().toISODate()!,
    bankDate: null,
    amountCents: -faker.number.int({ min: 100, max: 50_000 }),
    currencyCode: 'AUD',
    payee: faker.company.name().slice(0, 120),
    description: null,
    rawDescription: null,
    categoryId: null,
    isSplit: false,
    transferId: null,
    paidByUserId: null,
    status: 'cleared' as const,
    source: 'manual' as const,
    needsReview: false,
    cardSuffix: null,
    clientId: null,
    isPrivate: false,
    tags: [] as string[],
    createdByUserId: null,
    updatedByUserId: null,
  }))
  .state('income', (row) => {
    row.kind = 'income'
    row.amountCents = Math.abs(row.amountCents)
  })
  .state('transfer', (row) => {
    row.kind = 'transfer'
    row.categoryId = null
    row.payee = null
  })
  .state('split', (row) => {
    row.isSplit = true
    row.categoryId = null
  })
  .state('imported', (row, { faker }) => {
    row.source = 'import'
    row.bankDate = row.date
    row.cardSuffix = row.cardSuffix ?? '0001'
    row.rawDescription = `V${row.cardSuffix} ${(row.payee ?? 'MERCHANT').toUpperCase()} ${faker.string.numeric(6)}`
    row.needsReview = true
  })
  .state('private', (row) => {
    row.isPrivate = true
  })
  .state('pending', (row) => {
    row.status = 'pending'
  })
  .before('create', async (_, row, ctx) => {
    if (row.kind !== 'transfer' || row.transferId) return
    const other = await otherAccountOf(row, ctx)
    const outgoing = row.amountCents < 0
    const transfer = await Transfer.create(
      {
        householdId: row.householdId,
        date: row.date,
        amountCents: Math.abs(row.amountCents),
        fromAccountId: outgoing ? row.accountId : other.id,
        toAccountId: outgoing ? other.id : row.accountId,
        memo: null,
        createdByUserId: row.createdByUserId,
      },
      { client: ctx.$trx }
    )
    row.transferId = transfer.id
    // The after-create hook adds the opposite leg on this account.
    row.$extras['counterpartAccountId'] = other.id
  })
  .after('create', async (_, row, ctx) => {
    const counterpartAccountId = row.$extras['counterpartAccountId'] as number | undefined
    if (row.kind === 'transfer' && counterpartAccountId) {
      await Transaction.create(
        {
          householdId: row.householdId,
          accountId: counterpartAccountId,
          kind: 'transfer',
          date: row.date,
          amountCents: -row.amountCents,
          transferId: row.transferId,
          status: row.status,
          paidByUserId: row.paidByUserId,
          createdByUserId: row.createdByUserId,
        },
        { client: ctx.$trx }
      )
    }

    if (row.isSplit) {
      const categories = await twoCategoriesOf(row.householdId, ctx)
      const amounts = splitEvenly(row.amountCents, 2)
      await TransactionSplit.createMany(
        categories.map((category, index) => ({
          householdId: row.householdId,
          transactionId: row.id,
          categoryId: category.id,
          amountCents: amounts[index],
          sortOrder: index,
        })),
        { client: ctx.$trx }
      )
    }
  })
  .build()

/**
 * Synthetic transfers with both legs. Pass `householdId`, `fromAccountId`
 * and `toAccountId` (different accounts of that household) via `.merge()`.
 */
export const TransferFactory = factory
  .define(Transfer, ({ faker }) => ({
    date: DateTime.now().toISODate()!,
    amountCents: faker.number.int({ min: 100, max: 100_000 }),
    memo: null,
    clientId: null,
    createdByUserId: null,
    updatedByUserId: null,
  }))
  .after('create', async (_, transfer, ctx) => {
    await Transaction.createMany(
      [
        { accountId: transfer.fromAccountId, amountCents: -transfer.amountCents },
        { accountId: transfer.toAccountId, amountCents: transfer.amountCents },
      ].map((leg) => ({
        ...leg,
        householdId: transfer.householdId,
        kind: 'transfer' as const,
        date: transfer.date,
        transferId: transfer.id,
        description: transfer.memo,
        createdByUserId: transfer.createdByUserId,
      })),
      { client: ctx.$trx }
    )
  })
  .build()
