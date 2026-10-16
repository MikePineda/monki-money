import { test } from '@japa/runner'
import {
  committedInMonth,
  type CommittedItem,
  type MerchantPayment,
} from '#domain/recurring/committed'

/** Weekly rent of $500, last paid on 2026-10-13 (a Tuesday), next due on 2026-10-20. */
function rent(overrides: Partial<CommittedItem> = {}): CommittedItem {
  return {
    id: 1,
    payee: 'Harbour Lettings',
    merchantKey: 'harbour lettings',
    cadence: 'weekly',
    amountCents: 50_000,
    amountTolerancePct: 15,
    nextExpectedDate: '2026-10-20',
    lastPaidDate: '2026-10-13',
    categoryId: 7,
    ...overrides,
  }
}

function paid(date: string, amountCents = 50_000, merchantKey = 'harbour lettings') {
  return { date, amountCents, merchantKey } satisfies MerchantPayment
}

const OCTOBER = { month: '2026-10', today: '2026-10-16' }

function line(dueDate: string, paidLine: boolean, overdue = false) {
  return {
    id: 1,
    payee: 'Harbour Lettings',
    amountCents: 50_000,
    dueDate,
    paid: paidLine,
    overdue,
    categoryId: 7,
  }
}

/** "2026-10-06 P" (paid), "2026-10-13 O" (overdue) or "2026-10-20 D" (still due). */
function marks(committed: ReturnType<typeof committedInMonth>) {
  return committed.items.map(
    (item) => `${item.dueDate} ${item.paid ? 'P' : item.overdue ? 'O' : 'D'}`
  )
}

test.group('Recurring: committed this month', () => {
  test('test_weekly_rent_counts_every_due_date_left_in_the_month', ({ assert }) => {
    const committed = committedInMonth([rent()], [paid('2026-10-06'), paid('2026-10-13')], OCTOBER)

    assert.equal(committed.paidCents, 100_000)
    assert.equal(committed.upcomingCents, 100_000)
    assert.deepEqual(committed.items, [
      line('2026-10-06', true),
      line('2026-10-13', true),
      line('2026-10-20', false),
      line('2026-10-27', false),
    ])
  })

  test('test_a_past_due_date_nobody_paid_is_overdue_and_still_due', ({ assert }) => {
    // Mid-October with only September's bank export imported: October's
    // first rents are in neither the spending nor the "still due".
    const committed = committedInMonth([rent({ lastPaidDate: '2026-09-29' })], [], OCTOBER)

    assert.equal(committed.paidCents, 0)
    assert.equal(committed.upcomingCents, 200_000)
    assert.deepEqual(committed.items, [
      line('2026-10-06', false, true),
      line('2026-10-13', false, true),
      line('2026-10-20', false),
      line('2026-10-27', false),
    ])
  })

  test('test_a_late_payment_for_last_month_never_pays_this_months_due_date', ({ assert }) => {
    // September 29's rent paid on October 1, then October 6 and 13 on time.
    const weekly = committedInMonth(
      [rent()],
      [paid('2026-10-01'), paid('2026-10-06'), paid('2026-10-13')],
      OCTOBER
    )
    assert.deepEqual(marks(weekly), [
      '2026-10-01 P',
      '2026-10-06 P',
      '2026-10-13 P',
      '2026-10-20 D',
      '2026-10-27 D',
    ])
    assert.deepEqual([weekly.paidCents, weekly.upcomingCents], [150_000, 100_000])

    // A bill due on the 30th: September's paid on October 2 leaves October 30 due.
    const phone = rent({
      merchantKey: 'telco one',
      cadence: 'monthly',
      amountCents: 6_500,
      nextExpectedDate: '2026-10-30',
      lastPaidDate: '2026-09-30',
    })
    const monthly = committedInMonth([phone], [paid('2026-10-02', 6_500, 'telco one')], OCTOBER)
    assert.deepEqual(marks(monthly), ['2026-10-02 P', '2026-10-30 D'])
    assert.equal(monthly.upcomingCents, 6_500)
  })

  test('test_a_payment_a_few_days_off_still_pays_its_due_date', ({ assert }) => {
    // Rent two days late; a monthly bill two weeks early.
    const late = committedInMonth([rent()], [paid('2026-10-08'), paid('2026-10-13')], OCTOBER)
    assert.deepEqual(marks(late), ['2026-10-08 P', '2026-10-13 P', '2026-10-20 D', '2026-10-27 D'])

    const phone = rent({
      id: 2,
      payee: 'Telco One',
      merchantKey: 'telco one',
      cadence: 'monthly',
      amountCents: 6_500,
      nextExpectedDate: '2026-10-28',
      lastPaidDate: '2026-09-28',
    })
    const early = committedInMonth([phone], [paid('2026-10-14', 6_400, 'telco one')], OCTOBER)
    assert.deepEqual([early.paidCents, early.upcomingCents], [6_400, 0])
    assert.deepEqual(early.items, [
      {
        id: 2,
        payee: 'Telco One',
        amountCents: 6_400,
        dueDate: '2026-10-14',
        paid: true,
        overdue: false,
        categoryId: 7,
      },
    ])
  })

  test('test_a_payment_outside_the_tolerance_does_not_count_as_paid', ({ assert }) => {
    // A $1,299 handset at the phone company is not the $65 bill.
    const phone = rent({
      merchantKey: 'telco one',
      cadence: 'monthly',
      amountCents: 6_500,
      nextExpectedDate: '2026-10-28',
      lastPaidDate: '2026-09-28',
    })

    const committed = committedInMonth(
      [phone],
      [paid('2026-10-02', 129_900, 'telco one'), paid('2026-10-03', 6_500, 'other shop')],
      OCTOBER
    )

    assert.equal(committed.paidCents, 0)
    assert.equal(committed.upcomingCents, 6_500)
  })

  test('test_a_payment_matches_by_its_payee_key_too', ({ assert }) => {
    // Typed by hand as "Rent"; the bank row is a transfer the person named "Rent".
    const typed = rent({ merchantKey: 'rent', lastPaidDate: null, nextExpectedDate: '2026-10-06' })
    const transfer = { ...paid('2026-10-06', 50_000, 'rent harbour lettings'), payeeKey: 'rent' }

    const committed = committedInMonth([typed], [transfer], OCTOBER)

    assert.deepEqual(marks(committed), [
      '2026-10-06 P',
      '2026-10-13 O',
      '2026-10-20 D',
      '2026-10-27 D',
    ])
  })

  test('test_nothing_is_due_before_an_item_typed_by_hand_starts', ({ assert }) => {
    const gym = rent({
      merchantKey: 'pulse gym',
      cadence: 'monthly',
      amountCents: 9_000,
      nextExpectedDate: '2026-12-01',
      lastPaidDate: null,
    })

    assert.deepEqual(
      committedInMonth([gym], [], { month: '2026-11', today: OCTOBER.today }).items,
      []
    )
    assert.equal(
      committedInMonth([gym], [], { month: '2026-12', today: OCTOBER.today }).upcomingCents,
      9_000
    )
  })

  test('test_a_bill_due_on_the_31st_keeps_its_day_after_a_short_month', ({ assert }) => {
    // Paid on August 31; its next date was clamped to September 30.
    const rent31 = rent({
      cadence: 'monthly',
      amountCents: 200_000,
      nextExpectedDate: '2026-09-30',
      lastPaidDate: '2026-08-31',
    })

    const committed = committedInMonth([rent31], [], { month: '2026-10', today: '2026-10-31' })

    assert.deepEqual(marks(committed), ['2026-10-31 D'])
  })

  test('test_a_past_month_has_nothing_still_due_and_a_future_one_everything', ({ assert }) => {
    const september = committedInMonth([rent()], [paid('2026-09-29')], {
      month: '2026-09',
      today: '2026-10-16',
    })
    assert.deepEqual([september.paidCents, september.upcomingCents], [50_000, 0])

    const november = committedInMonth([rent()], [], { month: '2026-11', today: '2026-10-16' })
    assert.deepEqual(marks(november), [
      '2026-11-03 D',
      '2026-11-10 D',
      '2026-11-17 D',
      '2026-11-24 D',
    ])
    assert.equal(november.upcomingCents, 200_000)
  })

  test('test_a_quarterly_bill_counts_only_in_its_months', ({ assert }) => {
    const insurance = rent({
      cadence: 'quarterly',
      nextExpectedDate: '2026-11-05',
      lastPaidDate: '2026-08-05',
    })

    assert.equal(committedInMonth([insurance], [], OCTOBER).upcomingCents, 0)
    assert.equal(
      committedInMonth([insurance], [], { month: '2026-11', today: '2026-10-16' }).upcomingCents,
      50_000
    )
  })

  test('test_lines_are_by_due_date_then_payee', ({ assert }) => {
    const gym = rent({
      id: 3,
      payee: 'Pulse Gym',
      merchantKey: 'pulse gym',
      cadence: 'fortnightly',
      amountCents: 2_990,
      nextExpectedDate: '2026-11-03',
    })

    const committed = committedInMonth([gym, rent()], [], {
      month: '2026-11',
      today: '2026-10-16',
    })
    assert.deepEqual(
      committed.items.map((item) => `${item.dueDate} ${item.payee}`),
      [
        '2026-11-03 Harbour Lettings',
        '2026-11-03 Pulse Gym',
        '2026-11-10 Harbour Lettings',
        '2026-11-17 Harbour Lettings',
        '2026-11-17 Pulse Gym',
        '2026-11-24 Harbour Lettings',
      ]
    )
  })
})
