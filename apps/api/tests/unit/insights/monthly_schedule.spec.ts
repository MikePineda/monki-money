import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import type { Posting } from '#domain/ledger/posting'
import {
  decideMonthlyInsight,
  insightPeriodKey,
  isMonthlyInsightDue,
  type MonthlyInsightFacts,
} from '#domain/insights/monthly_schedule'

const BRISBANE = 'Australia/Brisbane'
const LONDON = 'Europe/London'

function at(iso: string) {
  return DateTime.fromISO(iso, { setZone: true })
}

function posting(overrides: Partial<Posting> = {}): Posting {
  return {
    transactionId: 1,
    splitId: null,
    transferId: null,
    accountId: 1,
    accountKind: 'transaction',
    date: '2026-09-03',
    amountCents: -8_000,
    kind: 'expense',
    status: 'cleared',
    categoryId: null,
    groupId: null,
    groupKind: null,
    paidByUserId: null,
    createdByUserId: null,
    isPrivate: false,
    tags: [],
    hidden: false,
    ...overrides,
  }
}

function facts(overrides: Partial<MonthlyInsightFacts> = {}): MonthlyInsightFacts {
  return {
    status: 'active',
    month: '2026-09',
    zone: BRISBANE,
    postings: [posting()],
    storedAt: null,
    force: false,
    llmAvailable: true,
    ...overrides,
  }
}

const GENERATE = { generate: true, replace: false }

test.group('Insights: monthly schedule', () => {
  test('test_the_monthly_job_is_due_from_eight_on_the_first_through_the_end_of_the_fourth', ({
    assert,
  }) => {
    assert.isFalse(isMonthlyInsightDue(at('2026-10-01T07:59:59+10:00'), BRISBANE))
    assert.isTrue(isMonthlyInsightDue(at('2026-10-01T08:00:00+10:00'), BRISBANE))
    assert.isTrue(isMonthlyInsightDue(at('2026-10-01T23:59:00+10:00'), BRISBANE))
    // A 1st with the app down all day is caught up through the 4th, at any hour.
    assert.isTrue(isMonthlyInsightDue(at('2026-10-02T00:00:00+10:00'), BRISBANE))
    assert.isTrue(isMonthlyInsightDue(at('2026-10-02T06:30:00+10:00'), BRISBANE))
    assert.isTrue(isMonthlyInsightDue(at('2026-10-04T23:59:59+10:00'), BRISBANE))
    // The last days of a month and the 5th onwards are never due.
    assert.isFalse(isMonthlyInsightDue(at('2026-09-30T12:00:00+10:00'), BRISBANE))
    assert.isFalse(isMonthlyInsightDue(at('2026-10-05T00:00:00+10:00'), BRISBANE))
    assert.isFalse(isMonthlyInsightDue(at('2026-10-20T09:00:00+10:00'), BRISBANE))

    // The instant is read in the household's zone, not in the server's (UTC).
    const brisbaneBreakfast = at('2026-09-30T22:30:00Z')
    assert.isTrue(isMonthlyInsightDue(brisbaneBreakfast, BRISBANE))
    assert.isFalse(isMonthlyInsightDue(brisbaneBreakfast, LONDON), 'still 30 September in London')
    assert.isTrue(isMonthlyInsightDue(at('2026-10-01T07:15:00Z'), LONDON), '08:15 BST')
    const brisbaneFifth = at('2026-10-04T14:30:00Z')
    assert.isFalse(isMonthlyInsightDue(brisbaneFifth, BRISBANE), 'already the 5th in Brisbane')
    assert.isTrue(isMonthlyInsightDue(brisbaneFifth, LONDON), 'still the 4th in London')
  })

  test('test_every_day_of_the_window_summarises_the_month_that_ended', ({ assert }) => {
    for (const iso of ['2026-10-01T08:00:00+10:00', '2026-10-04T23:59:00+10:00']) {
      assert.equal(insightPeriodKey(at(iso), BRISBANE), '2026-09', iso)
    }
  })

  test('test_the_period_key_is_the_month_being_summarised', ({ assert }) => {
    assert.equal(insightPeriodKey(at('2026-10-01T08:00:00+10:00'), BRISBANE), '2026-09')
    assert.equal(insightPeriodKey(at('2026-10-15T09:00:00+10:00'), BRISBANE), '2026-09')
    assert.equal(insightPeriodKey(at('2026-01-01T08:30:00+10:00'), BRISBANE), '2025-12')

    const instant = at('2026-09-30T22:30:00Z')
    assert.equal(insightPeriodKey(instant, BRISBANE), '2026-09')
    assert.equal(insightPeriodKey(instant, LONDON), '2026-08')
  })

  test('test_a_household_without_activity_in_the_month_is_skipped', ({ assert }) => {
    const transfersOnly = [
      posting({ kind: 'transfer', amountCents: -100_000 }),
      posting({ kind: 'transfer', amountCents: 100_000 }),
    ]
    const otherMonths = [posting({ date: '2026-08-31' }), posting({ date: '2026-10-01' })]

    for (const postings of [[], transfersOnly, otherMonths]) {
      assert.deepEqual(decideMonthlyInsight(facts({ postings })), {
        generate: false,
        reason: 'no-activity',
      })
    }
    assert.deepEqual(
      decideMonthlyInsight(facts({ postings: [...transfersOnly, posting()] })),
      GENERATE
    )
    // Income counts as activity too.
    assert.deepEqual(
      decideMonthlyInsight(
        facts({ postings: [posting({ kind: 'income', amountCents: 500_000 })] })
      ),
      GENERATE
    )
  })

  test('test_a_household_pending_deletion_or_suspended_is_skipped_before_anything_else', ({
    assert,
  }) => {
    assert.deepEqual(decideMonthlyInsight(facts({ status: 'pending_deletion', force: true })), {
      generate: false,
      reason: 'pending-deletion',
    })
    assert.deepEqual(decideMonthlyInsight(facts({ status: 'suspended', postings: [] })), {
      generate: false,
      reason: 'suspended',
    })
  })

  test('test_a_summary_written_after_the_month_ended_is_kept_unless_forced', ({ assert }) => {
    // Midnight on 1 October in Brisbane is the first instant after September.
    for (const storedAt of [
      at('2026-10-01T00:00:00+10:00'),
      at('2026-10-01T07:00:00+10:00'),
      at('2026-10-02T09:00:00+10:00'),
    ]) {
      assert.deepEqual(decideMonthlyInsight(facts({ storedAt })), {
        generate: false,
        reason: 'already-generated',
      })
      assert.deepEqual(decideMonthlyInsight(facts({ storedAt, force: true })), {
        generate: true,
        replace: true,
      })
    }
  })

  test('test_a_summary_written_before_the_month_ended_is_replaced', ({ assert }) => {
    // Tapped on the 20th: it only covers 1-20 September.
    for (const storedAt of [
      at('2026-09-20T10:00:00+10:00'),
      // 23:30 on 30 September in Brisbane, already 1 October in UTC.
      at('2026-09-30T23:30:00+10:00'),
    ]) {
      assert.deepEqual(decideMonthlyInsight(facts({ storedAt })), {
        generate: true,
        replace: true,
      })
    }
    // Same instant, read in a zone where September was already over.
    assert.deepEqual(
      decideMonthlyInsight(
        facts({ storedAt: at('2026-09-30T23:30:00+10:00'), zone: 'Pacific/Auckland' })
      ),
      { generate: false, reason: 'already-generated' }
    )
  })

  test('test_without_a_live_model_the_household_is_skipped', ({ assert }) => {
    assert.deepEqual(decideMonthlyInsight(facts({ llmAvailable: false })), {
      generate: false,
      reason: 'llm-unavailable',
    })
  })
})
