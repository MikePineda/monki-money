import { test } from '@japa/runner'
import { assignMatches } from '#domain/importing/match_assignment'
import { isMatchCandidate, matchRow } from '#domain/importing/matcher'
import { stageRows } from '#domain/importing/staging'
import { NabCsvParser } from '#importers/nab/parser'
import { candidate, nabFixture, stagedRow } from '#tests/helpers/importing'

test.group('Importing / matcher', () => {
  test('test_matcher_auto_matches_exact_amount_same_day_unique_candidate', ({ assert }) => {
    const result = matchRow(stagedRow(), [candidate({ id: 100 })])
    assert.equal(result.resolution, 'auto_matched')
    assert.equal(result.transactionId, 100)
    assert.equal(result.score, 95)
    assert.isFalse(result.upgradesPending)
    assert.deepEqual(result.candidates[0].points, {
      date: 40,
      similarity: 40,
      samePerson: 0,
      unique: 15,
    })
  })

  test('test_matcher_demotes_to_confirmation_when_two_candidates_tie', ({ assert }) => {
    const result = matchRow(stagedRow(), [candidate({ id: 101 }), candidate({ id: 100 })])
    assert.equal(result.resolution, 'needs_confirmation')
    assert.equal(result.transactionId, 100)
    assert.deepEqual(
      result.candidates.map((scored) => [scored.transactionId, scored.score]),
      [
        [100, 80],
        [101, 80],
      ]
    )
  })

  test('test_matcher_never_matches_different_account', ({ assert }) => {
    const result = matchRow(stagedRow({ accountId: 1 }), [candidate({ accountId: 2 })])
    assert.equal(result.resolution, 'new')
    assert.isNull(result.transactionId)
    assert.deepEqual(result.candidates, [])
  })

  test('test_matcher_requires_the_exact_amount', ({ assert }) => {
    for (const amountCents of [-4521, 4520, -4519]) {
      assert.isFalse(isMatchCandidate(stagedRow(), candidate({ amountCents })))
    }
  })

  test('test_candidate_window_is_three_days_before_purchase_to_one_after_posting', ({ assert }) => {
    const row = stagedRow({ date: '2026-09-19', bankDate: '2026-09-21' })
    const eligible = (date: string) => isMatchCandidate(row, candidate({ date }))
    assert.isFalse(eligible('2026-09-15'))
    assert.isTrue(eligible('2026-09-16'))
    assert.isTrue(eligible('2026-09-22'))
    assert.isFalse(eligible('2026-09-23'))
  })

  test('test_candidates_are_manual_entries_or_pending_imports_only', ({ assert }) => {
    const row = stagedRow()
    assert.isTrue(isMatchCandidate(row, candidate({ source: 'receipt' })))
    assert.isTrue(isMatchCandidate(row, candidate({ source: 'telegram' })))
    assert.isTrue(isMatchCandidate(row, candidate({ source: 'import', status: 'pending' })))
    assert.isFalse(isMatchCandidate(row, candidate({ source: 'import', status: 'cleared' })))
  })

  test('test_matcher_scores_date_distance_and_lands_in_tiers', ({ assert }) => {
    const row = stagedRow({ date: '2026-09-19', bankDate: '2026-09-21' })
    const unnamed = { payee: null }
    const score = (date: string) =>
      matchRow(row, [candidate({ ...unnamed, date })]).candidates[0]?.score

    assert.equal(score('2026-09-19'), 55)
    assert.equal(score('2026-09-18'), 45)
    assert.equal(score('2026-09-21'), 55)
    assert.equal(score('2026-09-16'), 30)

    assert.equal(matchRow(row, [candidate({ ...unnamed })]).resolution, 'needs_confirmation')
    const tooWeak = matchRow(row, [candidate({ ...unnamed, date: '2026-09-16' })])
    assert.equal(tooWeak.resolution, 'new')
    assert.isNull(tooWeak.transactionId)
    assert.isNull(tooWeak.score)
    assert.lengthOf(tooWeak.candidates, 1)
  })

  test('test_matcher_adds_points_for_the_same_card_or_person', ({ assert }) => {
    const row = stagedRow({ cardSuffix: '2222', suggestedPaidByUserId: 2 })
    assert.equal(matchRow(row, [candidate({ cardSuffix: '2222' })]).score, 100)
    assert.equal(matchRow(row, [candidate({ paidByUserId: 2 })]).score, 100)
    assert.equal(matchRow(row, [candidate({ paidByUserId: 1 })]).score, 95)
  })

  test('test_matcher_upgrades_pending_import_when_posted_row_arrives', ({ assert }) => {
    // Two exports of the same purchase: pending first, posted (new type, details, date) later.
    const [pending, posted] = stageRows(
      new NabCsvParser().parse(nabFixture('pending-then-posted.csv')),
      {
        accountId: 1,
        today: '2026-10-15',
      }
    )
    assert.isTrue(pending.isPending)
    assert.isFalse(posted.isPending)
    assert.notEqual(pending.externalHash, posted.externalHash)

    const pendingTransaction = candidate({
      id: 42,
      amountCents: pending.amountCents,
      date: pending.date,
      payee: pending.nabMerchant,
      description: pending.descriptionNormalized,
      source: 'import',
      status: 'pending',
    })
    const result = matchRow(posted, [pendingTransaction])
    assert.equal(result.resolution, 'auto_matched')
    assert.equal(result.transactionId, 42)
    assert.isTrue(result.upgradesPending)
  })
})

test.group('Importing / match assignment', () => {
  test('test_identical_rows_never_claim_the_same_manual_entry', ({ assert }) => {
    const twin = stagedRow()
    const results = assignMatches(
      [twin, { ...twin, externalHash: 'hash-2' }],
      [candidate({ id: 100 })]
    )
    assert.deepEqual(
      results.map((result) => [result.resolution, result.transactionId]),
      [
        ['auto_matched', 100],
        ['new', null],
      ]
    )
  })

  test('test_the_best_scoring_row_wins_a_contested_candidate', ({ assert }) => {
    const weak = stagedRow({ nabMerchant: null, descriptionNormalized: 'SOMETHING ELSE' })
    const strong = stagedRow({ externalHash: 'hash-2' })
    const results = assignMatches([weak, strong], [candidate({ id: 100 })])
    assert.equal(results[0].resolution, 'new')
    assert.equal(results[1].resolution, 'auto_matched')
    assert.equal(results[1].transactionId, 100)
  })

  test('test_a_losing_row_falls_back_to_its_next_candidate', ({ assert }) => {
    const rows = [stagedRow(), stagedRow({ externalHash: 'hash-2' })]
    const results = assignMatches(rows, [candidate({ id: 100 }), candidate({ id: 101 })])
    assert.sameMembers(
      results.map((result) => result.transactionId),
      [100, 101]
    )
  })
})
