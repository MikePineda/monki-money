import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { chartsI18nTesting } from '../../../../testing/charts-testing'
import { i18nTestingProviders } from '../../../../testing/i18n-testing'
import type { BarListDatum } from '../../../domain/charts/bar-list'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { ChartFrameComponent } from '../chart-frame/chart-frame.component'
import { ChartFrameHarness } from '../chart-frame/chart-frame.harness'
import { BarListComponent } from './bar-list.component'
import { BarListHarness } from './bar-list.harness'

const SPENDING: BarListDatum[] = [
  {
    id: 'food',
    label: 'Food',
    valueCents: 84_230,
    children: [
      { id: 'groceries', label: 'Groceries', valueCents: 61_240 },
      { id: 'eating-out', label: 'Eating out', valueCents: 22_990 },
    ],
  },
  { id: 'other', label: 'Other', valueCents: 27_720, other: true },
  { id: 'housing', label: 'Housing', valueCents: 162_000 },
  { id: 'transport', label: 'Transport', valueCents: 21_460 },
]

@Component({
  imports: [BarListComponent, ChartFrameComponent],
  template: `
    <app-chart-frame title="Spending by category">
      <app-bar-list [data]="data()" [barHeight]="barHeight()" [(expanded)]="expanded" />
    </app-chart-frame>
  `,
})
class Host {
  readonly data = signal<readonly BarListDatum[]>(SPENDING)
  readonly expanded = signal<readonly string[]>([])
  readonly barHeight = signal(12)
}

describe('BarListComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [chartsI18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal('en-AU') }],
    })
    const fixture = TestBed.createComponent(Host)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    const list = await loader.getHarness(BarListHarness)
    const frame = await loader.getHarness(ChartFrameHarness)
    const settle = async () => {
      fixture.detectChanges()
      await fixture.whenStable()
    }
    return { fixture, list, frame, settle, host: fixture.componentInstance }
  }

  it('test_rows_show_name_and_full_amount_sorted_with_other_last', async () => {
    const { list } = await setup()

    expect(await list.getRows()).toEqual([
      { label: 'Housing', amount: '$1,620.00', depth: 0, expanded: null },
      { label: 'Food', amount: '$842.30', depth: 0, expanded: false },
      { label: 'Transport', amount: '$214.60', depth: 0, expanded: null },
      { label: 'Other', amount: '$277.20', depth: 0, expanded: null },
    ])
  })

  it('test_bars_are_token_coloured_with_lengths_on_one_scale', async () => {
    const { fixture } = await setup()
    const bars = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-bar]'),
    ]

    expect(bars.map((bar) => bar.style.backgroundColor)).toEqual([
      'var(--mark-neutral)',
      'var(--mark-neutral)',
      'var(--mark-neutral)',
      'var(--mark-muted)',
    ])
    expect(bars[0]?.style.width).toBe('max(2px, 100%)')
    expect(bars[1]?.style.width).toBe(`max(2px, ${(84_230 / 162_000) * 100}%)`)
    expect(bars[0]?.className).toContain('rounded-r-sm')
  })

  it('test_tapping_a_group_expands_its_children_and_updates_the_model', async () => {
    const { list, host } = await setup()

    await list.toggle('Food')

    expect(host.expanded()).toEqual(['food'])
    const rows = await list.getRows()
    expect(rows.map((row) => [row.label, row.depth])).toEqual([
      ['Housing', 0],
      ['Food', 0],
      ['Groceries', 1],
      ['Eating out', 1],
      ['Transport', 0],
      ['Other', 0],
    ])
    expect(rows[1]?.expanded).toBe(true)
  })

  it('test_tapping_an_expanded_group_collapses_it', async () => {
    const { list, host, settle } = await setup()
    host.expanded.set(['food'])
    await settle()

    await list.toggle('Food')

    expect(host.expanded()).toEqual([])
    expect((await list.getRows()).some((row) => row.depth === 1)).toBe(false)
  })

  it('test_bar_thickness_is_capped_at_24px_and_children_are_thinner', async () => {
    const { fixture, host, settle } = await setup()
    host.barHeight.set(40)
    host.expanded.set(['food'])
    await settle()
    const root = fixture.nativeElement as HTMLElement

    expect(root.querySelector<HTMLElement>('[data-depth="0"] [data-bar-track]')?.style.height).toBe(
      '24px'
    )
    expect(root.querySelector<HTMLElement>('[data-depth="1"] [data-bar-track]')?.style.height).toBe(
      '16px'
    )
  })

  it('test_table_view_lists_every_group_and_child_with_the_same_amounts_and_a_total', async () => {
    const { list, frame } = await setup()
    const amounts = (await list.getRows()).map((row) => row.amount)

    await frame.toggleTable()
    const table = await frame.getTable()

    expect(table.headers).toEqual(['Name', 'Amount', 'Share'])
    expect(table.rows).toEqual([
      ['Housing', '$1,620.00', '55%'],
      ['Food', '$842.30', '29%'],
      ['Groceries', '$612.40', '21%'],
      ['Eating out', '$229.90', '8%'],
      ['Transport', '$214.60', '7%'],
      ['Other', '$277.20', '9%'],
    ])
    expect(table.total).toEqual(['Total', '$2,954.10', '100%'])
    for (const amount of amounts) {
      expect(table.rows.some((row) => row[1] === amount)).toBe(true)
    }
  })

  it('test_summary_names_the_count_the_total_and_the_largest', async () => {
    const { list } = await setup()

    expect(await list.getSummary()).toBe(
      '4 items, $2,954.10 in total. Largest: Housing, $1,620.00.'
    )
  })

  it('test_negative_net_amounts_keep_their_value_but_draw_no_bar', async () => {
    const { list, host, settle, fixture } = await setup()
    host.data.set([
      { label: 'Refunds', valueCents: -4_000 },
      { label: 'Food', valueCents: 10_000 },
    ])
    await settle()

    expect((await list.getRows()).map((row) => row.amount)).toEqual(['$100.00', '−$40.00'])
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-bar]')).toHaveLength(1)
  })
})
