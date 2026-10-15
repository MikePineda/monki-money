import { test } from '@japa/runner'
import { groupByAccountNumber } from '#domain/importing/account_grouping'
import { balanceChainBreaks, openingBalanceCents } from '#domain/importing/balance_chain'
import { suggestPaidBy } from '#domain/importing/paid_by'
import { stageRows } from '#domain/importing/staging'
import { parsedRow } from '#tests/helpers/importing'

test.group('Importing / staging', () => {
  test('test_staging_derives_date_description_merchant_card_and_hash', ({ assert }) => {
    const [row] = stageRows([parsedRow()], { accountId: 7, today: '2026-10-15' })
    assert.include(row, {
      accountId: 7,
      occurrence: 1,
      date: '2026-09-19',
      bankDate: '2026-09-21',
      descriptionNormalized: 'FRESHCO MARKET NORTHVALE',
      merchantKey: 'freshco market',
      merchantFullKey: 'freshco market northvale village',
      cardSuffix: '2222',
      isFutureDated: false,
      suggestedPaidByUserId: null,
    })
    assert.match(row.externalHash, /^[0-9a-f]{64}$/)
  })

  test('test_future_dated_rows_are_flagged_for_review', ({ assert }) => {
    const rows = stageRows(
      [
        parsedRow({ bankDate: '2026-10-16', details: 'CASH', detailsRaw: 'CASH' }),
        parsedRow({ bankDate: '2026-10-15', details: 'CASH', detailsRaw: 'CASH' }),
      ],
      { accountId: 1, today: '2026-10-15' }
    )
    assert.deepEqual(
      rows.map((row) => row.isFutureDated),
      [true, false]
    )
  })

  test('test_payer_comes_from_account_owner_then_card_then_fallback', ({ assert }) => {
    const cardOwners = new Map([
      ['1111', 1],
      ['2222', 2],
    ])
    assert.equal(suggestPaidBy('2222', { accountOwnerUserId: 9, cardOwners, fallbackUserId: 3 }), 9)
    assert.equal(
      suggestPaidBy('2222', { accountOwnerUserId: null, cardOwners, fallbackUserId: 3 }),
      2
    )
    assert.equal(
      suggestPaidBy('9999', { accountOwnerUserId: null, cardOwners, fallbackUserId: 3 }),
      3
    )
    assert.equal(
      suggestPaidBy(null, { accountOwnerUserId: null, cardOwners, fallbackUserId: null }),
      null
    )

    const [row] = stageRows([parsedRow()], {
      accountId: 1,
      today: '2026-10-15',
      payers: { accountOwnerUserId: null, cardOwners, fallbackUserId: null },
    })
    assert.equal(row.suggestedPaidByUserId, 2)
  })

  test('test_multiple_account_numbers_are_grouped_in_file_order', ({ assert }) => {
    const rows = [
      parsedRow({ rowIndex: 0, accountNumber: '111' }),
      parsedRow({ rowIndex: 1, accountNumber: '222' }),
      parsedRow({ rowIndex: 2, accountNumber: '111' }),
    ]
    const groups = groupByAccountNumber(rows)
    assert.deepEqual([...groups.keys()], ['111', '222'])
    assert.deepEqual(
      groups.get('111')?.map((row) => row.rowIndex),
      [0, 2]
    )
  })

  test('test_balance_chain_reports_where_a_row_is_missing', ({ assert }) => {
    // Newest first: each balance equals the next (older) balance plus its own amount.
    const rows = [
      { amountCents: -500, balanceCents: 9000 },
      { amountCents: -1000, balanceCents: 9500 },
      { amountCents: 2000, balanceCents: 12000 },
      { amountCents: 0, balanceCents: 10000 },
    ]
    assert.deepEqual(balanceChainBreaks(rows), [1])
    assert.equal(openingBalanceCents(rows), 10000)
    assert.isNull(openingBalanceCents([]))
    assert.isNull(openingBalanceCents([{ amountCents: 5, balanceCents: null }]))
  })
})
