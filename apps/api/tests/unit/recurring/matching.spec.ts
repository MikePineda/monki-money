import { test } from '@japa/runner'
import { itemOfPayment, type MatchedItem } from '#domain/recurring/matching'

function item(overrides: Partial<MatchedItem> = {}): MatchedItem {
  return {
    id: 1,
    merchantKey: 'telco one',
    amountCents: 6_500,
    amountTolerancePct: 15,
    ...overrides,
  }
}

test.group('Recurring: which item a payment pays', () => {
  test('test_two_amounts_at_one_merchant_pay_their_own_items', ({ assert }) => {
    const items = [item({ id: 1, amountCents: 6_500 }), item({ id: 2, amountCents: 4_500 })]

    assert.equal(itemOfPayment({ merchantKey: 'telco one', amountCents: 6_500 }, items)?.id, 1)
    assert.equal(itemOfPayment({ merchantKey: 'telco one', amountCents: 4_600 }, items)?.id, 2)
    // Within the tolerance of neither line.
    assert.isUndefined(itemOfPayment({ merchantKey: 'telco one', amountCents: 12_000 }, items))
  })

  test('test_the_closest_amount_wins_when_two_tolerances_overlap', ({ assert }) => {
    const items = [item({ id: 1, amountCents: 5_000 }), item({ id: 2, amountCents: 5_600 })]

    assert.equal(itemOfPayment({ merchantKey: 'telco one', amountCents: 5_400 }, items)?.id, 2)
    assert.equal(itemOfPayment({ merchantKey: 'telco one', amountCents: 5_200 }, items)?.id, 1)
  })

  test('test_the_bank_key_wins_over_the_payee_key_and_the_loose_key', ({ assert }) => {
    const items = [
      item({ id: 1, merchantKey: 'streamflix' }),
      item({ id: 2, merchantKey: 'rent' }),
      item({ id: 3, merchantKey: 'streamflix com' }),
    ]

    const payment = { merchantKey: 'streamflix com', payeeKey: 'rent', amountCents: 6_500 }
    assert.equal(itemOfPayment(payment, items)?.id, 3)
    assert.equal(itemOfPayment(payment, items.slice(0, 2))?.id, 2, 'then the payee key')
    assert.equal(itemOfPayment(payment, items.slice(0, 1))?.id, 1, 'then the loose key')
  })

  test('test_a_typed_name_pays_the_bank_rows_of_that_merchant', ({ assert }) => {
    const typed = [item({ merchantKey: 'streamflix', amountCents: 1_899 })]

    const bankRow = { merchantKey: 'streamflix com au', payeeKey: '', amountCents: 1_899 }
    assert.equal(itemOfPayment(bankRow, typed)?.id, 1)
  })

  test('test_a_name_that_only_shares_a_word_pays_nothing', ({ assert }) => {
    const typed = [item({ merchantKey: 'rent', amountCents: 50_000 })]

    for (const merchantKey of ['rentokil pest', 'rent harbour lettings', 'car rental']) {
      assert.isUndefined(
        itemOfPayment({ merchantKey, payeeKey: merchantKey, amountCents: 50_000 }, typed),
        merchantKey
      )
    }
  })
})
