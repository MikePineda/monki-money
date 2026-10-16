import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import {
  aGoalWithProjection,
  aReachedProjection,
  anOpenEndedProjection,
} from '../../../../testing/goal-fixtures'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aSessionStub, networkError } from '../../../../testing/session-fixtures'
import type { GoalWithProjection } from '../../../core/api/api-types'
import { SessionStore } from '../../../core/auth/session.store'
import { CLOCK } from '../../../core/platform/clock.token'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { GoalsApi } from '../data-access/goals.api'
import GoalsListPage from './goals-list.page'

@Component({ template: '<p data-testid="stub">stub</p>' })
class Stub {}

describe('GoalsListPage', () => {
  let api: {
    listWithProjections: ReturnType<typeof vi.fn>
    reorder: ReturnType<typeof vi.fn>
  }

  async function open(
    options: {
      goals?: GoalWithProjection[]
      reached?: GoalWithProjection[]
      failFirst?: boolean
    } = {}
  ) {
    const active = options.goals ?? [
      aGoalWithProjection({ id: 1, name: 'Emergency fund', userId: null }),
      aGoalWithProjection({ id: 2, name: 'Holiday', userId: 1 }),
      aGoalWithProjection(
        { id: 3, name: 'New bike', userId: 2 },
        anOpenEndedProjection({ goalId: 3 })
      ),
    ]
    const reached = options.reached ?? [
      aGoalWithProjection(
        { id: 9, name: 'Laptop', status: 'reached', reachedAt: '2026-11-02T21:30:00.000Z' },
        aReachedProjection({ goalId: 9 })
      ),
    ]
    api = {
      listWithProjections: vi.fn(async (status: string) =>
        status === 'active' ? active : reached
      ),
      reorder: vi.fn(async () => undefined),
    }
    if (options.failFirst) {
      api.listWithProjections.mockRejectedValueOnce(networkError())
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'goals', component: GoalsListPage },
            { path: 'goals/new', component: Stub },
            { path: 'goals/:id', component: Stub },
            { path: 'settings', component: Stub },
          ],
          withComponentInputBinding()
        ),
        { provide: GoalsApi, useValue: api },
        { provide: SessionStore, useValue: aSessionStub() },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
        { provide: CLOCK, useValue: () => new Date('2026-11-20T00:00:00.000Z') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/goals')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => {
      expect(text(root, 'h1')).toBe('Savings goals')
      expect(root.querySelector('[data-testid="goals.loading"]')).toBeNull()
    })
    await harness.fixture.whenStable()
    return { harness, root }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function cards(root: ParentNode): string[] {
    return [...root.querySelectorAll('[data-testid="goals.card.name"]')].map(
      (name) => name.textContent?.trim() ?? ''
    )
  }

  async function settle(harness: RouterTestingHarness, root: HTMLElement): Promise<void> {
    await vi.waitFor(() => expect(root.querySelector('[data-testid="goals.loading"]')).toBeNull())
    await harness.fixture.whenStable()
  }

  it('test_lists_the_active_goals_in_order_with_whose_goal_they_are', async () => {
    const { root } = await open()

    expect(cards(root)).toEqual(['Emergency fund', 'Holiday', 'New bike'])
    const outlooks = [...root.querySelectorAll('[data-testid="goals.card.outlook"]')].map((line) =>
      line.textContent?.replace(/\s+/g, ' ').trim()
    )
    expect(outlooks).toEqual([
      'Projected June 2027 · Household',
      'Projected June 2027 · You',
      'Needs a plan · Alex',
    ])
    expect(api.listWithProjections).toHaveBeenCalledWith('active')
  })

  it('test_filter_chips_show_reached_and_archived_goals', async () => {
    const { harness, root } = await open()
    const reached = root.querySelector<HTMLButtonElement>('[data-testid="goals.filter.reached"]')
    expect(
      root.querySelector('[data-testid="goals.filter.active"]')?.getAttribute('aria-pressed')
    ).toBe('true')

    reached?.click()
    await settle(harness, root)

    expect(api.listWithProjections).toHaveBeenLastCalledWith('reached')
    expect(reached?.getAttribute('aria-pressed')).toBe('true')
    expect(cards(root)).toEqual(['Laptop'])
  })

  it('test_reached_goals_and_goals_at_their_target_wear_the_reached_badge', async () => {
    const { harness, root } = await open({
      goals: [
        aGoalWithProjection({ id: 1, name: 'Emergency fund' }),
        aGoalWithProjection({ id: 2, name: 'Laptop' }, aReachedProjection({ goalId: 2 })),
      ],
    })

    const badges = [...root.querySelectorAll('[data-testid="goals.card"]')].map((card) =>
      text(card, '[data-testid="goals.card.badge"]')
    )
    expect(badges).toEqual(['', 'Reached'])
    expect(text(root, '[data-id="2"] [data-testid="goals.card.outlook"]')).toBe(
      'Target met: mark it as reached · Household'
    )

    root.querySelector<HTMLButtonElement>('[data-testid="goals.filter.reached"]')?.click()
    await settle(harness, root)

    expect(text(root, '[data-testid="goals.card.badge"]')).toBe('Reached')
    // Marked at 21:30 UTC on 2 Nov: 3 Nov in Brisbane.
    expect(text(root, '[data-testid="goals.card.outlook"]')).toBe('Reached on 3 Nov · Household')
  })

  it('test_an_empty_list_offers_to_create_the_first_goal', async () => {
    const { root } = await open({ goals: [] })

    expect(text(root, '[data-testid="goals.empty"] h2')).toBe('No savings goals yet')
    expect(root.querySelector('[data-testid="goals.empty.add"]')?.getAttribute('href')).toBe(
      '/goals/new'
    )
  })

  it('test_reorder_mode_moves_a_goal_with_the_arrows_and_saves_the_order', async () => {
    const { harness, root } = await open()

    root.querySelector<HTMLButtonElement>('[data-testid="goals.reorder"]')?.click()
    await harness.fixture.whenStable()
    root.querySelector<HTMLButtonElement>('[data-testid="goals.card.down"]')?.click()
    await harness.fixture.whenStable()

    expect(cards(root)).toEqual(['Holiday', 'Emergency fund', 'New bike'])
    expect(api.reorder).toHaveBeenCalledWith([2, 1, 3])
  })

  it('test_a_failed_load_offers_to_try_again', async () => {
    const { harness, root } = await open({ failFirst: true })
    expect(text(root, '[data-testid="goals.error"] h2')).toBe('Goals did not load')

    root.querySelector<HTMLButtonElement>('[data-testid="goals.error"] button')?.click()
    await settle(harness, root)

    expect(cards(root)).toHaveLength(3)
  })
})
