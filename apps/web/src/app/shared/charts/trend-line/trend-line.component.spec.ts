import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { chartsI18nTesting } from '../../../../testing/charts-testing'
import { i18nTestingProviders } from '../../../../testing/i18n-testing'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { ChartFrameComponent } from '../chart-frame/chart-frame.component'
import { ChartFrameHarness } from '../chart-frame/chart-frame.harness'
import { TrendLineComponent, type TrendDatum, type TrendSeries } from './trend-line.component'
import { TrendLineHarness } from './trend-line.harness'

const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

function datum(
  values: Record<string, readonly (number | null)[]>
): (x: string, index: number) => TrendDatum {
  return (x, index) => ({
    x,
    series: Object.entries(values).map(([id, list]) => ({ id, valueCents: list[index] ?? null })),
  })
}

const SPENDING: TrendSeries[] = [{ id: 'spend', label: 'Spending' }]
const SPENDING_DATA = MONTHS.map(
  datum({ spend: [312_040, 298_550, 351_260, 287_400, 357_120, 328_450] })
)

const PEOPLE: TrendSeries[] = [
  { id: 'you', label: 'You', color: 'person-a' },
  { id: 'partner', label: 'Your partner', color: 'person-b' },
]
const PEOPLE_DATA = MONTHS.map(
  datum({
    you: [162_040, 150_000, 171_020, 140_000, 180_000, 151_040],
    partner: [98_000, 101_550, 180_240, 97_400, 120_320, 101_820],
  })
)

@Component({
  imports: [ChartFrameComponent, TrendLineComponent],
  template: `
    <app-chart-frame title="Trend">
      <app-trend-line [series]="series()" [data]="data()" />
    </app-chart-frame>
  `,
})
class Host {
  readonly series = signal<readonly TrendSeries[]>(SPENDING)
  readonly data = signal<readonly TrendDatum[]>(SPENDING_DATA)
}

describe('TrendLineComponent', () => {
  async function setup(series = SPENDING, data = SPENDING_DATA) {
    TestBed.configureTestingModule({
      imports: [chartsI18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal('en-AU') }],
    })
    const fixture = TestBed.createComponent(Host)
    fixture.componentInstance.series.set(series)
    fixture.componentInstance.data.set(data)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    const chart = await loader.getHarness(TrendLineHarness)
    const frame = await loader.getHarness(ChartFrameHarness)
    return { fixture, chart, frame, root: fixture.nativeElement as HTMLElement }
  }

  it('test_one_series_is_a_neutral_2px_line_with_ringed_markers_and_no_legend', async () => {
    const { chart, root } = await setup()
    const path = root.querySelector<SVGPathElement>('[data-series="spend"] path')
    const markers = root.querySelectorAll('[data-series="spend"] circle.marker')

    expect(path?.style.stroke).toBe('var(--mark-neutral)')
    expect(path?.getAttribute('class')).toContain('series-line')
    expect(markers).toHaveLength(6)
    expect([...markers].every((marker) => Number(marker.getAttribute('r')) >= 4)).toBe(true)
    expect(await chart.getLegendLabels()).toEqual([])
  })

  it('test_one_value_axis_with_compact_money_ticks_and_month_labels', async () => {
    const { chart, root } = await setup()

    expect(await chart.getTickLabels()).toEqual(['$0', '$2k', '$4k'])
    expect(await chart.getXLabels()).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct'])
    expect(root.querySelectorAll('line.baseline')).toHaveLength(1)
    expect(root.querySelectorAll('line.gridline')).toHaveLength(2)
  })

  it('test_the_current_month_is_labelled_at_the_end_of_the_line', async () => {
    const { chart } = await setup()

    expect(await chart.getEndLabels()).toEqual(['$3,285'])
  })

  it('test_the_crosshair_snaps_to_the_nearest_month_and_the_tooltip_lists_every_series', async () => {
    const { chart } = await setup(PEOPLE, PEOPLE_DATA)
    const xs = await chart.getMarkerXs('you')

    await chart.pointAt((xs[2] ?? 0) + 20)

    expect(await chart.getCrosshairX()).toBe(xs[2])
    const tooltip = await chart.getTooltip()
    expect(await tooltip?.getHeading()).toBe('July 2026')
    expect(await tooltip?.getRows()).toEqual([
      { value: '$1,710.20', label: 'You' },
      { value: '$1,802.40', label: 'Your partner' },
    ])
  })

  it('test_pointing_between_months_picks_the_closer_one', async () => {
    const { chart } = await setup()
    const xs = await chart.getMarkerXs('spend')
    const midpoint = ((xs[3] ?? 0) + (xs[4] ?? 0)) / 2

    await chart.pointAt(midpoint + 1)

    expect(await chart.getCrosshairX()).toBe(xs[4])
  })

  it('test_a_mouse_leaving_clears_the_readout_but_a_touch_keeps_it', async () => {
    const { chart } = await setup()
    const xs = await chart.getMarkerXs('spend')

    await chart.pointAt(xs[1] ?? 0, 'touch')
    await chart.leave('touch')
    expect(await chart.getCrosshairX()).toBe(xs[1])

    await chart.pointAt(xs[1] ?? 0)
    await chart.leave()
    expect(await chart.getCrosshairX()).toBeNull()
    expect(await chart.getTooltip()).toBeNull()
  })

  it('test_keyboard_focus_starts_on_the_current_month_and_arrows_walk_the_months', async () => {
    const { chart } = await setup()
    const xs = await chart.getMarkerXs('spend')

    await chart.focus()
    expect(await chart.getCrosshairX()).toBe(xs[5])

    await chart.pressKey('ArrowLeft')
    expect(await chart.getCrosshairX()).toBe(xs[4])
    expect(await (await chart.getTooltip())?.getRows()).toEqual([
      { value: '$3,571.20', label: 'Spending' },
    ])

    await chart.pressKey('Home')
    expect(await chart.getCrosshairX()).toBe(xs[0])
    await chart.pressKey('ArrowLeft')
    expect(await chart.getCrosshairX()).toBe(xs[0])

    await chart.pressKey('Escape')
    expect(await chart.getCrosshairX()).toBeNull()
  })

  it('test_several_series_get_a_line_legend_and_their_entity_colours', async () => {
    const { chart, root } = await setup(PEOPLE, PEOPLE_DATA)

    expect(await chart.getLegendLabels()).toEqual(['You', 'Your partner'])
    expect(root.querySelector('[data-legend-key="line"]')).not.toBeNull()
    expect(root.querySelector<SVGPathElement>('[data-series="partner"] path')?.style.stroke).toBe(
      'var(--person-b)'
    )
  })

  it('test_series_without_a_colour_take_categorical_slots_in_order', async () => {
    const { root } = await setup(
      [
        { id: 'you', label: 'A' },
        { id: 'partner', label: 'B' },
      ],
      PEOPLE_DATA
    )

    expect(root.querySelector<SVGPathElement>('[data-series="you"] path')?.style.stroke).toBe(
      'var(--series-1)'
    )
    expect(root.querySelector<SVGPathElement>('[data-series="partner"] path')?.style.stroke).toBe(
      'var(--series-2)'
    )
  })

  it('test_the_table_view_has_a_row_per_month_and_a_column_per_series', async () => {
    const { frame } = await setup(PEOPLE, PEOPLE_DATA)

    await frame.toggleTable()
    const table = await frame.getTable()

    expect(table.headers).toEqual(['Month', 'You', 'Your partner'])
    expect(table.rows[0]).toEqual(['May 2026', '$1,620.40', '$980.00'])
    expect(table.rows).toHaveLength(6)
    expect(table.total).toEqual(['Total', '$9,541.00', '$6,993.30'])
  })

  it('test_summary_describes_each_series_in_words', async () => {
    const { chart } = await setup()

    expect(await chart.getSummary()).toBe(
      'Spending: $3,120.40 in May, $3,284.50 in October, highest $3,571.20 in September.'
    )
  })

  it('test_a_missing_month_breaks_the_line_and_reads_as_a_dash_in_the_table', async () => {
    const gappy = MONTHS.map(datum({ spend: [312_040, null, 351_260, 287_400, 357_120, 328_450] }))
    const { frame, root } = await setup(SPENDING, gappy)

    expect(root.querySelectorAll('[data-series="spend"] circle.marker')).toHaveLength(5)
    expect(
      root.querySelector('[data-series="spend"] path')?.getAttribute('d')?.match(/M/g)
    ).toHaveLength(2)

    await frame.toggleTable()
    expect((await frame.getTable()).rows[1]).toEqual(['June 2026', '—'])
  })
})
