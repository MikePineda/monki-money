import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { chartsI18nTesting } from '../../../../testing/charts-testing'
import { i18nTestingProviders } from '../../../../testing/i18n-testing'
import { ChartTableSource, type ChartTable } from '../chart-table'
import { ChartFrameComponent, type ChartState, type ChartView } from './chart-frame.component'
import { ChartFrameHarness } from './chart-frame.harness'

@Component({
  selector: 'app-fake-chart',
  template: '<p data-testid="fake.plot">plot</p>',
  providers: [{ provide: ChartTableSource, useExisting: FakeChart }],
})
class FakeChart implements ChartTableSource {
  readonly table = signal<ChartTable>({
    columns: [
      { label: 'Name', numeric: false },
      { label: 'Amount', numeric: true },
    ],
    rows: [
      { label: 'Housing', cells: ['$1,620.00'] },
      { label: 'Rent', cells: ['$1,620.00'], depth: 1 },
    ],
    total: { label: 'Total', cells: ['$1,620.00'] },
  })
}

@Component({
  imports: [ChartFrameComponent, FakeChart],
  template: `
    <app-chart-frame
      title="Spending by category"
      subtitle="October"
      [footnote]="footnote()"
      [state]="state()"
      [emptyText]="emptyText()"
      [(view)]="view"
      (retry)="retries.set(retries() + 1)"
    >
      <app-fake-chart />
    </app-chart-frame>
  `,
})
class Host {
  readonly state = signal<ChartState>('ready')
  readonly view = signal<ChartView>('chart')
  readonly footnote = signal('')
  readonly emptyText = signal('')
  readonly retries = signal(0)
}

describe('ChartFrameComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [chartsI18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(Host)
    const frame = await TestbedHarnessEnvironment.loader(fixture).getHarness(ChartFrameHarness)
    const host = fixture.componentInstance
    const settle = async () => {
      fixture.detectChanges()
      await fixture.whenStable()
    }
    return { fixture, frame, host, settle, root: fixture.nativeElement as HTMLElement }
  }

  it('test_shows_the_title_the_subtitle_and_the_chart_by_default', async () => {
    const { frame } = await setup()

    expect(await frame.getTitle()).toBe('Spending by category')
    expect(await frame.getSubtitle()).toBe('October')
    expect(await frame.isPlotVisible()).toBe(true)
    expect(await frame.isShowingTable()).toBe(false)
  })

  it('test_the_table_toggle_renders_an_accessible_table_of_the_chart_data', async () => {
    const { frame, host, root } = await setup()

    await frame.toggleTable()

    expect(host.view()).toBe('table')
    expect(await frame.isPlotVisible()).toBe(false)
    expect(await frame.getTable()).toEqual({
      caption: 'Spending by category',
      headers: ['Name', 'Amount'],
      rows: [
        ['Housing', '$1,620.00'],
        ['Rent', '$1,620.00'],
      ],
      total: ['Total', '$1,620.00'],
    })
    expect(root.querySelectorAll('tbody th[scope="row"]')).toHaveLength(2)
    const toggle = root.querySelector('button[data-chart-toggle]')
    expect(toggle?.getAttribute('aria-pressed')).toBe('true')
    expect(toggle?.getAttribute('aria-label')).toBe('Table view')
  })

  it('test_toggling_again_brings_the_chart_back', async () => {
    const { frame } = await setup()

    await frame.toggleTable()
    await frame.toggleTable()

    expect(await frame.isShowingTable()).toBe(false)
    expect(await frame.isPlotVisible()).toBe(true)
  })

  it('test_first_load_shows_a_skeleton_and_no_toggle', async () => {
    const { frame, host, settle, root } = await setup()

    host.state.set('loading')
    await settle()

    expect(await frame.getState()).toBe('loading')
    expect(root.querySelector('app-skeleton')).not.toBeNull()
    expect(await frame.canToggleTable()).toBe(false)
    expect(await frame.isPlotVisible()).toBe(false)
  })

  it('test_reloading_keeps_the_previous_frame_dimmed_and_busy', async () => {
    const { frame, host, settle, root } = await setup()

    host.state.set('reloading')
    await settle()

    expect(await frame.isPlotVisible()).toBe(true)
    expect(await frame.isBusy()).toBe(true)
    expect(root.querySelector('[data-chart-body]')?.className).toContain('opacity-60')
    expect(root.querySelector('app-skeleton')).toBeNull()
  })

  it('test_empty_state_says_so_with_the_default_or_a_custom_text', async () => {
    const { frame, host, settle } = await setup()

    host.state.set('empty')
    await settle()
    expect(await frame.getMessage()).toBe('Nothing to chart for this period yet.')

    host.emptyText.set('No spending in October yet.')
    await settle()
    expect(await frame.getMessage()).toBe('No spending in October yet.')
    expect(await frame.canToggleTable()).toBe(false)
  })

  it('test_error_state_explains_and_offers_a_retry', async () => {
    const { frame, host, settle } = await setup()

    host.state.set('error')
    await settle()
    await frame.retry()

    expect(await frame.getMessage()).toBe("This chart couldn't load.")
    expect(host.retries()).toBe(1)
  })

  it('test_footnote_renders_under_the_plot', async () => {
    const { frame, host, settle } = await setup()

    host.footnote.set('Estimates use the last 3 months.')
    await settle()

    expect(await frame.getFootnote()).toBe('Estimates use the last 3 months.')
  })
})
