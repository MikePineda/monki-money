import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { aGoal, aProjection, anOpenEndedProjection } from '../../../../testing/goal-fixtures'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aMember, aUser, networkError } from '../../../../testing/session-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { GoalsApi } from '../data-access/goals.api'
import GoalsListPage from './goals-list.page'

@Component({ template: '<p data-testid="stub">stub</p>' })
class Stub {}

describe('GoalsListPage', () => {
  let api: {
    list: ReturnType<typeof vi.fn>
    projection: ReturnType<typeof vi.fn>
    reorder: ReturnType<typeof vi.fn>
  }

  async function open(options: { goals?: ReturnType<typeof aGoal>[]; failFirst?: boolean } = {}) {
    const active = options.goals ?? [
      aGoal({ id: 1, name: 'Emergency fund', userId: null }),
      aGoal({ id: 2, name: 'Holiday', userId: 1 }),
      aGoal({ id: 3, name: 'New bike', userId: 2 }),
    ]
    api = {
      list: vi.fn(async (status: string) =>
        status === 'active' ? active : [aGoal({ id: 9, name: 'Laptop', status: 'reached' })]
      ),
      projection: vi.fn(async (id: number) =>
        id === 3 ? anOpenEndedProjection({ goalId: id }) : aProjection({ goalId: id })
      ),
      reorder: vi.fn(async () => undefined),
    }
    if (options.failFirst) {
      api.list.mockRejectedValueOnce(networkError())
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
        {
          provide: HouseholdApi,
          useValue: {
            members: async () => [
              aMember({ userId: 1 }),
              aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'member' }),
            ],
          },
        },
        {
          provide: SessionStore,
          useValue: { user: signal(aUser({ id: 1 })), onClear: () => undefined },
        },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
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
    expect(api.list).toHaveBeenCalledWith('active')
  })

  it('test_filter_chips_show_reached_and_archived_goals', async () => {
    const { harness, root } = await open()
    const reached = root.querySelector<HTMLButtonElement>('[data-testid="goals.filter.reached"]')
    expect(
      root.querySelector('[data-testid="goals.filter.active"]')?.getAttribute('aria-pressed')
    ).toBe('true')

    reached?.click()
    await settle(harness, root)

    expect(api.list).toHaveBeenLastCalledWith('reached')
    expect(reached?.getAttribute('aria-pressed')).toBe('true')
    expect(cards(root)).toEqual(['Laptop'])
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
