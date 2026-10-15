import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { chartsI18nTesting } from '../../../../testing/charts-testing'
import { i18nTestingProviders } from '../../../../testing/i18n-testing'
import type { MonthValue } from '../../../domain/charts/projection'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { ChartFrameComponent } from '../chart-frame/chart-frame.component'
import { ChartFrameHarness } from '../chart-frame/chart-frame.harness'
import { ProjectionChartComponent } from './projection-chart.component'
import { ProjectionChartHarness } from './projection-chart.harness'

const HISTORY: MonthValue[] = [
  { x: '2026-05', valueCents: 400_000 },
  { x: '2026-06', valueCents: 460_000 },
  { x: '2026-07', valueCents: 525_000 },
  { x: '2026-08', valueCents: 580_000 },
  { x: '2026-09', valueCents: 650_000 },
  { x: '2026-10', valueCents: 712_000 },
]
const PROJECTION: MonthValue[] = [
  { x: '2026-11', valueCents: 775_000 },
  { x: '2026-12', valueCents: 840_000 },
  { x: '2027-01', valueCents: 905_000 },
  { x: '2027-02', valueCents: 970_000 },
  { x: '2027-03', valueCents: 1_035_000 },
  { x: '2027-04', valueCents: 1_100_000 },
]

@Component({
  imports: [ChartFrameComponent, ProjectionChartComponent],
  template: `
    <app-chart-frame title="Emergency fund">
      <app-projection-chart
        [history]="history"
        [projection]="projection"
        [thresholdCents]="threshold()"
        [horizon]="horizon()"
      />
    </app-chart-frame>
  `,
})
class Host {
  readonly history = HISTORY
  readonly projection = PROJECTION
  readonly threshold = signal<number | null>(1_000_000)
  readonly horizon = signal<string | null>(null)
}

describe('ProjectionChartComponent', () => {
  async function setup(options: { threshold?: number | null; horizon?: string | null } = {}) {
    TestBed.configureTestingModule({
      imports: [chartsI18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal('en-AU') }],
    })
    const fixture = TestBed.createComponent(Host)
    if (options.threshold !== undefined) {
      fixture.componentInstance.threshold.set(options.threshold)
    }
    if (options.horizon !== undefined) {
      fixture.componentInstance.horizon.set(options.horizon)
    }
    const loader = TestbedHarnessEnvironment.loader(fixture)
    const chart = await loader.getHarness(ProjectionChartHarness)
    const frame = await loader.getHarness(ChartFrameHarness)
    return { fixture, chart, frame, root: fixture.nativeElement as HTMLElement }
  }

  it('test_actual_months_are_solid_and_the_projection_is_the_only_dashed_mark', async () => {
    const { root } = await setup()
    const actual = root.querySelector('path[data-actual]')
    const projected = root.querySelector('path[data-projected]')

    expect(actual?.getAttribute('stroke-dasharray')).toBeNull()
    expect(projected?.getAttribute('stroke-dasharray')).toBe('4 4')
    expect(root.querySelectorAll('svg[role="img"] [stroke-dasharray]')).toHaveLength(1)
    expect((actual as SVGPathElement | null)?.style.stroke).toBe('var(--mark-neutral)')
  })

  it('test_the_goal_is_a_solid_labelled_line_and_its_month_gets_a_marker', async () => {
    const { root } = await setup()
    const threshold = root.querySelector('line.threshold')

    expect(threshold).not.toBeNull()
    expect(threshold?.getAttribute('stroke-dasharray')).toBeNull()
    expect(root.querySelector('text.threshold-label')?.textContent?.trim()).toBe('Goal $10,000')
    expect(root.querySelector('circle[data-crossing]')).not.toBeNull()
  })

  it('test_the_footnote_says_when_the_goal_is_reached_as_an_estimate', async () => {
    const { root } = await setup()

    expect(root.querySelector('[data-projection-note]')?.textContent?.trim()).toBe(
      'Reaches the goal in March 2027 (estimate).'
    )
  })

  it('test_a_goal_beyond_the_horizon_is_reported_in_words', async () => {
    const { root, chart } = await setup({ horizon: '2027-01' })

    expect((await chart.getXLabels()).at(-1)).toBe('Jan')
    expect(root.querySelector('circle[data-crossing]')).toBeNull()
    expect(root.querySelector('[data-projection-note]')?.textContent?.trim()).toBe(
      'At this pace the goal is reached in March 2027, after this chart ends.'
    )
  })

  it('test_a_goal_already_met_reads_as_actual', async () => {
    const { root } = await setup({ threshold: 500_000 })

    expect(root.querySelector('[data-projection-note]')?.textContent?.trim()).toBe(
      'Goal reached in July 2026.'
    )
  })

  it('test_without_a_goal_there_is_no_threshold_and_no_note', async () => {
    const { root } = await setup({ threshold: null })

    expect(root.querySelector('line.threshold')).toBeNull()
    expect(root.querySelector('[data-projection-note]')).toBeNull()
  })

  it('test_the_legend_tells_actual_from_projected', async () => {
    const { chart, root } = await setup()

    expect(await chart.getLegendLabels()).toEqual(['Actual', 'Projected (estimate)'])
    expect(root.querySelector('[data-legend-key="dashed"]')).not.toBeNull()
  })

  it('test_the_tooltip_marks_projected_months_as_estimates', async () => {
    const { chart } = await setup()
    const xs = await chart.getMarkerXs('actual')
    const step = (xs[1] ?? 0) - (xs[0] ?? 0)

    await chart.pointAt((xs[5] ?? 0) + step * 3)

    const tooltip = await chart.getTooltip()
    expect(await tooltip?.getHeading()).toBe('January 2027')
    expect(await tooltip?.getRows()).toEqual([
      { value: '$9,050.00', label: 'Projected (estimate)' },
    ])
  })

  it('test_the_table_marks_estimates_and_ends_with_the_goal', async () => {
    const { frame } = await setup()

    await frame.toggleTable()
    const table = await frame.getTable()

    expect(table.headers).toEqual(['Month', 'Amount'])
    expect(table.rows[5]).toEqual(['Oct 2026', '$7,120.00'])
    expect(table.rows[6]).toEqual(['Nov 2026', '$7,750.00 (estimate)'])
    expect(table.total).toEqual(['Goal', '$10,000.00'])
  })

  it('test_the_summary_reads_the_latest_value_and_the_projection', async () => {
    const { chart } = await setup()

    expect(await chart.getSummary()).toBe(
      '$7,120.00 in October 2026, projected $11,000.00 by April 2027. ' +
        'Reaches the goal in March 2027 (estimate).'
    )
  })
})
