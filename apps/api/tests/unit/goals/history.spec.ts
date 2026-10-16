import { test } from '@japa/runner'
import {
  accountHistory,
  HISTORY_FULL_MONTHS,
  startingHistory,
  type HistoryEntry,
} from '#domain/goals/history'

const NO_OPENING_DATE = { openingBalanceCents: 0, openingBalanceDate: null }

function cleared(date: string, amountCents: number): HistoryEntry {
  return { date, amountCents, status: 'cleared' }
}

function pending(date: string, amountCents: number): HistoryEntry {
  return { date, amountCents, status: 'pending' }
}

test.group('Goals: history', () => {
  test('test_history_has_one_month_end_balance_per_month_including_the_current_one', ({
    assert,
  }) => {
    const entries = [
      cleared('2026-02-15', 999),
      cleared('2026-04-10', 10_000),
      cleared('2026-05-31', 5_000),
      cleared('2026-07-01', -2_000),
      cleared('2026-09-20', 20_000),
      cleared('2026-10-02', 1_000),
    ]

    const history = accountHistory(
      { openingBalanceCents: 100_000, openingBalanceDate: null },
      entries,
      '2026-10'
    )

    assert.equal(HISTORY_FULL_MONTHS, 6)
    assert.deepEqual(history, [
      { month: '2026-04', balanceCents: 110_999 },
      { month: '2026-05', balanceCents: 115_999 },
      { month: '2026-06', balanceCents: 115_999 },
      { month: '2026-07', balanceCents: 113_999 },
      { month: '2026-08', balanceCents: 113_999 },
      { month: '2026-09', balanceCents: 133_999 },
      { month: '2026-10', balanceCents: 134_999 },
    ])
  })

  test('test_history_uses_cleared_postings_up_to_the_month_end', ({ assert }) => {
    const entries = [
      // The last day of September counts for September...
      cleared('2026-09-30', 30_000),
      // ...the first of October does not.
      cleared('2026-10-01', 4_000),
      // Pending money is not saved yet, in any month.
      pending('2026-09-10', 50_000),
      pending('2026-10-05', 70_000),
      // Dated after the current month: never part of the history.
      cleared('2026-11-01', 9_000),
    ]

    const history = accountHistory(NO_OPENING_DATE, entries, '2026-10', 1)

    assert.deepEqual(history, [
      { month: '2026-09', balanceCents: 30_000 },
      { month: '2026-10', balanceCents: 34_000 },
    ])
  })

  test('test_history_does_not_depend_on_the_order_of_the_postings', ({ assert }) => {
    const entries = [cleared('2026-10-03', 1_000), cleared('2026-08-03', 2_000)]

    assert.deepEqual(
      accountHistory(NO_OPENING_DATE, entries, '2026-10', 2),
      accountHistory(NO_OPENING_DATE, [...entries].reverse(), '2026-10', 2)
    )
  })

  test('test_history_starts_at_the_opening_balance_date', ({ assert }) => {
    const account = { openingBalanceCents: 200_000, openingBalanceDate: '2026-08-12' }
    const entries = [
      // Already inside the opening balance.
      cleared('2026-07-20', 50_000),
      cleared('2026-08-12', 7_000),
      // After it.
      cleared('2026-08-13', 1_000),
      cleared('2026-09-01', 2_000),
    ]

    // Months that end before the opening date are unknown, so they are left out.
    assert.deepEqual(accountHistory(account, entries, '2026-10'), [
      { month: '2026-08', balanceCents: 201_000 },
      { month: '2026-09', balanceCents: 203_000 },
      { month: '2026-10', balanceCents: 203_000 },
    ])
  })

  test('test_history_of_an_account_with_no_postings_is_its_opening_balance', ({ assert }) => {
    const history = accountHistory(
      { openingBalanceCents: 12_345, openingBalanceDate: null },
      [],
      '2027-01',
      2
    )

    assert.deepEqual(history, [
      { month: '2026-11', balanceCents: 12_345 },
      { month: '2026-12', balanceCents: 12_345 },
      { month: '2027-01', balanceCents: 12_345 },
    ])
  })

  test('test_history_without_an_account_is_the_starting_amount_this_month', ({ assert }) => {
    // Contributions to a goal without an account are not recorded, so the
    // only point the app knows is today's.
    assert.deepEqual(startingHistory(80_000, '2026-10'), [
      { month: '2026-10', balanceCents: 80_000 },
    ])
  })
})
