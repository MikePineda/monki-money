import { test } from '@japa/runner'
import { defaultPayer } from '#domain/ledger/payer'
import { signedAmount, signedLines } from '#domain/ledger/amounts'

test.group('Ledger: entry rules', () => {
  test('test_expense_is_negative_and_income_positive', ({ assert }) => {
    assert.strictEqual(signedAmount('expense', 1_250), -1_250)
    assert.strictEqual(signedAmount('income', 1_250), 1_250)
    // People type positive amounts; a stray sign never flips the meaning.
    assert.strictEqual(signedAmount('expense', -1_250), -1_250)
    assert.strictEqual(signedAmount('income', -1_250), 1_250)
  })

  test('test_split_lines_follow_the_parent_direction', ({ assert }) => {
    // Typed positive like the parent; a negative line goes the other way.
    assert.deepEqual(signedLines('expense', [700, 300]), [-700, -300])
    assert.deepEqual(signedLines('expense', [1_000, -300]), [-1_000, 300])
    assert.deepEqual(signedLines('income', [700, 300]), [700, 300])
  })

  test('test_default_payer_is_account_owner_then_card_then_creator', ({ assert }) => {
    const cards = [
      { cardSuffix: '1111', userId: 1 },
      { cardSuffix: '2222', userId: 2 },
    ]

    // A personal account: its owner paid.
    assert.equal(
      defaultPayer({ accountOwnerUserId: 2, cards, cardSuffix: '1111', creatorUserId: 1 }),
      2
    )
    // A joint account: the card used tells who paid.
    assert.equal(
      defaultPayer({ accountOwnerUserId: null, cards, cardSuffix: '2222', creatorUserId: 1 }),
      2
    )
    // A joint account without a known card: whoever entered it.
    assert.equal(
      defaultPayer({ accountOwnerUserId: null, cards, cardSuffix: '9999', creatorUserId: 1 }),
      1
    )
    assert.equal(defaultPayer({ accountOwnerUserId: null, cards: [], creatorUserId: 2 }), 2)
    // A card nobody claimed falls through to the creator too.
    assert.equal(
      defaultPayer({
        accountOwnerUserId: null,
        cards: [{ cardSuffix: '3333', userId: null }],
        cardSuffix: '3333',
        creatorUserId: 1,
      }),
      1
    )
  })
})
