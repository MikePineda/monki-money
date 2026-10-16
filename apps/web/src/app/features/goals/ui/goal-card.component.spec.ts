import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { aGoal, aProjection, anOpenEndedProjection } from '../../../../testing/goal-fixtures'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import type { GoalRow } from '../goals-list.store'
import { provideGoalsScope } from '../goals.scope'
import { GoalCardComponent } from './goal-card.component'

@Component({
  imports: [GoalCardComponent],
  providers: [provideGoalsScope()],
  template: `
    <app-goal-card
      [row]="row()"
      [ownerLabel]="owner()"
      [reorderMode]="reorder()"
      [canMoveUp]="false"
      (moved)="moves.push($event)"
    />
  `,
})
class Host {
  readonly row = signal<GoalRow>({ goal: aGoal(), projection: aProjection() })
  readonly owner = signal('Household')
  readonly reorder = signal(false)
  readonly moves: number[] = []
}

describe('GoalCardComponent', () => {
  async function render(row?: GoalRow, options: { reorder?: boolean } = {}) {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([]),
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const fixture = TestBed.createComponent(Host)
    if (row) {
      fixture.componentInstance.row.set(row)
    }
    fixture.componentInstance.reorder.set(options.reorder ?? false)
    const root = fixture.nativeElement as HTMLElement
    await fixture.whenStable()
    return { fixture, root }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  it('test_shows_saved_against_target_with_a_progress_track_and_when_it_is_reached', async () => {
    const { root } = await render()

    expect(text(root, '[data-testid="goals.card.name"]')).toBe('Emergency fund')
    expect(text(root, '[data-testid="goals.card.progress"]')).toBe('$1,200.00 of $5,000.00')
    expect(root.querySelector('app-progress-track')?.getAttribute('aria-valuenow')).toBe('24')
    expect(root.querySelector('app-progress-track')?.getAttribute('aria-label')).toBe(
      'Emergency fund: 24% saved'
    )
    expect(text(root, '[data-testid="goals.card.outlook"]')).toBe('Projected June 2027 · Household')
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/goals/1')
  })

  it('test_an_open_ended_goal_needs_a_plan', async () => {
    const { root } = await render({ goal: aGoal(), projection: anOpenEndedProjection() })

    expect(text(root, '[data-testid="goals.card.outlook"]')).toBe('Needs a plan · Household')
  })

  it('test_a_goal_with_a_date_says_on_track_or_behind_with_an_icon', async () => {
    const onTrack = await render({
      goal: aGoal({ targetDate: '2027-12-31' }),
      projection: aProjection({ onTrack: true }),
    })
    expect(text(onTrack.root, '[data-testid="goals.card.pace"]')).toBe('On track')
    expect(
      onTrack.root.querySelector('[data-testid="goals.card.pace"] app-icon')?.className
    ).toContain('text-status-good')

    TestBed.resetTestingModule()
    const behind = await render({
      goal: aGoal({ targetDate: '2027-01-31' }),
      projection: aProjection({ onTrack: false }),
    })
    expect(text(behind.root, '[data-testid="goals.card.pace"]')).toBe('Behind')
    expect(
      behind.root.querySelector('[data-testid="goals.card.pace"] app-icon')?.className
    ).toContain('text-status-warning')
  })

  it('test_no_target_date_means_no_pace_mark', async () => {
    const { root } = await render()

    expect(root.querySelector('[data-testid="goals.card.pace"]')).toBeNull()
  })

  it('test_a_reached_goal_reads_as_reached', async () => {
    const { root } = await render({
      goal: aGoal({ status: 'reached' }),
      projection: aProjection({ savedCents: 500_000, remainingCents: 0, monthsToGoal: 0 }),
    })

    expect(text(root, '[data-testid="goals.card.outlook"]')).toBe('Reached · Household')
    expect(text(root, '[data-testid="goals.card.progress"]')).toBe('$5,000.00 of $5,000.00')
  })

  it('test_without_a_projection_it_falls_back_to_the_starting_amount', async () => {
    const { root } = await render({ goal: aGoal(), projection: null })

    expect(text(root, '[data-testid="goals.card.progress"]')).toBe('$1,200.00 of $5,000.00')
    expect(text(root, '[data-testid="goals.card.outlook"]')).toBe(
      'Projection unavailable · Household'
    )
  })

  it('test_reorder_mode_offers_up_and_down_buttons', async () => {
    const { fixture, root } = await render(undefined, { reorder: true })
    const up = root.querySelector<HTMLButtonElement>('[data-testid="goals.card.up"]')
    const down = root.querySelector<HTMLButtonElement>('[data-testid="goals.card.down"]')

    expect(up?.getAttribute('aria-label')).toBe('Move Emergency fund up')
    expect(up?.disabled).toBe(true)
    down?.click()

    expect(fixture.componentInstance.moves).toEqual([1])
  })
})
