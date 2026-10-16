import { test } from '@japa/runner'
import { addDays } from '#domain/importing/iso_days'
import { cadenceOf, detectRecurring, type Payment } from '#domain/recurring/detection'

let nextId = 1

/** A synthetic payment: $500 of weekly rent to "harbour lettings" on 2026-10-01. */
function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    transactionId: nextId++,
    date: '2026-10-01',
    amountCents: 50_000,
    merchantKey: 'harbour lettings',
    payee: 'Harbour Lettings',
    categoryId: 7,
    accountId: 1,
    paidByUserId: null,
    ...overrides,
  }
}

/** `count` payments `everyDays` apart, the last one on `last`. */
function series(last: string, everyDays: number, count: number, overrides: Partial<Payment> = {}) {
  return Array.from({ length: count }, (_, index) =>
    payment({ date: addDays(last, -everyDays * (count - 1 - index)), ...overrides })
  )
}

const TODAY = '2026-10-16'

test.group('Recurring: detection', () => {
  test('test_weekly_rent_is_detected_from_four_payments', ({ assert }) => {
    const detected = detectRecurring(series('2026-10-13', 7, 4), { today: TODAY })

    assert.deepEqual(detected, [
      {
        merchantKey: 'harbour lettings',
        payee: 'Harbour Lettings',
        cadence: 'weekly',
        amountCents: 50_000,
        lastPaidDate: '2026-10-13',
        nextExpectedDate: '2026-10-20',
        occurrences: 4,
        categoryId: 7,
        accountId: 1,
        paidByUserId: null,
      },
    ])
  })

  test('test_two_payments_are_not_a_pattern_yet', ({ assert }) => {
    assert.deepEqual(detectRecurring(series('2026-10-13', 7, 2), { today: TODAY }), [])
    assert.lengthOf(detectRecurring(series('2026-10-13', 7, 3), { today: TODAY }), 1)
  })

  test('test_a_merchant_with_irregular_gaps_is_not_recurring', ({ assert }) => {
    const dates = ['2026-08-02', '2026-08-05', '2026-08-22', '2026-08-31', '2026-09-25']
    const payments = dates.map((date) => payment({ date, merchantKey: 'corner grocer' }))

    assert.deepEqual(detectRecurring(payments, { today: TODAY }), [])
    assert.isNull(cadenceOf(dates))
  })

  test('test_amounts_outside_the_tolerance_break_the_pattern', ({ assert }) => {
    const amounts = [20_000, 30_000, 45_000, 20_000]
    const payments = series('2026-10-13', 7, 4).map((entry, index) => ({
      ...entry,
      amountCents: amounts[index],
    }))

    assert.deepEqual(detectRecurring(payments, { today: TODAY }), [])
  })

  test('test_small_price_changes_stay_within_the_tolerance', ({ assert }) => {
    // Within 15% of the median: one item at the median amount.
    const amounts = [1_599, 1_699, 1_599, 1_749]
    const payments = ['2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'].map((date, index) =>
      payment({ date, amountCents: amounts[index], merchantKey: 'streamflix', payee: 'StreamFlix' })
    )

    const [item] = detectRecurring(payments, { today: TODAY })
    assert.include(item, {
      cadence: 'monthly',
      amountCents: 1_649,
      nextExpectedDate: '2026-11-03',
      occurrences: 4,
    })
  })

  test('test_a_price_rise_keeps_the_new_amount_and_ignores_the_old_one', ({ assert }) => {
    const old = ['2026-03-03', '2026-04-03', '2026-05-03'].map((date) =>
      payment({ date, amountCents: 1_099, merchantKey: 'streamflix' })
    )
    const raised = ['2026-06-03', '2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'].map(
      (date) => payment({ date, amountCents: 1_599, merchantKey: 'streamflix' })
    )

    const [item] = detectRecurring([...old, ...raised], { today: TODAY })
    assert.include(item, { amountCents: 1_599, occurrences: 5, lastPaidDate: '2026-10-03' })
  })

  test('test_a_one_off_purchase_at_the_same_merchant_does_not_break_the_pattern', ({ assert }) => {
    const bills = ['2026-07-12', '2026-08-12', '2026-09-12', '2026-10-12'].map((date) =>
      payment({ date, amountCents: 6_500, merchantKey: 'telco one', payee: 'Telco One' })
    )
    const phone = payment({ date: '2026-09-20', amountCents: 129_900, merchantKey: 'telco one' })

    const [item] = detectRecurring([...bills, phone], { today: TODAY })
    assert.include(item, { cadence: 'monthly', amountCents: 6_500, occurrences: 4 })
  })

  test('test_fortnightly_and_monthly_cadences_are_told_apart', ({ assert }) => {
    const gym = series('2026-10-09', 14, 4, { merchantKey: 'pulse gym', amountCents: 2_990 })
    const phone = ['2026-07-28', '2026-08-28', '2026-09-28'].map((date) =>
      payment({ date, merchantKey: 'telco one', amountCents: 6_500 })
    )

    const detected = detectRecurring([...gym, ...phone], { today: TODAY })
    assert.deepEqual(
      detected.map((item) => [item.merchantKey, item.cadence, item.nextExpectedDate]),
      [
        ['pulse gym', 'fortnightly', '2026-10-23'],
        ['telco one', 'monthly', '2026-10-28'],
      ]
    )
  })

  test('test_monthly_payments_shifted_by_a_weekend_still_count', ({ assert }) => {
    // Due on the 15th; paid on the next business day when it falls on a weekend.
    const dates = ['2026-06-15', '2026-07-15', '2026-08-17', '2026-09-15']
    const payments = dates.map((date) => payment({ date, merchantKey: 'city water' }))

    assert.equal(cadenceOf(dates), 'monthly')
    assert.lengthOf(detectRecurring(payments, { today: TODAY }), 1)
  })

  test('test_one_missed_payment_is_tolerated_but_regular_gaps_must_dominate', ({ assert }) => {
    // Five payments, one month skipped: three of four gaps are one step.
    assert.equal(
      cadenceOf(['2026-04-05', '2026-05-05', '2026-07-05', '2026-08-05', '2026-09-05']),
      'monthly'
    )
    // Four payments with one skip: only two of three gaps are one step.
    assert.isNull(cadenceOf(['2026-05-05', '2026-07-05', '2026-08-05', '2026-09-05']))
  })

  test('test_quarterly_payments_are_detected_within_a_year', ({ assert }) => {
    const dates = ['2026-01-20', '2026-04-20', '2026-07-20', '2026-10-14']
    assert.equal(cadenceOf(dates), 'quarterly')

    const [item] = detectRecurring(
      dates.map((date) => payment({ date, merchantKey: 'car insurance' })),
      { today: TODAY }
    )
    assert.include(item, { cadence: 'quarterly', nextExpectedDate: '2027-01-14' })
  })

  test('test_a_pattern_that_stopped_long_ago_is_not_recurring_anymore', ({ assert }) => {
    // Weekly until mid-August: two missed steps plus a month of import lag have passed.
    assert.deepEqual(detectRecurring(series('2026-08-14', 7, 6), { today: TODAY }), [])
    // Last paid a month ago (an import still to come): still recurring.
    assert.lengthOf(detectRecurring(series('2026-09-16', 7, 6), { today: TODAY }), 1)
  })

  test('test_the_latest_payment_names_the_item_and_its_category', ({ assert }) => {
    const payments = series('2026-10-13', 7, 4, { merchantKey: 'harbour lettings' })
    payments[0].categoryId = 3
    payments[3].categoryId = null
    payments[2].categoryId = 9
    payments[3].payee = 'Harbour Lettings Pty'
    payments[3].accountId = 2
    payments[3].paidByUserId = 5

    const [item] = detectRecurring(payments, { today: TODAY })
    assert.include(item, {
      payee: 'Harbour Lettings Pty',
      categoryId: 9,
      accountId: 2,
      paidByUserId: 5,
    })
  })

  test('test_payments_without_a_merchant_key_are_never_grouped', ({ assert }) => {
    assert.deepEqual(
      detectRecurring(series('2026-10-13', 7, 5, { merchantKey: '' }), { today: TODAY }),
      []
    )
  })
})
