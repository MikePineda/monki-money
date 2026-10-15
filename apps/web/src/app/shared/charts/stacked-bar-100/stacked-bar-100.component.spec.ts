import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { chartsI18nTesting } from '../../../../testing/charts-testing'
import { i18nTestingProviders } from '../../../../testing/i18n-testing'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { ChartFrameComponent } from '../chart-frame/chart-frame.component'
import { ChartFrameHarness } from '../chart-frame/chart-frame.harness'
import { ChartTooltipHarness } from '../chart-tooltip/chart-tooltip.harness'
import { StackedBar100Component, type StackedBarDatum } from './stacked-bar-100.component'

const WHO_PAID: StackedBarDatum[] = [
  { id: 'you', label: 'You', valueCents: 151_040, color: 'person-a' },
  { id: 'partner', label: 'Your partner', valueCents: 101_820, color: 'person-b' },
  { id: 'shared', label: 'Shared', valueCents: 75_600, color: 'muted' },
]

@Component({
  imports: [ChartFrameComponent, StackedBar100Component],
  template: `
    <app-chart-frame title="Who paid">
      <app-stacked-bar-100 [data]="data()" [barHeight]="barHeight()" />
    </app-chart-frame>
  `,
})
class Host {
  readonly data = signal<readonly StackedBarDatum[]>(WHO_PAID)
  readonly barHeight = signal(24)
}

describe('StackedBar100Component', () => {
  async function setup(data: readonly StackedBarDatum[] = WHO_PAID) {
    TestBed.configureTestingModule({
      imports: [chartsI18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal('en-AU') }],
    })
    const fixture = TestBed.createComponent(Host)
    fixture.componentInstance.data.set(data)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    const frame = await loader.getHarness(ChartFrameHarness)
    const root = fixture.nativeElement as HTMLElement
    const settle = async () => {
      fixture.detectChanges()
      await fixture.whenStable()
    }
    return { fixture, loader, frame, root, settle, host: fixture.componentInstance }
  }

  function segments(root: HTMLElement): SVGElement[] {
    return [...root.querySelectorAll<SVGElement>('[data-segment]')]
  }

  it('test_segments_fill_the_bar_with_2px_gaps_in_their_entity_colours', async () => {
    const { root } = await setup()
    const marks = segments(root)

    expect(marks.map((mark) => mark.style.fill)).toEqual([
      'var(--person-a)',
      'var(--person-b)',
      'var(--mark-muted)',
    ])
    const first = marks[0]
    const second = marks[1]
    const firstEnd = Number(first?.getAttribute('x')) + Number(first?.getAttribute('width'))
    expect(Number(second?.getAttribute('x')) - firstEnd).toBeCloseTo(2)
  })

  it('test_only_the_last_segment_is_rounded_at_the_data_end', async () => {
    const { root } = await setup()
    const marks = segments(root)

    expect(marks.map((mark) => mark.tagName.toLowerCase())).toEqual(['rect', 'rect', 'path'])
    expect(marks[2]?.getAttribute('d')).toContain('A4,4')
    expect(marks[2]?.getAttribute('d')).toMatch(/H\d+(\.\d+)?Z$/)
  })

  it('test_the_bar_is_never_thicker_than_24px', async () => {
    const { root, host, settle } = await setup()
    host.barHeight.set(40)
    await settle()

    expect(segments(root)[0]?.getAttribute('height')).toBe('24')
  })

  it('test_the_legend_always_lists_every_part_with_percentage_and_amount', async () => {
    const { root } = await setup()
    const items = [...root.querySelectorAll('[data-legend-item]')]

    const text = (item: Element, part: string) =>
      item.querySelector(`[data-legend-${part}]`)?.textContent?.trim()

    expect(
      items.map((item) => [text(item, 'label'), text(item, 'detail'), text(item, 'value')])
    ).toEqual([
      ['You', '46%', '$1,510.40'],
      ['Your partner', '31%', '$1,018.20'],
      ['Shared', '23%', '$756.00'],
    ])
  })

  it('test_a_zero_part_keeps_its_legend_entry_but_draws_no_segment', async () => {
    const { root } = await setup([
      { id: 'you', label: 'You', valueCents: 50_000, color: 'person-a' },
      { id: 'partner', label: 'Your partner', valueCents: 0, color: 'person-b' },
    ])

    expect(segments(root)).toHaveLength(1)
    expect(root.querySelectorAll('[data-legend-item]')).toHaveLength(2)
  })

  it('test_hovering_a_segment_shows_its_value_and_leaving_clears_it', async () => {
    const { root, loader, settle } = await setup()
    const hit = root.querySelectorAll('[data-segment-hit]')[1]

    hit?.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }))
    await settle()
    const tooltip = await loader.getHarness(ChartTooltipHarness)
    expect(await tooltip.getRows()).toEqual([{ value: '$1,018.20', label: 'Your partner · 31%' }])

    hit?.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }))
    await settle()
    expect(await loader.getHarnessOrNull(ChartTooltipHarness)).toBeNull()
  })

  it('test_segment_hit_areas_are_at_least_44px_tall', async () => {
    const { root } = await setup()

    for (const hit of root.querySelectorAll('[data-segment-hit]')) {
      expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(44)
    }
  })

  it('test_the_table_view_has_the_same_amounts_and_shares_and_a_total', async () => {
    const { frame } = await setup()

    await frame.toggleTable()

    expect(await frame.getTable()).toEqual({
      caption: 'Who paid',
      headers: ['Name', 'Amount', 'Share'],
      rows: [
        ['You', '$1,510.40', '46%'],
        ['Your partner', '$1,018.20', '31%'],
        ['Shared', '$756.00', '23%'],
      ],
      total: ['Total', '$3,284.60', '100%'],
    })
  })

  it('test_the_summary_reads_every_part_in_order', async () => {
    const { root } = await setup()
    const svg = root.querySelector('svg[role="img"]')
    const summary = root.querySelector(`#${svg?.getAttribute('aria-labelledby')}`)

    expect(summary?.textContent?.trim()).toBe(
      'You 46% ($1,510.40), Your partner 31% ($1,018.20) and Shared 23% ($756.00).'
    )
  })
})
