import { test } from '@japa/runner'
import {
  type ReviewRow,
  confirmActionFor,
  isAutoConfirmable,
  reconcile,
} from '#domain/importing/review'

function reviewRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    resolution: 'new',
    decided: false,
    matchTransactionId: null,
    transferAccountId: null,
    categoryId: 10,
    hasSplits: false,
    ...overrides,
  }
}

test.group('Importing / review', () => {
  test('test_confirm_action_follows_the_resolution', ({ assert }) => {
    assert.equal(confirmActionFor(reviewRow()), 'create')
    assert.equal(
      confirmActionFor(reviewRow({ resolution: 'auto_matched', matchTransactionId: 5 })),
      'match'
    )
    assert.equal(
      confirmActionFor(reviewRow({ resolution: 'transfer_leg', transferAccountId: 2 })),
      'transfer'
    )
    assert.equal(confirmActionFor(reviewRow({ resolution: 'ignored' })), 'ignore')
  })

  test('test_doubtful_rows_need_a_person', ({ assert }) => {
    assert.isNull(confirmActionFor(reviewRow({ resolution: 'needs_confirmation' })))
    assert.isNull(confirmActionFor(reviewRow({ resolution: 'transfer_leg' })))
    assert.isNull(confirmActionFor(reviewRow({ resolution: 'superseded' })))
    assert.isNull(confirmActionFor(reviewRow({ resolution: 'duplicate' })))
  })

  test('test_vanished_match_falls_back_to_create_unless_a_person_chose_it', ({ assert }) => {
    assert.equal(confirmActionFor(reviewRow({ resolution: 'auto_matched' })), 'create')
    assert.isNull(confirmActionFor(reviewRow({ resolution: 'auto_matched', decided: true })))
  })

  test('test_auto_confirm_takes_only_rows_that_need_no_decision', ({ assert }) => {
    assert.isTrue(isAutoConfirmable(reviewRow()))
    assert.isFalse(isAutoConfirmable(reviewRow({ categoryId: null })), 'no category yet')
    assert.isTrue(isAutoConfirmable(reviewRow({ categoryId: null, hasSplits: true })))
    assert.isTrue(
      isAutoConfirmable(reviewRow({ resolution: 'auto_matched', matchTransactionId: 1 }))
    )
    assert.isTrue(
      isAutoConfirmable(reviewRow({ resolution: 'transfer_leg', transferAccountId: 3 }))
    )
    assert.isTrue(isAutoConfirmable(reviewRow({ resolution: 'ignored' })))
    assert.isFalse(isAutoConfirmable(reviewRow({ resolution: 'needs_confirmation' })))
  })

  test('test_reconcile_compares_bank_and_ledger_balances', ({ assert }) => {
    assert.deepEqual(
      reconcile({
        asOf: '2026-09-27',
        dateFrom: '2025-12-22',
        expectedBalanceCents: 723_731,
        computedBalanceCents: 723_731,
        openingBalanceCents: 150_000,
      }),
      {
        asOf: '2026-09-27',
        expectedBalanceCents: 723_731,
        computedBalanceCents: 723_731,
        differenceCents: 0,
        balanced: true,
        openingBalanceCents: 150_000,
        missingBefore: null,
      }
    )

    assert.include(
      reconcile({
        asOf: '2026-10-10',
        dateFrom: '2026-10-10',
        expectedBalanceCents: 700_000,
        computedBalanceCents: 722_731,
        openingBalanceCents: null,
      }),
      { differenceCents: -22_731, balanced: false, missingBefore: '2026-10-10' }
    )

    assert.include(
      reconcile({
        asOf: null,
        dateFrom: null,
        expectedBalanceCents: null,
        computedBalanceCents: 100,
        openingBalanceCents: null,
      }),
      { differenceCents: null, balanced: null, missingBefore: null },
      'an export without balances cannot be reconciled'
    )
  })
})
