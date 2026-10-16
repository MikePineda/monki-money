import {
  EMPTY_GOAL_DRAFT,
  draftFromGoal,
  draftProblems,
  goalOutlook,
  goalPayload,
  openEndedReason,
  ownerOf,
  progressOf,
  projectionPoints,
  reachedDay,
  reachedOnText,
  readsReached,
  readyToMarkReached,
  targetPace,
  type GoalDraft,
  type GoalFields,
  type ProjectionFacts,
} from './goals'

const PEOPLE = { youId: 1, partnerId: 2 }

function fields(overrides: Partial<GoalFields> = {}): GoalFields {
  return {
    name: 'Emergency fund',
    targetCents: 500_000,
    targetDate: null,
    startingCents: 120_000,
    monthlyContributionCents: null,
    accountId: null,
    userId: null,
    ...overrides,
  }
}

function facts(overrides: Partial<ProjectionFacts> = {}): ProjectionFacts {
  return {
    savedCents: 120_000,
    targetCents: 500_000,
    remainingCents: 380_000,
    rateSource: 'average',
    monthlyRateCents: 50_000,
    monthsToGoal: 8,
    projectedDate: '2027-06-01',
    requiredMonthlyForTargetDate: null,
    onTrack: null,
    series: [
      { month: '2026-10', projectedCents: 120_000 },
      { month: '2026-11', projectedCents: 170_000 },
      { month: '2026-12', projectedCents: 220_000 },
    ],
    history: [
      { month: '2026-08', balanceCents: 40_000 },
      { month: '2026-09', balanceCents: 90_000 },
      { month: '2026-10', balanceCents: 120_000 },
    ],
    ...overrides,
  }
}

describe('goal drafts', () => {
  it('test_an_empty_draft_saves_manually_lets_the_app_estimate_and_belongs_to_the_household', () => {
    expect(EMPTY_GOAL_DRAFT).toEqual({
      name: '',
      targetCents: 0,
      targetDate: '',
      savedFrom: 'manual',
      startingCents: 0,
      accountId: null,
      contribution: 'estimate',
      monthlyContributionCents: 0,
      owner: 'household',
    })
  })

  it('test_a_goal_with_an_account_and_a_contribution_becomes_a_draft', () => {
    const draft = draftFromGoal(
      fields({
        accountId: 7,
        monthlyContributionCents: 25_000,
        userId: 2,
        targetDate: '2027-03-31',
      }),
      PEOPLE
    )

    expect(draft).toEqual({
      name: 'Emergency fund',
      targetCents: 500_000,
      targetDate: '2027-03-31',
      savedFrom: 'account',
      startingCents: 120_000,
      accountId: 7,
      contribution: 'fixed',
      monthlyContributionCents: 25_000,
      owner: 'partner',
    })
  })

  it('test_an_explicit_zero_contribution_stays_fixed', () => {
    expect(draftFromGoal(fields({ monthlyContributionCents: 0 }), PEOPLE).contribution).toBe(
      'fixed'
    )
  })

  it('test_owner_maps_user_ids_to_you_partner_or_household', () => {
    expect(ownerOf(1, PEOPLE)).toBe('you')
    expect(ownerOf(2, PEOPLE)).toBe('partner')
    expect(ownerOf(null, PEOPLE)).toBe('household')
    // A member who left: the goal reads as the household's.
    expect(ownerOf(99, PEOPLE)).toBe('household')
  })

  it('test_a_manual_draft_becomes_the_api_body', () => {
    const draft: GoalDraft = {
      ...EMPTY_GOAL_DRAFT,
      name: '  Holiday ',
      targetCents: 300_000,
      startingCents: 50_000,
      contribution: 'fixed',
      monthlyContributionCents: 40_000,
      owner: 'you',
    }

    expect(goalPayload(draft, PEOPLE)).toEqual({
      name: 'Holiday',
      targetCents: 300_000,
      targetDate: null,
      startingCents: 50_000,
      monthlyContributionCents: 40_000,
      accountId: null,
      userId: 1,
    })
  })

  it('test_an_account_draft_sends_the_account_and_an_estimate_sends_null', () => {
    const draft: GoalDraft = {
      ...EMPTY_GOAL_DRAFT,
      name: 'House deposit',
      targetCents: 6_000_000,
      targetDate: '2028-12-31',
      savedFrom: 'account',
      accountId: 3,
      monthlyContributionCents: 12_345,
      owner: 'partner',
    }

    expect(goalPayload(draft, PEOPLE)).toEqual({
      name: 'House deposit',
      targetCents: 6_000_000,
      targetDate: '2028-12-31',
      startingCents: 0,
      monthlyContributionCents: null,
      accountId: 3,
      userId: 2,
    })
  })

  it('test_a_partner_goal_without_a_partner_belongs_to_the_household', () => {
    const draft: GoalDraft = { ...EMPTY_GOAL_DRAFT, name: 'x', targetCents: 1, owner: 'partner' }
    expect(goalPayload(draft, { youId: 1, partnerId: null }).userId).toBeNull()
  })

  it('test_problems_name_the_fields_a_person_still_has_to_fill', () => {
    expect(draftProblems(EMPTY_GOAL_DRAFT)).toEqual(['name', 'targetCents'])
    expect(
      draftProblems({
        ...EMPTY_GOAL_DRAFT,
        name: 'Car',
        targetCents: 100,
        savedFrom: 'account',
      })
    ).toEqual(['accountId'])
    expect(draftProblems({ ...EMPTY_GOAL_DRAFT, name: ' Car ', targetCents: 100 })).toEqual([])
  })
})

describe('projection facts', () => {
  it('test_progress_is_saved_over_target_capped_between_zero_and_one', () => {
    expect(progressOf(120_000, 500_000)).toBeCloseTo(0.24)
    expect(progressOf(600_000, 500_000)).toBe(1)
    expect(progressOf(-100, 500_000)).toBe(0)
    expect(progressOf(100, 0)).toBe(0)
  })

  it('test_outlook_is_reached_projected_or_open_ended', () => {
    expect(goalOutlook(facts())).toBe('projected')
    expect(goalOutlook(facts({ remainingCents: 0, monthsToGoal: 0, projectedDate: null }))).toBe(
      'reached'
    )
    expect(goalOutlook(facts({ monthsToGoal: null, projectedDate: null }))).toBe('openEnded')
  })

  it('test_pace_only_exists_with_a_target_date', () => {
    expect(targetPace(facts({ onTrack: true }))).toBe('onTrack')
    expect(targetPace(facts({ onTrack: false }))).toBe('behind')
    expect(targetPace(facts({ onTrack: null }))).toBeNull()
  })

  it('test_an_open_ended_goal_says_why', () => {
    const open = { monthsToGoal: null, projectedDate: null } as const
    expect(openEndedReason(facts({ ...open, rateSource: 'none', monthlyRateCents: null }))).toBe(
      'noHistory'
    )
    expect(
      openEndedReason(facts({ ...open, rateSource: 'average', monthlyRateCents: -2_000 }))
    ).toBe('spendingMore')
    expect(
      openEndedReason(facts({ ...open, rateSource: 'contribution', monthlyRateCents: 0 }))
    ).toBe('zeroContribution')
    expect(
      openEndedReason(facts({ ...open, rateSource: 'contribution', monthlyRateCents: 1 }))
    ).toBe('tooSlow')
  })

  it('test_the_actual_line_follows_the_history_and_the_estimate_continues_from_today', () => {
    expect(projectionPoints(facts())).toEqual({
      history: [
        { x: '2026-08', valueCents: 40_000 },
        { x: '2026-09', valueCents: 90_000 },
        { x: '2026-10', valueCents: 120_000 },
      ],
      projection: [
        { x: '2026-11', valueCents: 170_000 },
        { x: '2026-12', valueCents: 220_000 },
      ],
    })
  })

  it('test_without_history_today_is_the_only_actual_point', () => {
    expect(projectionPoints(facts({ history: [] }))).toEqual({
      history: [{ x: '2026-10', valueCents: 120_000 }],
      projection: [
        { x: '2026-11', valueCents: 170_000 },
        { x: '2026-12', valueCents: 220_000 },
      ],
    })
    expect(projectionPoints(facts({ history: [], series: [] }))).toEqual({
      history: [],
      projection: [],
    })
  })

  it('test_a_goal_reads_as_reached_when_marked_or_when_nothing_is_left', () => {
    const atTarget = facts({ remainingCents: 0, monthsToGoal: 0, projectedDate: null })

    expect(readsReached('reached', facts())).toBe(true)
    expect(readsReached('reached', null)).toBe(true)
    expect(readsReached('active', atTarget)).toBe(true)
    expect(readsReached('active', facts())).toBe(false)
    expect(readsReached('active', null)).toBe(false)
    expect(readsReached('archived', atTarget)).toBe(false)
  })

  it('test_only_an_active_goal_with_nothing_left_is_ready_to_mark_reached', () => {
    const atTarget = facts({ remainingCents: 0, monthsToGoal: 0, projectedDate: null })

    expect(readyToMarkReached('active', atTarget)).toBe(true)
    expect(readyToMarkReached('active', facts())).toBe(false)
    expect(readyToMarkReached('reached', atTarget)).toBe(false)
    expect(readyToMarkReached('archived', atTarget)).toBe(false)
    expect(readyToMarkReached('active', null)).toBe(false)
  })

  it('test_the_reached_day_is_the_household_calendar_day', () => {
    // 21:30 UTC on 2 Nov is already 3 Nov in Brisbane.
    expect(reachedDay('2026-11-02T21:30:00.000Z', 'Australia/Brisbane')).toBe('2026-11-03')
    expect(reachedDay('2026-11-02T21:30:00.000Z', 'UTC')).toBe('2026-11-02')
    expect(reachedDay(null, 'Australia/Brisbane')).toBeNull()
  })

  it('test_the_reached_on_text_drops_the_year_only_within_this_year', () => {
    const stamp = '2026-11-02T21:30:00.000Z'
    const brisbane = 'Australia/Brisbane'

    expect(reachedOnText(stamp, 'en-AU', brisbane, new Date('2026-12-01T00:00:00Z'))).toBe('3 Nov')
    expect(reachedOnText(stamp, 'es-MX', brisbane, new Date('2027-01-05T00:00:00Z'))).toBe(
      '3 nov 2026'
    )
    expect(reachedOnText(null, 'en-AU', brisbane, new Date())).toBeNull()
  })
})
