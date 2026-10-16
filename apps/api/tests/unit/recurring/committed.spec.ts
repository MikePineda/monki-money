import { test } from '@japa/runner'
import {
  committedInMonth,
  type CommittedItem,
  type MerchantPayment,
} from '#domain/recurring/committed'

/** Weekly rent of $500, next due on Tuesday 2026-10-20. */
function rent(overrides: Partial<CommittedItem> = {}): CommittedItem {
  return {
    id: 1,
    payee: 'Harbour Lettings',
    merchantKey: 'harbour lettings',
    cadence: 'weekly',
    amountCents: 50_000,
    amountTolerancePct: 15,
    nextExpectedDate: '2026-10-20',
    categoryId: 7,
    ...overrides,
  }
}

function paid(date: string, amountCents = 50_000, merchantKey = 'harbour lettings') {
  return { date, amountCents, merchantKey } satisfies MerchantPayment
}

const OCTOBER = { month: '2026-10', today: '2026-10-16' }

test.group('Recurring: committed this month', () => {
  test('test_weekly_rent_counts_every_due_date_left_in_the_month', ({ assert }) => {
    const committed = committedInMonth([rent()], [paid('2026-10-06'), paid('2026-10-13')], OCTOBER)

    assert.equal(committed.paidCents, 100_000)
    assert.equal(committed.upcomingCents, 100_000)
    assert.deepEqual(committed.items, [
      line({ dueDate: '2026-10-06', paid: true }),
      line({ dueDate: '2026-10-13', paid: true }),
      line({ dueDate: '2026-10-20', paid: false }),
      line({ dueDate: '2026-10-27', paid: false }),
    ])
  })

  test('test_a_due_date_already_past_and_unpaid_is_not_still_due', ({ assert }) => {
    // Nothing imported yet for October: only what falls from today on is still due.
    const committed = committedInMonth([rent()], [], OCTOBER)

    assert.equal(committed.paidCents, 0)
    assert.equal(committed.upcomingCents, 100_000)
    assert.deepEqual(
      committed.items.map((item) => item.dueDate),
      ['2026-10-20', '2026-10-27']
    )
  })

  test('test_a_bill_paid_early_is_not_due_again', ({ assert }) => {
    const phone = rent({
      id: 2,
      payee: 'Telco One',
      merchantKey: 'telco one',
      cadence: 'monthly',
      amountCents: 6_500,
      nextExpectedDate: '2026-10-28',
    })

    const committed = committedInMonth([phone], [paid('2026-10-14', 6_400, 'telco one')], OCTOBER)

    assert.equal(committed.paidCents, 6_400)
    assert.equal(committed.upcomingCents, 0)
    assert.deepEqual(committed.items, [
      {
        id: 2,
        payee: 'Telco One',
        amountCents: 6_400,
        dueDate: '2026-10-14',
        paid: true,
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
    })

    const committed = committedInMonth(
      [phone],
      [paid('2026-10-02', 129_900, 'telco one'), paid('2026-10-03', 6_500, 'other shop')],
      OCTOBER
    )

    assert.equal(committed.paidCents, 0)
    assert.equal(committed.upcomingCents, 6_500)
  })

  test('test_a_past_month_has_nothing_still_due_and_a_future_one_everything', ({ assert }) => {
    const september = committedInMonth([rent()], [paid('2026-09-29')], {
      month: '2026-09',
      today: '2026-10-16',
    })
    assert.deepEqual([september.paidCents, september.upcomingCents], [50_000, 0])

    const november = committedInMonth([rent()], [], { month: '2026-11', today: '2026-10-16' })
    assert.deepEqual(
      november.items.map((item) => item.dueDate),
      ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']
    )
    assert.equal(november.upcomingCents, 200_000)
  })

  test('test_a_quarterly_bill_counts_only_in_its_months', ({ assert }) => {
    const insurance = rent({ cadence: 'quarterly', nextExpectedDate: '2026-11-05' })

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
      nextExpectedDate: '2026-10-20',
    })

    const committed = committedInMonth([gym, rent()], [], OCTOBER)
    assert.deepEqual(
      committed.items.map((item) => `${item.dueDate} ${item.payee}`),
      ['2026-10-20 Harbour Lettings', '2026-10-20 Pulse Gym', '2026-10-27 Harbour Lettings']
    )
    assert.equal(committed.upcomingCents, 102_990)
  })
})

function line(overrides: { dueDate: string; paid: boolean }) {
  return {
    id: 1,
    payee: 'Harbour Lettings',
    amountCents: 50_000,
    categoryId: 7,
    ...overrides,
  }
}
