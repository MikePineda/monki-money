import { test } from '@japa/runner'
import { validateSplits } from '#domain/ledger/splits'
import { accountBalance, balanceAt, runningBalance } from '#domain/ledger/balances'

test.group('Ledger: splits', () => {
  test('test_split_amounts_must_equal_parent_amount', ({ assert }) => {
    assert.deepEqual(
      validateSplits(-1000, [
        { categoryId: 1, amountCents: -600 },
        { categoryId: 2, amountCents: -400 },
      ]),
      { valid: true }
    )

    assert.deepEqual(
      validateSplits(-1000, [
        { categoryId: 1, amountCents: -600 },
        { categoryId: 2, amountCents: -300 },
      ]),
      { valid: false, problem: 'sumMismatch', differenceCents: -100 }
    )
  })

  test('test_split_needs_two_non_zero_lines', ({ assert }) => {
    assert.deepEqual(validateSplits(-1000, [{ categoryId: 1, amountCents: -1000 }]), {
      valid: false,
      problem: 'tooFewLines',
      differenceCents: 0,
    })
    assert.deepEqual(
      validateSplits(-1000, [
        { categoryId: 1, amountCents: -1000 },
        { categoryId: 2, amountCents: 0 },
      ]),
      { valid: false, problem: 'zeroLine', differenceCents: 0 }
    )
  })

  test('test_split_lines_may_mix_signs_when_the_sum_matches', ({ assert }) => {
    // A purchase with a returned item on the same receipt.
    assert.deepEqual(
      validateSplits(-700, [
        { categoryId: 1, amountCents: -1000 },
        { categoryId: 2, amountCents: 300 },
      ]),
      { valid: true }
    )
  })
})

test.group('Ledger: balances', () => {
  test('test_pending_is_included_in_available_but_not_cleared_balance', ({ assert }) => {
    const balance = accountBalance(10_000, [
      { amountCents: -2_500, status: 'cleared' },
      { amountCents: -1_000, status: 'pending' },
      { amountCents: 500, status: 'cleared' },
    ])

    assert.deepEqual(balance, { clearedBalanceCents: 8_000, availableBalanceCents: 7_000 })
  })

  test('test_running_balance_starts_from_opening_balance', ({ assert }) => {
    const rows = runningBalance(5_000, [
      { id: 3, date: '2026-10-02', amountCents: -1_000 },
      { id: 1, date: '2026-10-01', amountCents: 2_000 },
      { id: 2, date: '2026-10-02', amountCents: -500 },
    ])

    assert.deepEqual(
      rows.map((row) => [row.id, row.balanceCents]),
      [
        [1, 7_000],
        [2, 6_500],
        [3, 5_500],
      ]
    )
    assert.deepEqual(runningBalance(5_000, []), [])
  })

  test('test_balance_at_counts_entries_up_to_the_date_inclusive', ({ assert }) => {
    const entries = [
      { date: '2026-09-30', amountCents: -100 },
      { date: '2026-10-01', amountCents: -200 },
      { date: '2026-10-02', amountCents: -400 },
    ]

    assert.equal(balanceAt(1_000, entries, '2026-09-29'), 1_000)
    assert.equal(balanceAt(1_000, entries, '2026-10-01'), 700)
    assert.equal(balanceAt(1_000, entries, '2026-12-31'), 300)
  })

  test('test_transfer_legs_sum_to_zero_across_accounts', ({ assert }) => {
    const everyday = accountBalance(10_000, [{ amountCents: -3_000, status: 'cleared' }])
    const savings = accountBalance(0, [{ amountCents: 3_000, status: 'cleared' }])

    assert.equal(everyday.clearedBalanceCents, 7_000)
    assert.equal(savings.clearedBalanceCents, 3_000)
    // Moving money between own accounts never changes the household's total.
    assert.equal(everyday.clearedBalanceCents + savings.clearedBalanceCents, 10_000)
  })
})
