import { test } from '@japa/runner'
import { addDays } from '#domain/importing/iso_days'
import { addMonthsKeepingDay } from '#domain/recurring/cadence'
import { cadenceOf, detectRecurring, type Payment } from '#domain/recurring/detection'

let nextId = 1

/** A synthetic payment: $500 of weekly rent to "harbour lettings" on 2026-10-01. */
function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    transactionId: nextId++,
    date: '2026-10-01',
    amountCents: 50_000,
    merchantKey: 'harbour lettings',
    payeeKey: 'harbour lettings',
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
        payeeKeys: ['harbour lettings'],
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
    // Every other month: no run has enough single steps.
    assert.isNull(cadenceOf(['2026-03-05', '2026-05-05', '2026-07-05', '2026-09-05']))
  })

  test('test_the_latest_regular_run_counts_and_older_gaps_do_not', ({ assert }) => {
    // A skipped month long ago: the three latest payments still make a run.
    assert.equal(cadenceOf(['2026-05-05', '2026-07-05', '2026-08-05', '2026-09-05']), 'monthly')
  })

  test('test_a_duplicate_charge_long_ago_does_not_hide_the_subscription', ({ assert }) => {
    const charges = Array.from({ length: 12 }, (_, month) =>
      payment({
        date: addMonthsKeepingDay('2025-11-05', month),
        amountCents: 1_899,
        merchantKey: 'streamflix',
      })
    ).filter((charge) => charge.date <= TODAY)
    const duplicate = payment({ date: '2026-03-06', amountCents: 1_899, merchantKey: 'streamflix' })

    const [item] = detectRecurring([...charges, duplicate], { today: TODAY })
    assert.include(item, { cadence: 'monthly', amountCents: 1_899, lastPaidDate: '2026-10-05' })
    // The run starts after the duplicate: March 6 to October 5.
    assert.equal(item.occurrences, 8)
  })

  test('test_a_pause_months_ago_does_not_hide_the_payments_since', ({ assert }) => {
    const months = [0, 1, 2, 3, 7, 8, 9, 10, 11]
    const payments = months
      .map((month) =>
        payment({
          date: addMonthsKeepingDay('2025-11-05', month),
          amountCents: 1_399,
          merchantKey: 'tunebox',
        })
      )
      .filter((entry) => entry.date <= TODAY)

    const [item] = detectRecurring(payments, { today: TODAY })
    assert.include(item, { cadence: 'monthly', occurrences: 5, nextExpectedDate: '2026-11-05' })
  })

  test('test_payments_of_the_same_day_are_one_payment', ({ assert }) => {
    // Both partners pay their own gym membership on the same day.
    const payments = [0, 7, 14, 21].flatMap((daysBefore) => [
      payment({
        date: addDays('2026-10-14', -daysBefore),
        amountCents: 2_500,
        merchantKey: 'pulse gym',
        paidByUserId: 1,
      }),
      payment({
        date: addDays('2026-10-14', -daysBefore),
        amountCents: 2_500,
        merchantKey: 'pulse gym',
        paidByUserId: 2,
      }),
    ])

    const [item] = detectRecurring(payments, { today: TODAY })
    assert.include(item, { cadence: 'weekly', amountCents: 5_000, occurrences: 4 })
    assert.isNull(item.paidByUserId, 'two people paid: joint')
  })

  test('test_weekly_groceries_of_varying_amounts_are_not_recurring', ({ assert }) => {
    // Every Saturday for a year, between $120 and $200.
    const amounts = [
      123, 188, 151, 197, 134, 166, 142, 181, 129, 159, 193, 138, 172, 147, 185, 121, 163, 199, 136,
      155, 177, 128, 190, 145, 168, 132, 183, 150, 196, 125, 161, 140, 187, 131, 174, 158, 194, 127,
      169, 144, 182, 135, 165, 198, 139, 153, 186, 130, 178, 148, 191, 157,
    ]
    const payments = amounts.map((dollars, week) =>
      payment({
        date: addDays('2026-10-10', -7 * (amounts.length - 1 - week)),
        amountCents: dollars * 100,
        merchantKey: 'corner grocer',
      })
    )

    assert.deepEqual(detectRecurring(payments, { today: TODAY }), [])
  })

  test('test_the_payer_is_who_paid_most_of_the_run_else_joint', ({ assert }) => {
    const alternating = series('2026-10-13', 7, 8).map((entry, index) => ({
      ...entry,
      paidByUserId: index % 2 === 0 ? 1 : 2,
    }))
    assert.isNull(detectRecurring(alternating, { today: TODAY })[0].paidByUserId)

    const mostlyOne = series('2026-10-13', 7, 8).map((entry, index) => ({
      ...entry,
      paidByUserId: index === 3 ? 2 : 1,
    }))
    assert.equal(detectRecurring(mostlyOne, { today: TODAY })[0].paidByUserId, 1)
  })

  test('test_yearly_payments_are_found_in_two_years_of_history', ({ assert }) => {
    const insurance = ['2024-10-01', '2025-10-01', '2026-10-01'].map((date) =>
      payment({ date, amountCents: 120_000, merchantKey: 'car insurance' })
    )

    const [item] = detectRecurring(insurance, { today: TODAY })
    assert.include(item, { cadence: 'yearly', nextExpectedDate: '2027-10-01', occurrences: 3 })
    // Two payments a year apart are not a pattern yet.
    assert.deepEqual(detectRecurring(insurance.slice(1), { today: TODAY }), [])
  })

  test('test_one_bill_off_the_usual_amount_among_four_is_still_steady', ({ assert }) => {
    const quarterly = [
      ['2025-11-20', 48_000],
      ['2026-02-20', 38_000],
      ['2026-05-20', 42_000],
      ['2026-08-20', 40_000],
    ].map(([date, amountCents]) =>
      payment({
        date: date as string,
        amountCents: amountCents as number,
        merchantKey: 'city power',
      })
    )
    assert.include(detectRecurring(quarterly, { today: TODAY })[0], {
      cadence: 'quarterly',
      amountCents: 40_000,
    })

    const monthly = [
      ['2026-06-12', 18_500],
      ['2026-07-12', 15_000],
      ['2026-08-12', 16_000],
      ['2026-09-12', 15_500],
    ].map(([date, amountCents]) =>
      payment({
        date: date as string,
        amountCents: amountCents as number,
        merchantKey: 'city power',
      })
    )
    assert.include(detectRecurring(monthly, { today: TODAY })[0], {
      cadence: 'monthly',
      amountCents: 15_500,
    })
  })

  test('test_a_yearly_bill_paid_months_ago_is_still_found', ({ assert }) => {
    // Paid every September 1: on October 16 the oldest payment is two years and six weeks old.
    const insurance = ['2024-09-01', '2025-09-01', '2026-09-01'].map((date) =>
      payment({ date, amountCents: 90_000, merchantKey: 'home insurance' })
    )

    assert.include(detectRecurring(insurance, { today: TODAY })[0], {
      cadence: 'yearly',
      nextExpectedDate: '2027-09-01',
    })
  })

  test('test_the_payee_keys_of_its_payments_come_with_the_item', ({ assert }) => {
    const payments = series('2026-10-13', 7, 4, { merchantKey: 'rent harbour lettings' }).map(
      (entry, index) => ({ ...entry, payeeKey: index === 0 ? '' : 'rent' })
    )

    assert.deepEqual(detectRecurring(payments, { today: TODAY })[0].payeeKeys, ['rent'])
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

    const [item] = detectRecurring(payments, { today: TODAY })
    assert.include(item, {
      payee: 'Harbour Lettings Pty',
      categoryId: 9,
      accountId: 2,
      paidByUserId: null,
    })
  })

  test('test_payments_without_a_merchant_key_are_never_grouped', ({ assert }) => {
    assert.deepEqual(
      detectRecurring(series('2026-10-13', 7, 5, { merchantKey: '' }), { today: TODAY }),
      []
    )
  })
})
