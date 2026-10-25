import { test } from '@japa/runner'
import type { DetectedItem } from '#domain/recurring/detection'
import { planRedetection, type TrackedItem } from '#domain/recurring/redetection'

const TODAY = '2026-10-16'

function detected(overrides: Partial<DetectedItem> = {}): DetectedItem {
  return {
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
    ...overrides,
  }
}

/** A payment the ledger holds for the rent. */
function seen(date: string, amountCents: number) {
  return { date, amountCents, merchantKey: 'harbour lettings', payeeKey: 'harbour lettings' }
}

/** What the database holds for `detected()` after a first detection. */
function tracked(overrides: Partial<TrackedItem> = {}): TrackedItem {
  const { merchantKey, payee, cadence, amountCents, categoryId, accountId, paidByUserId } =
    detected()
  return {
    id: 1,
    merchantKey,
    payee,
    cadence,
    amountCents,
    amountTolerancePct: 15,
    categoryId,
    accountId,
    paidByUserId,
    lastPaidDate: '2026-10-13',
    nextExpectedDate: '2026-10-20',
    occurrences: 4,
    status: 'active',
    source: 'detected',
    editedFields: [],
    ...overrides,
  }
}

test.group('Recurring: re-detection', () => {
  test('test_a_new_pattern_is_created', ({ assert }) => {
    const plan = planRedetection([], [detected()], TODAY)

    assert.deepEqual(plan, { create: [detected()], update: [] })
  })

  test('test_redetection_of_the_same_ledger_changes_nothing', ({ assert }) => {
    assert.deepEqual(planRedetection([tracked()], [detected()], TODAY), {
      create: [],
      update: [],
    })
  })

  test('test_a_dismissed_item_is_not_recreated', ({ assert }) => {
    const dismissed = tracked({ status: 'dismissed', occurrences: 2, amountCents: 1 })

    const plan = planRedetection(
      [dismissed],
      [detected({ occurrences: 5, lastPaidDate: '2026-10-20' })],
      TODAY
    )

    assert.deepEqual(plan, { create: [], update: [] })
  })

  test('test_new_payments_refresh_a_detected_item', ({ assert }) => {
    const plan = planRedetection(
      [tracked()],
      [
        detected({
          amountCents: 52_000,
          occurrences: 5,
          lastPaidDate: '2026-10-20',
          nextExpectedDate: '2026-10-27',
          categoryId: 8,
        }),
      ],
      '2026-10-21'
    )

    assert.deepEqual(plan.update, [
      {
        id: 1,
        changes: {
          amountCents: 52_000,
          categoryId: 8,
          occurrences: 5,
          lastPaidDate: '2026-10-20',
          nextExpectedDate: '2026-10-27',
        },
      },
    ])
  })

  test('test_redetection_never_overwrites_fields_a_person_edited', ({ assert }) => {
    const edited = tracked({
      payee: 'Rent',
      amountCents: 55_000,
      categoryId: 2,
      paidByUserId: 9,
      editedFields: ['payee', 'amountCents', 'categoryId', 'paidByUserId'],
    })

    const plan = planRedetection(
      [edited],
      [detected({ occurrences: 5, lastPaidDate: '2026-10-20', nextExpectedDate: '2026-10-27' })],
      '2026-10-21'
    )

    assert.deepEqual(plan.update, [
      {
        id: 1,
        changes: { occurrences: 5, lastPaidDate: '2026-10-20', nextExpectedDate: '2026-10-27' },
      },
    ])
  })

  test('test_an_edited_cadence_moves_the_next_date_with_the_persons_cadence', ({ assert }) => {
    const edited = tracked({ cadence: 'fortnightly', editedFields: ['cadence'] })

    const plan = planRedetection(
      [edited],
      [detected({ occurrences: 5, lastPaidDate: '2026-10-20', nextExpectedDate: '2026-10-27' })],
      '2026-10-21'
    )

    assert.deepEqual(plan.update[0].changes, {
      occurrences: 5,
      lastPaidDate: '2026-10-20',
      nextExpectedDate: '2026-11-03',
    })
  })

  test('test_an_edited_next_date_holds_until_a_payment_reaches_it', ({ assert }) => {
    const edited = tracked({ nextExpectedDate: '2026-11-01', editedFields: ['nextExpectedDate'] })

    const before = planRedetection(
      [edited],
      [detected({ occurrences: 5, lastPaidDate: '2026-10-20', nextExpectedDate: '2026-10-27' })],
      '2026-10-21'
    )
    assert.deepEqual(before.update[0].changes, { occurrences: 5, lastPaidDate: '2026-10-20' })

    const after = planRedetection(
      [edited],
      [detected({ occurrences: 6, lastPaidDate: '2026-11-01', nextExpectedDate: '2026-11-08' })],
      '2026-11-02'
    )
    assert.deepEqual(after.update[0].changes, {
      occurrences: 6,
      lastPaidDate: '2026-11-01',
      nextExpectedDate: '2026-11-08',
    })
  })

  test('test_a_manual_item_only_learns_when_it_was_paid', ({ assert }) => {
    const manual = tracked({
      payee: 'Rent',
      amountCents: 49_000,
      cadence: 'weekly',
      categoryId: null,
      lastPaidDate: null,
      nextExpectedDate: '2026-10-20',
      occurrences: 0,
      source: 'manual',
    })

    const plan = planRedetection(
      [manual],
      [detected({ occurrences: 5, lastPaidDate: '2026-10-20', nextExpectedDate: '2026-10-27' })],
      '2026-10-21'
    )

    assert.deepEqual(plan.update[0].changes, {
      occurrences: 5,
      lastPaidDate: '2026-10-20',
      nextExpectedDate: '2026-10-27',
    })
  })

  test('test_a_paused_item_stays_paused_while_its_dates_move', ({ assert }) => {
    // Paused by a person: detection keeps the status they chose.
    const paused = tracked({ status: 'paused', editedFields: ['status'] })

    const plan = planRedetection(
      [paused],
      [detected({ occurrences: 5, lastPaidDate: '2026-10-20', nextExpectedDate: '2026-10-27' })],
      '2026-10-21'
    )

    assert.notProperty(plan.update[0].changes, 'status')
    assert.equal(plan.update[0].changes.nextExpectedDate, '2026-10-27')
  })

  test('test_a_pattern_paid_under_a_hand_typed_payee_lands_on_that_item', ({ assert }) => {
    // Typed "Rent"; the bank calls it a transfer to the agency, the person named it "Rent".
    const manual = tracked({
      merchantKey: 'rent',
      payee: 'Rent',
      source: 'manual',
      lastPaidDate: null,
      occurrences: 0,
    })

    const plan = planRedetection(
      [manual],
      [detected({ merchantKey: 'rent harbour lettings', payeeKeys: ['rent'] })],
      TODAY
    )

    assert.deepEqual(plan.create, [], 'no second item for the same bill')
    assert.deepEqual(plan.update, [
      { id: 1, changes: { occurrences: 4, lastPaidDate: '2026-10-13' } },
    ])
  })

  test('test_a_cancelled_subscription_is_paused_and_resumed_when_paid_again', ({ assert }) => {
    const lapsed = tracked({ lastPaidDate: '2026-07-07', nextExpectedDate: '2026-07-14' })

    // Weekly, last paid in July: two steps and a month of import lag have passed.
    const paused = planRedetection([lapsed], [], TODAY)
    assert.deepEqual(paused.update, [{ id: 1, changes: { status: 'paused' } }])

    const back = planRedetection([{ ...lapsed, status: 'paused' }], [detected()], TODAY)
    assert.equal(back.update[0].changes.status, 'active')
  })

  test('test_a_cancelled_subscription_is_paused_even_after_its_category_was_edited', ({
    assert,
  }) => {
    const edited = tracked({
      lastPaidDate: '2026-07-07',
      nextExpectedDate: '2026-07-14',
      editedFields: ['categoryId'],
    })

    assert.deepEqual(planRedetection([edited], [], TODAY).update, [
      { id: 1, changes: { status: 'paused' } },
    ])
  })

  test('test_detection_never_changes_a_status_a_person_chose_or_a_manual_item', ({ assert }) => {
    const old = { lastPaidDate: '2026-07-07', nextExpectedDate: '2026-07-14' }

    assert.deepEqual(planRedetection([tracked({ ...old, editedFields: ['status'] })], [], TODAY), {
      create: [],
      update: [],
    })
    assert.deepEqual(planRedetection([tracked({ ...old, source: 'manual' })], [], TODAY), {
      create: [],
      update: [],
    })
    const pausedByPerson = tracked({ status: 'paused', editedFields: ['status'] })
    assert.notProperty(
      planRedetection([pausedByPerson], [detected()], TODAY).update[0]?.changes ?? {},
      'status'
    )
  })

  test('test_an_item_still_paid_at_a_new_price_is_not_paused', ({ assert }) => {
    const lapsed = tracked({ lastPaidDate: '2026-07-07', nextExpectedDate: '2026-07-14' })

    const plan = planRedetection([lapsed], [], TODAY, [seen('2026-10-13', 58_000)])

    assert.deepEqual(plan.update, [])
  })

  test('test_two_amounts_at_one_merchant_land_on_their_own_items', ({ assert }) => {
    const phone = {
      merchantKey: 'telco one',
      payeeKeys: ['telco one'],
      cadence: 'monthly' as const,
      nextExpectedDate: '2026-11-13',
    }
    const big = tracked({ id: 1, ...phone, amountCents: 6_500 })
    const small = tracked({ id: 2, ...phone, amountCents: 4_500 })
    const found = [
      detected({ ...phone, amountCents: 4_600, occurrences: 6 }),
      detected({ ...phone, amountCents: 6_500, occurrences: 7 }),
    ]

    const plan = planRedetection([big, small], found, TODAY)

    assert.deepEqual(plan.create, [])
    assert.deepEqual(plan.update, [
      { id: 2, changes: { amountCents: 4_600, occurrences: 6 } },
      { id: 1, changes: { occurrences: 7 } },
    ])
  })

  test('test_a_second_line_at_a_tracked_merchant_becomes_its_own_item', ({ assert }) => {
    const phone = { merchantKey: 'telco one', payeeKeys: ['telco one'] }
    const first = tracked({ ...phone, amountCents: 6_500 })
    const second = detected({ ...phone, amountCents: 4_500 })

    const plan = planRedetection(
      [first],
      [detected({ ...phone, amountCents: 6_500 }), second],
      TODAY
    )

    assert.deepEqual(plan, { create: [second], update: [] })
    // Run again once it exists: nothing to do (no duplicate, no flip-flop).
    const both = [first, tracked({ id: 2, ...phone, amountCents: 4_500 })]
    assert.deepEqual(
      planRedetection(both, [second, detected({ ...phone, amountCents: 6_500 })], TODAY),
      { create: [], update: [] }
    )
  })

  test('test_a_dismissed_line_stays_dismissed_while_the_other_is_found', ({ assert }) => {
    const phone = { merchantKey: 'telco one', payeeKeys: ['telco one'] }
    const dismissed = tracked({ ...phone, amountCents: 4_500, status: 'dismissed' })
    const other = detected({ ...phone, amountCents: 6_500 })

    const plan = planRedetection(
      [dismissed],
      [detected({ ...phone, amountCents: 4_500, occurrences: 9 }), other],
      TODAY
    )

    assert.deepEqual(plan, { create: [other], update: [] })
  })

  test('test_the_only_item_of_a_merchant_follows_its_bill_to_a_new_price', ({ assert }) => {
    // One item, one pattern, 40% dearer: the same bill, not a second one.
    const plan = planRedetection([tracked()], [detected({ amountCents: 70_000 })], TODAY)

    assert.deepEqual(plan, { create: [], update: [{ id: 1, changes: { amountCents: 70_000 } }] })
  })

  test('test_a_pattern_between_two_lines_of_a_merchant_creates_nothing', ({ assert }) => {
    // Neither line's amount: guessing would move one line onto the other.
    const phone = { merchantKey: 'telco one', payeeKeys: ['telco one'] }
    const lines = [
      tracked({ id: 1, ...phone, amountCents: 6_500 }),
      tracked({ id: 2, ...phone, amountCents: 4_500 }),
    ]

    assert.deepEqual(planRedetection(lines, [detected({ ...phone, amountCents: 5_500 })], TODAY), {
      create: [],
      update: [],
    })
  })

  test('test_a_pattern_lands_on_a_typed_item_named_after_its_merchant', ({ assert }) => {
    // Typed "StreamFlix"; the bank prints STREAMFLIX.COM.
    const typed = tracked({
      merchantKey: 'streamflix',
      source: 'manual',
      lastPaidDate: null,
      occurrences: 0,
    })

    const plan = planRedetection(
      [typed],
      [detected({ merchantKey: 'streamflix com', payeeKeys: [] })],
      TODAY
    )

    assert.deepEqual(plan.create, [])
    assert.deepEqual(plan.update, [
      { id: 1, changes: { occurrences: 4, lastPaidDate: '2026-10-13' } },
    ])
  })

  test('test_a_pattern_never_lands_on_a_typed_item_that_only_shares_a_word', ({ assert }) => {
    const typed = tracked({ merchantKey: 'rent', source: 'manual', lastPaidDate: null })
    const found = detected({ merchantKey: 'rentokil pest', payeeKeys: ['rentokil pest'] })

    assert.deepEqual(planRedetection([typed], [found], TODAY).create, [found])
  })

  test('test_a_line_that_stopped_is_paused_while_the_other_is_still_paid', ({ assert }) => {
    const phone = { merchantKey: 'telco one', cadence: 'monthly' as const }
    const old = { lastPaidDate: '2026-06-12', nextExpectedDate: '2026-07-12' }
    const stopped = tracked({ id: 1, ...phone, ...old, amountCents: 4_500 })
    const paid = tracked({ id: 2, ...phone, ...old, amountCents: 6_500 })

    const plan = planRedetection([stopped, paid], [], TODAY, [
      { ...seen('2026-10-12', 6_500), merchantKey: 'telco one', payeeKey: '' },
    ])

    assert.deepEqual(plan.update, [{ id: 1, changes: { status: 'paused' } }])
  })
})
