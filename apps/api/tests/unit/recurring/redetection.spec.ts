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

  test('test_detection_never_changes_a_status_a_person_chose_or_an_edited_item', ({ assert }) => {
    const old = { lastPaidDate: '2026-07-07', nextExpectedDate: '2026-07-14' }

    assert.deepEqual(
      planRedetection([tracked({ ...old, editedFields: ['amountCents'] })], [], TODAY),
      {
        create: [],
        update: [],
      }
    )
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

    const plan = planRedetection([lapsed], [], TODAY, new Map([['harbour lettings', '2026-10-13']]))

    assert.deepEqual(plan.update, [])
  })
})
