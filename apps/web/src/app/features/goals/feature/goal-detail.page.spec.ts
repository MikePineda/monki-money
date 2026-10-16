import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import {
  aGoal,
  aProjection,
  aReachedProjection,
  aTrackedHistory,
  anOpenEndedProjection,
} from '../../../../testing/goal-fixtures'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aCategoryTree } from '../../../../testing/ledger-fixtures'
import { anAccount, aSessionStub, httpError } from '../../../../testing/session-fixtures'
import type { Goal } from '../../../core/api/api-types'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { CategoriesApi } from '../../../core/household/categories.api'
import { CLOCK } from '../../../core/platform/clock.token'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import { GoalsApi, type GoalProjection } from '../data-access/goals.api'
import GoalDetailPage from './goal-detail.page'

@Component({ template: '<p data-testid="stub">list</p>' })
class Stub {}

describe('GoalDetailPage', () => {
  let api: {
    show: ReturnType<typeof vi.fn>
    projection: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }

  async function open(
    options: { goal?: Goal; projection?: GoalProjection; url?: string; notFound?: boolean } = {}
  ) {
    const goal = options.goal ?? aGoal()
    api = {
      show: vi.fn(async () => {
        if (options.notFound) {
          throw httpError(404, { code: 'E_ROW_NOT_FOUND' })
        }
        return goal
      }),
      projection: vi.fn(async () => options.projection ?? aProjection()),
      update: vi.fn(async (_id: number, body: Partial<Goal>) => ({ ...goal, ...body })),
      remove: vi.fn(async () => undefined),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'goals', component: Stub },
            { path: 'goals/:id', component: GoalDetailPage },
          ],
          withComponentInputBinding()
        ),
        { provide: GoalsApi, useValue: api },
        { provide: AccountsApi, useValue: { list: async () => [anAccount()] } },
        { provide: CategoriesApi, useValue: { tree: async () => aCategoryTree() } },
        { provide: SessionStore, useValue: aSessionStub() },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
        { provide: CLOCK, useValue: () => new Date('2026-11-20T00:00:00.000Z') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl(options.url ?? '/goals/1')
    const root = harness.fixture.nativeElement as HTMLElement
    await settle(harness, root)
    return { harness, root }
  }

  async function settle(harness: RouterTestingHarness, root: HTMLElement): Promise<void> {
    await vi.waitFor(() => {
      expect(root.querySelector('[data-testid="goal.loading"]')).toBeNull()
      expect(root.textContent).toMatch(/Saved|no longer exists|did not load|Name/)
    })
    await harness.fixture.whenStable()
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function click(root: ParentNode, selector: string): void {
    const element = root.querySelector<HTMLElement>(selector)
    if (!element) {
      throw new Error(`Nothing matches ${selector}`)
    }
    element.click()
  }

  it('test_the_hero_shows_saved_against_target_and_what_is_left', async () => {
    const { root } = await open()

    expect(text(root, '[data-testid="goal.name"]')).toBe('Emergency fund')
    expect(text(root, '[data-testid="goal.saved"]')).toBe('$1,200.00')
    expect(text(root, '[data-testid="goal.target"]')).toBe('of $5,000.00 · $3,800.00 to go')
    expect(
      root.querySelector('[data-testid="goal.hero"] app-progress-track')?.getAttribute('aria-label')
    ).toBe('24% saved')
  })

  it('test_a_projected_goal_draws_the_projection_and_its_figures', async () => {
    const { root } = await open()

    expect(root.querySelector('[data-testid="goal.chart"] app-projection-chart')).not.toBeNull()
    expect(text(root, '[data-testid="goal.stats.months"] [data-testid="goals.stat.value"]')).toBe(
      '8 months'
    )
    expect(text(root, '[data-testid="goal.stats.date"] [data-testid="goals.stat.value"]')).toBe(
      'June 2027'
    )
    expect(text(root, '[data-testid="goal.stats.rate"] [data-testid="goals.stat.value"]')).toBe(
      '$500'
    )
    expect(text(root, '[data-testid="goal.stats.rate"]')).toContain('From your last 3 months')
    expect(root.querySelector('[data-testid="goal.pace"]')).toBeNull()
  })

  it('test_a_goal_behind_its_date_says_so_and_what_it_would_take', async () => {
    const { root } = await open({
      goal: aGoal({ targetDate: '2027-03-31' }),
      projection: aProjection({ onTrack: false, requiredMonthlyForTargetDate: 75_910 }),
    })

    expect(text(root, '[data-testid="goal.pace"]')).toBe('Behind for 31 Mar 2027')
    expect(root.querySelector('[data-testid="goal.pace"] app-icon')?.className).toContain(
      'text-status-warning'
    )
    expect(text(root, '[data-testid="goal.stats.required"] [data-testid="goals.stat.value"]')).toBe(
      '$760'
    )
    expect(text(root, '[data-testid="goal.stats.required"]')).toContain(
      'To reach it by 31 Mar 2027'
    )
    await vi.waitFor(() => expect(root.querySelector('line[data-marker]')).not.toBeNull())
  })

  it('test_a_goal_on_track_says_so_without_asking_for_more', async () => {
    const { root } = await open({
      goal: aGoal({ targetDate: '2027-12-31' }),
      projection: aProjection({ onTrack: true, requiredMonthlyForTargetDate: 30_000 }),
    })

    expect(text(root, '[data-testid="goal.pace"]')).toBe('On track for 31 Dec 2027')
    expect(root.querySelector('[data-testid="goal.stats.required"]')).toBeNull()
  })

  it('test_an_open_ended_goal_explains_why_and_nudges_a_contribution', async () => {
    const { harness, root } = await open({ projection: anOpenEndedProjection() })

    expect(root.querySelector('[data-testid="goal.chart"]')).toBeNull()
    expect(text(root, '[data-testid="goal.openEnded"]')).toContain(
      'There is no saving history to estimate from yet'
    )
    expect(text(root, '[data-testid="goal.stats.months"] [data-testid="goals.stat.value"]')).toBe(
      'Not yet'
    )

    click(root, '[data-testid="goal.setContribution"]')
    await harness.fixture.whenStable()

    expect(root.querySelector('[data-testid="goal.form"]')).not.toBeNull()
    expect(root.querySelector('[data-testid="goals.form.monthlyKeypad"]')).not.toBeNull()
  })

  it('test_mark_as_reached_patches_the_status', async () => {
    const { harness, root } = await open()

    click(root, '[data-testid="goal.markReached"]')
    await harness.fixture.whenStable()

    expect(api.update).toHaveBeenCalledWith(1, { status: 'reached' })
  })

  it('test_a_reached_goal_offers_to_reopen_and_shows_a_badge', async () => {
    const { root } = await open({ goal: aGoal({ status: 'reached' }) })

    expect(text(root, '[data-testid="goal.badge"]')).toBe('Reached')
    expect(root.querySelector('[data-testid="goal.markReached"]')).toBeNull()
    expect(root.querySelector('[data-testid="goal.reopen"]')).not.toBeNull()
  })

  it('test_the_actual_line_runs_through_the_history_and_the_estimate_starts_today', async () => {
    const { root } = await open({ projection: aProjection({ history: aTrackedHistory() }) })

    await vi.waitFor(() =>
      expect(
        root.querySelectorAll('[data-testid="goal.chart"] g[data-series="actual"] circle')
      ).toHaveLength(7)
    )
    expect(root.querySelector('[data-testid="goal.chart"] path[data-projected]')).not.toBeNull()
  })

  it('test_a_goal_at_its_target_offers_mark_as_reached_first', async () => {
    const { harness, root } = await open({ projection: aReachedProjection() })

    const prompt = root.querySelector('[data-testid="goal.atTarget"]')
    expect(text(root, '[data-testid="goal.atTarget"] h2')).toBe('You reached your target')
    const mark = prompt?.querySelector<HTMLButtonElement>('[data-testid="goal.markReached"]')
    expect(mark?.getAttribute('data-variant')).toBe('primary')
    // Only one "Mark as reached" on screen: the prominent one.
    expect(root.querySelectorAll('[data-testid="goal.markReached"]')).toHaveLength(1)

    mark?.click()
    await harness.fixture.whenStable()

    expect(api.update).toHaveBeenCalledWith(1, { status: 'reached' })
  })

  it('test_a_goal_still_saving_keeps_mark_as_reached_with_the_other_actions', async () => {
    const { root } = await open()

    expect(root.querySelector('[data-testid="goal.atTarget"]')).toBeNull()
    expect(
      root.querySelector('[data-testid="goal.actions"] [data-testid="goal.markReached"]')
    ).not.toBeNull()
  })

  it('test_a_reached_goal_says_the_day_it_was_reached_in_the_household_time_zone', async () => {
    const { root } = await open({
      goal: aGoal({ status: 'reached', reachedAt: '2026-11-02T21:30:00.000Z' }),
      projection: aReachedProjection({
        history: aTrackedHistory().map((point) => ({
          ...point,
          balanceCents: point.balanceCents * 5,
        })),
      }),
    })

    expect(text(root, '[data-testid="goal.reachedOn"]')).toBe('Reached on 3 Nov')
    expect(root.querySelector('[data-testid="goal.atTarget"]')).toBeNull()
    // With months behind it, the chart shows how it got there.
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="goal.chart"] circle[data-crossing]')).not.toBeNull()
    )
  })

  it('test_reopening_a_reached_goal_patches_it_back_to_active', async () => {
    const { harness, root } = await open({
      goal: aGoal({ status: 'reached', reachedAt: '2026-11-02T21:30:00.000Z' }),
    })

    click(root, '[data-testid="goal.reopen"]')
    await harness.fixture.whenStable()

    expect(api.update).toHaveBeenCalledWith(1, { status: 'active' })
  })

  it('test_hero_amounts_use_the_true_minus_sign', async () => {
    const { root } = await open({
      projection: aProjection({ savedCents: -12_345, remainingCents: 512_345 }),
    })

    expect(text(root, '[data-testid="goal.saved"]')).toBe('−$123.45')
    expect(text(root, '[data-testid="goal.target"]')).toBe('of $5,000.00 · $5,123.45 to go')
    expect(root.querySelector('[data-testid="goal.target"]')?.classList).toContain('tnum')
  })

  it('test_edit_saves_the_whole_goal', async () => {
    const { harness, root } = await open()

    click(root, '[data-testid="goal.edit"]')
    await harness.fixture.whenStable()
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    await (await loader.getHarness(TextFieldHarness)).setValue('Rainy day')
    click(root, '[data-testid="goals.form.submit"]')
    await harness.fixture.whenStable()

    expect(api.update).toHaveBeenCalledWith(1, {
      name: 'Rainy day',
      targetCents: 500_000,
      targetDate: null,
      startingCents: 120_000,
      monthlyContributionCents: null,
      accountId: null,
      userId: null,
    })
    await vi.waitFor(() => expect(root.querySelector('[data-testid="goal.form"]')).toBeNull())
  })

  it('test_delete_asks_first_then_returns_to_the_list', async () => {
    const { harness, root } = await open()

    click(root, '[data-testid="goal.delete"]')
    await harness.fixture.whenStable()
    const confirm = document.querySelector<HTMLButtonElement>(
      '[data-testid="goals.delete.confirm"]'
    )
    expect(confirm?.textContent?.trim()).toBe('Delete goal')
    expect(api.remove).not.toHaveBeenCalled()
    confirm?.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/goals'))
    expect(api.remove).toHaveBeenCalledWith(1)
  })

  it('test_an_unknown_goal_is_not_found', async () => {
    const { root } = await open({ notFound: true })

    expect(text(root, '[data-testid="goal.notFound"] h2')).toBe('This goal no longer exists')
  })

  it('test_an_id_that_is_not_a_number_is_not_found_without_asking', async () => {
    const { root } = await open({ url: '/goals/abc' })

    expect(text(root, '[data-testid="goal.notFound"] h2')).toBe('This goal no longer exists')
    expect(api.show).not.toHaveBeenCalled()
  })
})
