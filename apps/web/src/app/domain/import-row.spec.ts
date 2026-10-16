import {
  acceptChange,
  allowedActions,
  applyDecision,
  assignCategoryChanges,
  blockingRowIds,
  bulkAcceptSuggested,
  classifiableRows,
  decisionsFor,
  filterRows,
  ignoreChanges,
  isGuessedTransfer,
  reconciliationMessage,
  restoreChange,
  restoreChanges,
  rowState,
  rowTitle,
  summary,
  toneOf,
  undoChanges,
  type ReviewableRow,
} from './import-row'

/** A staged bank row as `GET /imports/:id` sends it (synthetic). */
function aRow(overrides: Partial<ReviewableRow> = {}): ReviewableRow {
  return {
    id: 1,
    date: '2026-09-27',
    bankDate: '2026-09-29',
    amountCents: -2800,
    description: 'V1111 27/09 SAMPLE FEST SYDNEY',
    nabMerchant: null,
    isMasked: false,
    isPending: false,
    resolution: 'new',
    // Untouched rows: the resolution is the importer's proposal.
    proposedResolution: overrides.resolution ?? 'new',
    reasons: [],
    match: null,
    suggestion: null,
    transfer: null,
    suggestedPaidByUserId: null,
    decision: null,
    decidedAt: null,
    confirmedAt: null,
    ...overrides,
  }
}

const trusted = (categoryId: number, source: 'rule' | 'nab_map' | 'llm' = 'nab_map') => ({
  source,
  categoryId,
  confidence: source === 'llm' ? 0.92 : null,
  needsReview: false,
  ruleId: null,
  payee: null,
})

const tentative = (categoryId: number, confidence = 0.55) => ({
  source: 'llm' as const,
  categoryId,
  confidence,
  needsReview: true,
  ruleId: null,
  payee: null,
})

/**
 * A transfer leg whose other account (3) the importer guessed because it is
 * the only one it could be (API `TransferStep`, PR #7).
 */
const aGuessedTransfer = (overrides: Partial<ReviewableRow> = {}) =>
  aRow({
    resolution: 'transfer_leg',
    reasons: ['transfer_destination_guessed'],
    transfer: { signal: 'linked_account_memo', accountId: 3, legTransactionId: null, ruleId: null },
    ...overrides,
  })

const aRuleTransfer = (overrides: Partial<ReviewableRow> = {}) =>
  aRow({
    resolution: 'transfer_leg',
    transfer: { signal: 'rule', accountId: 3, legTransactionId: null, ruleId: 1 },
    ...overrides,
  })

const aMatch = (transactionId = 900) => ({
  transactionId,
  score: 65,
  upgradesPending: false,
  transaction: {
    date: '2026-09-27',
    amountCents: -2800,
    payee: 'Sample Fest',
    source: 'manual',
    status: 'cleared',
  },
})

describe('import row tones', () => {
  it('test_a_new_row_with_a_trusted_suggestion_is_auto', () => {
    expect(toneOf(aRow({ suggestion: trusted(20) }))).toBe('auto')
  })

  it('test_a_new_row_with_a_suggestion_under_review_is_doubtful', () => {
    expect(toneOf(aRow({ suggestion: tentative(20) }))).toBe('doubtful')
  })

  it('test_a_new_row_without_a_category_is_new', () => {
    expect(toneOf(aRow())).toBe('new')
    expect(toneOf(aRow({ suggestion: { ...trusted(20), source: 'none', categoryId: null } }))).toBe(
      'new'
    )
  })

  it('test_a_possible_match_or_an_unknown_transfer_is_doubtful', () => {
    expect(toneOf(aRow({ resolution: 'needs_confirmation', match: aMatch() }))).toBe('doubtful')
    expect(toneOf(aRow({ resolution: 'needs_confirmation' }))).toBe('doubtful')
  })

  it('test_matches_are_auto_and_transfer_legs_are_transfers', () => {
    expect(toneOf(aRow({ resolution: 'auto_matched', match: aMatch() }))).toBe('auto')
    expect(toneOf(aRow({ resolution: 'transfer_leg' }))).toBe('transfer')
  })

  it('test_ignored_superseded_and_duplicate_rows_are_muted', () => {
    expect(toneOf(aRow({ resolution: 'ignored' }))).toBe('ignored')
    expect(toneOf(aRow({ resolution: 'superseded' }))).toBe('ignored')
    expect(toneOf(aRow({ resolution: 'duplicate' }))).toBe('duplicate')
  })

  it('test_a_category_a_person_picked_settles_a_doubtful_row', () => {
    const row = aRow({ suggestion: tentative(20), decision: { categoryId: 21 }, decidedAt: 'x' })

    expect(toneOf(row)).toBe('auto')
    expect(rowState(row)).toMatchObject({ decided: true, categoryId: 21, categorySource: 'person' })
  })

  it('test_confirmed_rows_are_shown_as_done_not_as_doubtful', () => {
    const confirmedAt = '2026-10-15T00:00:00.000Z'

    expect(toneOf(aRow({ suggestion: tentative(20), confirmedAt }))).toBe('auto')
    expect(toneOf(aRow({ confirmedAt }))).toBe('auto')
    expect(toneOf(aRow({ resolution: 'needs_confirmation', match: aMatch(), confirmedAt }))).toBe(
      'auto'
    )
    expect(toneOf(aRow({ resolution: 'auto_matched', match: aMatch(), confirmedAt }))).toBe('auto')
  })

  it('test_a_confirmed_row_keeps_the_tone_of_what_happened_to_it', () => {
    const confirmedAt = '2026-10-15T00:00:00.000Z'

    expect(toneOf(aRow({ resolution: 'transfer_leg', confirmedAt }))).toBe('transfer')
    expect(toneOf(aRow({ resolution: 'ignored', confirmedAt }))).toBe('ignored')
    expect(toneOf(aRow({ resolution: 'superseded', confirmedAt }))).toBe('ignored')
    expect(toneOf(aRow({ resolution: 'duplicate', confirmedAt }))).toBe('duplicate')
  })

  it('test_split_lines_settle_a_row_without_a_category', () => {
    const row = aRow({
      decision: {
        splits: [
          { categoryId: 20, amountCents: 1500 },
          { categoryId: 21, amountCents: 1000 },
        ],
      },
      decidedAt: 'x',
    })

    expect(toneOf(row)).toBe('auto')
    expect(rowState(row).splitCount).toBe(2)
  })
})

describe('import row state', () => {
  it('test_the_shown_category_comes_from_the_suggestion_with_its_source_and_confidence', () => {
    expect(rowState(aRow({ suggestion: tentative(20, 0.61) }))).toMatchObject({
      categoryId: 20,
      categorySource: 'llm',
      confidence: 0.61,
    })
  })

  it('test_the_decision_overrides_payer_transfer_and_match_like_the_api_does', () => {
    const row = aRow({
      resolution: 'transfer_leg',
      transfer: { signal: 'bank_category', accountId: 3, legTransactionId: null, ruleId: null },
      suggestedPaidByUserId: 1,
      decision: { transferAccountId: 4, paidByUserId: null },
      decidedAt: 'x',
    })

    expect(rowState(row)).toMatchObject({ transferAccountId: 4, paidByUserId: null })
  })

  it('test_rows_that_block_confirm_are_flagged', () => {
    expect(rowState(aRow({ resolution: 'needs_confirmation' })).blocking).toBe(true)
    expect(rowState(aRow({ resolution: 'transfer_leg' })).blocking).toBe(true)
    expect(
      rowState(
        aRow({
          resolution: 'transfer_leg',
          transfer: { signal: 'rule', accountId: 3, legTransactionId: null, ruleId: 5 },
        })
      ).blocking
    ).toBe(false)
    expect(rowState(aRow()).blocking).toBe(false)
    expect(rowState(aRow({ resolution: 'ignored' })).blocking).toBe(false)
  })

  it('test_the_title_prefers_the_payee_then_the_bank_merchant_then_the_bank_text', () => {
    expect(rowTitle(aRow())).toBe('V1111 27/09 SAMPLE FEST SYDNEY')
    expect(rowTitle(aRow({ nabMerchant: 'TicketHub' }))).toBe('TicketHub')
    expect(rowTitle(aRow({ suggestion: { ...trusted(20), payee: 'Sample Fest' } }))).toBe(
      'Sample Fest'
    )
    expect(rowTitle(aRow({ decision: { payee: 'Fest' }, decidedAt: 'x' }))).toBe('Fest')
    expect(rowTitle(aRow({ isMasked: true, description: null }))).toBe('')
  })
})

describe('allowed actions', () => {
  it('test_a_doubtful_row_with_a_suggestion_can_be_accepted_changed_split_or_ignored', () => {
    const actions = allowedActions(aRow({ suggestion: tentative(20) }))

    expect([...actions].sort()).toEqual(
      ['accept', 'category', 'ignore', 'payer', 'split', 'transfer'].sort()
    )
  })

  it('test_a_possible_match_can_be_linked_or_created_new', () => {
    const actions = allowedActions(aRow({ resolution: 'needs_confirmation', match: aMatch() }))

    expect(actions.has('link')).toBe(true)
    expect(actions.has('accept')).toBe(true)
    expect(actions.has('category')).toBe(true)
  })

  it('test_a_matched_row_can_be_unlinked_but_takes_no_category', () => {
    const actions = allowedActions(aRow({ resolution: 'auto_matched', match: aMatch() }))

    expect(actions.has('create')).toBe(true)
    expect(actions.has('category')).toBe(false)
    expect(actions.has('ignore')).toBe(true)
  })

  it('test_an_ignored_row_can_only_be_restored_unless_it_is_zero', () => {
    expect([...allowedActions(aRow({ resolution: 'ignored' }))]).toEqual(['restore'])
    expect([...allowedActions(aRow({ resolution: 'ignored', amountCents: 0 }))]).toEqual([])
  })

  it('test_masked_duplicate_superseded_and_confirmed_rows_take_no_action', () => {
    expect(allowedActions(aRow({ isMasked: true })).size).toBe(0)
    expect(allowedActions(aRow({ resolution: 'duplicate' })).size).toBe(0)
    expect(allowedActions(aRow({ resolution: 'superseded' })).size).toBe(0)
    expect(allowedActions(aRow({ confirmedAt: '2026-10-01T00:00:00.000Z' })).size).toBe(0)
  })

  it('test_a_row_without_a_suggestion_cannot_be_accepted', () => {
    expect(allowedActions(aRow()).has('accept')).toBe(false)
  })
})

describe('decisions', () => {
  it('test_apply_decision_merges_keys_and_moves_the_resolution_like_the_api', () => {
    const row = aRow({ decision: { paidByUserId: 2 }, decidedAt: null })

    const next = applyDecision(row, { resolution: 'ignored', categoryId: 20 }, 'now')

    expect(next).toMatchObject({
      resolution: 'ignored',
      decision: { paidByUserId: 2, categoryId: 20 },
      decidedAt: 'now',
    })
    expect(row.resolution).toBe('new')
    expect(row.decision).toEqual({ paidByUserId: 2 })
  })

  it('test_apply_decision_keeps_keys_left_out_and_stores_explicit_nulls', () => {
    const row = aRow({ decision: { categoryId: 20, paidByUserId: 2 }, decidedAt: 'x' })

    const next = applyDecision(row, { paidByUserId: null })

    expect(next.decision).toEqual({ categoryId: 20, paidByUserId: null })
    expect(next.decidedAt).toBe('x')
  })

  it('test_accept_takes_the_category_suggestion', () => {
    expect(acceptChange(aRow({ suggestion: tentative(20) }))).toEqual({ categoryId: 20 })
  })

  it('test_accept_links_a_possible_match', () => {
    expect(acceptChange(aRow({ resolution: 'needs_confirmation', match: aMatch(901) }))).toEqual({
      resolution: 'auto_matched',
      matchTransactionId: 901,
    })
  })

  it('test_accept_has_nothing_to_take_without_a_suggestion', () => {
    expect(acceptChange(aRow())).toBeNull()
    expect(acceptChange(aRow({ resolution: 'needs_confirmation' }))).toBeNull()
    expect(acceptChange(aRow({ suggestion: trusted(20) }))).toBeNull()
  })

  it('test_bulk_accept_only_touches_doubtful_and_new_rows_with_a_suggestion', () => {
    const rows = [
      aRow({ id: 1, suggestion: tentative(20) }),
      aRow({ id: 2, suggestion: trusted(21) }),
      aRow({ id: 3 }),
      aRow({ id: 4, resolution: 'needs_confirmation', match: aMatch(900) }),
      aRow({ id: 5, resolution: 'ignored', suggestion: tentative(20) }),
      aRow({ id: 6, suggestion: tentative(20), isMasked: true }),
      aRow({ id: 7, suggestion: tentative(22), decision: { categoryId: 23 }, decidedAt: 'x' }),
    ]

    expect(bulkAcceptSuggested(rows)).toEqual([
      { rowId: 1, change: { categoryId: 20 } },
      { rowId: 4, change: { resolution: 'auto_matched', matchTransactionId: 900 } },
    ])
  })

  it('test_assigning_a_category_turns_doubtful_rows_into_new_ones_and_drops_splits', () => {
    const rows = [
      aRow({ id: 1 }),
      aRow({ id: 2, resolution: 'needs_confirmation', match: aMatch() }),
      aRow({
        id: 3,
        decision: { splits: [{ categoryId: 1, amountCents: 1 }] },
        decidedAt: 'x',
      }),
      aRow({ id: 4, resolution: 'auto_matched', match: aMatch() }),
      aRow({ id: 5, resolution: 'ignored' }),
    ]

    expect(assignCategoryChanges(rows, 30)).toEqual([
      { rowId: 1, change: { categoryId: 30 } },
      { rowId: 2, change: { resolution: 'new', categoryId: 30 } },
      { rowId: 3, change: { categoryId: 30, splits: [] } },
    ])
  })

  it('test_ignoring_skips_rows_already_ignored_or_without_actions', () => {
    const rows = [
      aRow({ id: 1 }),
      aRow({ id: 2, resolution: 'ignored' }),
      aRow({ id: 3, isMasked: true }),
    ]

    expect(ignoreChanges(rows)).toEqual([{ rowId: 1, change: { resolution: 'ignored' } }])
  })

  it('test_restore_links_a_match_or_a_known_transfer_before_creating_new', () => {
    expect(restoreChange(aRow({ resolution: 'ignored', match: aMatch(902) }))).toEqual({
      resolution: 'auto_matched',
      matchTransactionId: 902,
    })
    expect(
      restoreChange(
        aRow({
          resolution: 'ignored',
          transfer: { signal: 'rule', accountId: 3, legTransactionId: null, ruleId: 1 },
        })
      )
    ).toEqual({ resolution: 'transfer_leg', transferAccountId: 3 })
    expect(restoreChange(aRow({ resolution: 'ignored' }))).toEqual({ resolution: 'new' })
  })

  it('test_decisions_for_confirm_carry_every_decided_open_row', () => {
    const rows = [
      aRow({ id: 1, decision: { categoryId: 20 }, decidedAt: 'x' }),
      aRow({ id: 2 }),
      aRow({ id: 3, resolution: 'ignored', decision: {}, decidedAt: 'x' }),
      aRow({ id: 4, resolution: 'needs_confirmation', decision: { payee: 'A' }, decidedAt: 'x' }),
      aRow({ id: 5, isMasked: true, decision: null, decidedAt: 'x' }),
    ]

    expect(decisionsFor(rows)).toEqual([
      { rowId: 1, resolution: 'new', categoryId: 20 },
      { rowId: 3, resolution: 'ignored' },
      { rowId: 4, payee: 'A' },
    ])
  })

  it('test_blocking_rows_are_listed_for_the_confirm_button', () => {
    const rows = [
      aRow({ id: 1 }),
      aRow({ id: 2, resolution: 'needs_confirmation' }),
      aRow({ id: 3, resolution: 'transfer_leg' }),
    ]

    expect(blockingRowIds(rows)).toEqual([2, 3])
  })
})

describe('summary and filters', () => {
  const rows = [
    aRow({ id: 1, suggestion: trusted(20) }),
    aRow({ id: 2, resolution: 'auto_matched', match: aMatch() }),
    aRow({ id: 3, suggestion: tentative(20) }),
    aRow({ id: 4 }),
    aRow({
      id: 5,
      resolution: 'transfer_leg',
      transfer: { signal: 'rule', accountId: 3, legTransactionId: null, ruleId: 1 },
    }),
    aRow({ id: 6, resolution: 'ignored' }),
    aRow({ id: 7, resolution: 'needs_confirmation', match: aMatch(901) }),
  ]

  it('test_summary_counts_rows_by_tone_plus_the_batch_duplicates', () => {
    expect(summary(rows, 4)).toEqual({
      auto: 2,
      doubtful: 2,
      new: 1,
      duplicate: 4,
      transfer: 1,
      ignored: 1,
      total: 7,
      blocking: 1,
      acceptable: 2,
      listedDuplicates: 0,
    })
  })

  it('test_filters_pick_rows_by_tone', () => {
    expect(filterRows(rows, 'all').map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(filterRows(rows, 'doubtful').map((row) => row.id)).toEqual([3, 7])
    expect(filterRows(rows, 'new').map((row) => row.id)).toEqual([4])
    expect(filterRows(rows, 'ignored').map((row) => row.id)).toEqual([6])
  })

  it('test_blocking_filter_lists_only_rows_that_block_the_confirm', () => {
    const mixed = [
      ...rows,
      aRow({ id: 8, resolution: 'transfer_leg' }),
      aRow({ id: 9, resolution: 'needs_confirmation', confirmedAt: '2026-10-15T00:00:00.000Z' }),
    ]

    expect(filterRows(mixed, 'blocking').map((row) => row.id)).toEqual([7, 8])
    expect(filterRows(mixed, 'blocking').map((row) => row.id)).toEqual(blockingRowIds(mixed))
  })

  it('test_a_batch_partly_confirmed_elsewhere_only_counts_its_open_rows_as_work', () => {
    const confirmedAt = '2026-10-15T00:00:00.000Z'
    const partly = [
      aRow({ id: 1, suggestion: trusted(20), confirmedAt }),
      aRow({ id: 2, suggestion: tentative(21), confirmedAt }),
      aRow({ id: 3, suggestion: tentative(22), confirmedAt }),
      aRow({ id: 4, resolution: 'transfer_leg', confirmedAt }),
      aRow({ id: 5, resolution: 'ignored', confirmedAt }),
      aRow({ id: 6, resolution: 'needs_confirmation', match: aMatch(901) }),
      aRow({ id: 7, resolution: 'needs_confirmation' }),
    ]

    expect(summary(partly)).toMatchObject({
      auto: 3,
      doubtful: 2,
      new: 0,
      transfer: 1,
      ignored: 1,
      blocking: 2,
      acceptable: 1,
    })
    expect(filterRows(partly, 'doubtful').map((row) => row.id)).toEqual([6, 7])
  })
})

describe('guessed transfers', () => {
  it('test_a_guessed_transfer_leg_is_doubtful_until_a_person_decides_it', () => {
    const guessed = aGuessedTransfer()

    expect(toneOf(guessed)).toBe('doubtful')
    expect(filterRows([guessed, aRuleTransfer({ id: 2 })], 'doubtful')).toEqual([guessed])
    expect(toneOf(aRuleTransfer())).toBe('transfer')

    const accepted = applyDecision(guessed, acceptChange(guessed) ?? {}, 'x')
    expect(toneOf(accepted)).toBe('transfer')
    expect(acceptChange(accepted)).toBeNull()

    const elsewhere = applyDecision(guessed, { resolution: 'transfer_leg', transferAccountId: 4 })
    expect(toneOf(elsewhere)).toBe('transfer')
    expect(rowState(elsewhere).transferAccountId).toBe(4)
  })

  it('test_accepting_a_guessed_transfer_sets_its_proposed_account', () => {
    const rows = [
      aRow({ id: 1, suggestion: tentative(20) }),
      aGuessedTransfer({ id: 2 }),
      aRuleTransfer({ id: 3 }),
    ]

    expect(acceptChange(rows[1])).toEqual({ resolution: 'transfer_leg', transferAccountId: 3 })
    expect(allowedActions(rows[1]).has('accept')).toBe(true)
    expect(bulkAcceptSuggested(rows)).toEqual([
      { rowId: 1, change: { categoryId: 20 } },
      { rowId: 2, change: { resolution: 'transfer_leg', transferAccountId: 3 } },
    ])
    expect(summary(rows)).toMatchObject({ doubtful: 2, transfer: 1, acceptable: 2 })
  })

  it('test_a_guessed_transfer_does_not_block_the_confirm', () => {
    const rows = [aGuessedTransfer({ id: 1 }), aRow({ id: 2, resolution: 'needs_confirmation' })]

    expect(rowState(rows[0]).blocking).toBe(false)
    expect(blockingRowIds(rows)).toEqual([2])
    expect(filterRows(rows, 'blocking').map((row) => row.id)).toEqual([2])
    expect(summary(rows).blocking).toBe(1)
  })

  it('test_a_transfer_leg_without_a_proposed_account_is_not_accepted_in_bulk', () => {
    const rows = [
      aGuessedTransfer({
        id: 1,
        transfer: {
          signal: 'bank_category',
          accountId: null,
          legTransactionId: null,
          ruleId: null,
        },
      }),
      aRow({ id: 2, resolution: 'transfer_leg' }),
    ]

    expect(rows.map(acceptChange)).toEqual([null, null])
    expect(bulkAcceptSuggested(rows)).toEqual([])
    expect(rows.map(toneOf)).toEqual(['transfer', 'transfer'])
    expect(blockingRowIds(rows)).toEqual([1, 2])
  })

  it('test_a_confirmed_guessed_transfer_is_shown_as_a_transfer', () => {
    const confirmed = aGuessedTransfer({ confirmedAt: '2026-10-15T00:00:00.000Z' })

    expect(toneOf(confirmed)).toBe('transfer')
    expect(acceptChange(confirmed)).toBeNull()
    expect(allowedActions(confirmed).size).toBe(0)
    expect(summary([confirmed])).toMatchObject({ doubtful: 0, transfer: 1, acceptable: 0 })
  })

  it('test_a_transfer_flagged_for_another_reason_is_not_taken_for_a_guess', () => {
    const futureDated = aRuleTransfer({ reasons: ['future_date'] })

    expect(toneOf(futureDated)).toBe('transfer')
    expect(acceptChange(futureDated)).toBeNull()
    expect(isGuessedTransfer(futureDated)).toBe(false)
    expect(isGuessedTransfer(aGuessedTransfer())).toBe(true)
  })
})

describe('classification', () => {
  it('test_classifiable_rows_are_open_rows_without_a_category_a_person_chose', () => {
    const rows = [
      aRow({ id: 1 }),
      aRow({ id: 2, suggestion: tentative(20) }),
      aRow({ id: 3, suggestion: trusted(20) }),
      aRow({ id: 4, decision: { categoryId: 20 }, decidedAt: 'x' }),
      aRow({ id: 5, resolution: 'auto_matched', match: aMatch() }),
      aRow({ id: 6, resolution: 'ignored' }),
      aRow({ id: 7, isMasked: true }),
    ]

    expect(classifiableRows(rows).map((row) => row.id)).toEqual([1, 2])
  })
})

describe('duplicates', () => {
  /** A row the bank sent again: settled at staging, pointing at the ledger row it repeats. */
  const aDuplicate = (overrides: Partial<ReviewableRow> = {}) =>
    aRow({
      resolution: 'duplicate',
      reasons: ['duplicate_hash'],
      confirmedAt: '2026-10-16T00:00:00.000Z',
      match: { ...aMatch(900), score: null },
      ...overrides,
    })

  it('test_duplicates_are_listed_only_behind_their_own_filter', () => {
    const rows = [aRow({ id: 1 }), aDuplicate({ id: 2 }), aRow({ id: 3, resolution: 'ignored' })]

    expect(filterRows(rows, 'all').map((row) => row.id)).toEqual([1, 3])
    expect(filterRows(rows, 'duplicate').map((row) => row.id)).toEqual([2])
    expect(toneOf(aDuplicate())).toBe('duplicate')
  })

  it('test_the_summary_counts_listed_duplicates_apart_from_the_rows_to_review', () => {
    const rows = [aRow({ id: 1 }), aDuplicate({ id: 2 }), aDuplicate({ id: 3 })]

    expect(summary(rows, 2)).toMatchObject({ new: 1, duplicate: 2, total: 1, listedDuplicates: 2 })
    // A batch staged before duplicates were listed only counts them.
    expect(summary([aRow({ id: 1 })], 3)).toMatchObject({
      duplicate: 3,
      total: 1,
      listedDuplicates: 0,
    })
  })

  it('test_a_duplicate_takes_no_decision_and_never_waits_for_one', () => {
    const unsettled = aDuplicate({ confirmedAt: null, suggestion: tentative(20) })

    expect(allowedActions(unsettled).size).toBe(0)
    expect(acceptChange(unsettled)).toBeNull()
    expect(blockingRowIds([unsettled])).toEqual([])
    expect(bulkAcceptSuggested([unsettled])).toEqual([])
    expect(classifiableRows([unsettled])).toEqual([])
    expect(decisionsFor([{ ...unsettled, decidedAt: 'x', decision: {} }])).toEqual([])
  })
})

describe('bulk restore and undo', () => {
  it('test_restore_changes_bring_back_the_ignored_rows_that_can_be_restored', () => {
    const rows = [
      aRow({ id: 1, resolution: 'ignored' }),
      aRow({ id: 2, resolution: 'ignored', amountCents: 0 }),
      aRow({ id: 3, resolution: 'ignored', match: aMatch(900) }),
      aRow({ id: 4 }),
      aRow({ id: 5, resolution: 'ignored', confirmedAt: '2026-10-15T00:00:00.000Z' }),
    ]

    expect(restoreChanges(rows)).toEqual([
      { rowId: 1, change: { resolution: 'new' } },
      { rowId: 3, change: { resolution: 'auto_matched', matchTransactionId: 900 } },
    ])
  })

  it('test_restoring_a_weak_match_brings_it_back_to_confirm_undecided', () => {
    const ignored = aRow({
      resolution: 'ignored',
      proposedResolution: 'needs_confirmation',
      reasons: ['possible_match'],
      match: aMatch(901),
      decision: {},
      decidedAt: '2026-10-16T00:00:00.000Z',
    })

    expect(restoreChange(ignored)).toEqual({ reset: true })
    const restored = applyDecision(ignored, restoreChange(ignored))
    expect(restored).toMatchObject({
      resolution: 'needs_confirmation',
      decision: null,
      decidedAt: null,
    })
    expect(toneOf(restored)).toBe('doubtful')
    expect(blockingRowIds([restored])).toEqual([1])
  })

  it('test_restoring_a_guessed_transfer_keeps_it_a_guess_to_review', () => {
    const ignored = aGuessedTransfer({
      resolution: 'ignored',
      proposedResolution: 'transfer_leg',
      decision: {},
      decidedAt: '2026-10-16T00:00:00.000Z',
    })

    expect(restoreChanges([ignored])).toEqual([{ rowId: 1, change: { reset: true } }])
    const restored = applyDecision(ignored, restoreChange(ignored))
    expect(restored.resolution).toBe('transfer_leg')
    expect(restored.decidedAt).toBeNull()
    expect(isGuessedTransfer(restored)).toBe(true)
    expect(toneOf(restored)).toBe('doubtful')
  })

  it('test_restoring_a_transfer_to_an_unknown_account_waits_for_a_person_again', () => {
    const ignored = aRow({
      resolution: 'ignored',
      proposedResolution: 'needs_confirmation',
      reasons: ['transfer_destination_unknown'],
      transfer: { signal: 'bank_category', accountId: null, legTransactionId: null, ruleId: null },
      decision: {},
      decidedAt: '2026-10-16T00:00:00.000Z',
    })

    const restored = applyDecision(ignored, restoreChange(ignored))
    expect(restored.resolution).toBe('needs_confirmation')
    expect(blockingRowIds([restored])).toEqual([1])
  })

  it('test_rows_staged_before_the_proposal_was_kept_restore_as_before', () => {
    const legacy = aRow({ resolution: 'ignored', proposedResolution: null, match: aMatch(900) })

    expect(restoreChange(legacy)).toEqual({ resolution: 'auto_matched', matchTransactionId: 900 })
  })

  it('test_a_reset_alone_leaves_the_row_undecided_and_with_keys_decides_it', () => {
    const decided = aRow({
      resolution: 'ignored',
      proposedResolution: 'new',
      decision: { categoryId: 20 },
      decidedAt: '2026-10-16T00:00:00.000Z',
    })

    expect(applyDecision(decided, { reset: true })).toMatchObject({
      resolution: 'new',
      decision: null,
      decidedAt: null,
    })
    expect(applyDecision(decided, { reset: true, payee: 'Deli' }, 'now')).toMatchObject({
      resolution: 'new',
      decision: { payee: 'Deli' },
      decidedAt: 'now',
    })
  })

  it('test_undo_resets_an_untouched_row_to_the_importer_proposal', () => {
    expect(undoChanges([aRow({ id: 1, suggestion: tentative(20) })])).toEqual([
      { rowId: 1, reset: true },
    ])
  })

  it('test_undo_puts_back_the_decision_a_row_had_before', () => {
    const decided = aRow({
      id: 2,
      decision: { categoryId: 20, payee: 'Deli' },
      decidedAt: '2026-10-16T00:00:00.000Z',
    })
    const transfer = aRow({
      id: 3,
      resolution: 'transfer_leg',
      decision: { transferAccountId: 3 },
      decidedAt: '2026-10-16T00:00:00.000Z',
    })
    const stillToConfirm = aRow({
      id: 4,
      resolution: 'needs_confirmation',
      match: aMatch(901),
      decision: { payee: 'Harbour Cafe' },
      decidedAt: '2026-10-16T00:00:00.000Z',
    })

    expect(undoChanges([decided, transfer, stillToConfirm])).toEqual([
      { rowId: 2, reset: true, resolution: 'new', categoryId: 20, payee: 'Deli' },
      { rowId: 3, reset: true, resolution: 'transfer_leg', transferAccountId: 3 },
      { rowId: 4, reset: true, payee: 'Harbour Cafe' },
    ])
  })
})

describe('reconciliation message', () => {
  const base = {
    asOf: '2026-09-27',
    expectedBalanceCents: 764275,
    computedBalanceCents: 764275,
    differenceCents: 0,
    balanced: true,
    openingBalanceCents: null,
    missingBefore: null,
  }

  it('test_a_balanced_import_says_the_ledger_matches_the_bank', () => {
    expect(reconciliationMessage(base)).toEqual({
      status: 'balanced',
      asOf: '2026-09-27',
      balanceCents: 764275,
    })
  })

  it('test_a_difference_says_movements_before_a_date_are_missing', () => {
    expect(
      reconciliationMessage({
        ...base,
        computedBalanceCents: 700000,
        differenceCents: 64275,
        balanced: false,
        missingBefore: '2025-12-22',
      })
    ).toEqual({ status: 'missing', before: '2025-12-22', differenceCents: 64275 })
  })

  it('test_a_difference_without_a_date_still_reports_the_gap', () => {
    expect(
      reconciliationMessage({
        ...base,
        differenceCents: -500,
        balanced: false,
        missingBefore: null,
      })
    ).toEqual({ status: 'differs', differenceCents: -500 })
  })

  it('test_unknown_balances_say_nothing_can_be_compared', () => {
    expect(
      reconciliationMessage({
        ...base,
        expectedBalanceCents: null,
        differenceCents: null,
        balanced: null,
      })
    ).toEqual({ status: 'unknown' })
    expect(reconciliationMessage(null)).toEqual({ status: 'unknown' })
  })
})
