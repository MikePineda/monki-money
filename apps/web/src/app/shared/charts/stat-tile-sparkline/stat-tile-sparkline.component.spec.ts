import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { chartsI18nTesting } from '../../../../testing/charts-testing'
import { i18nTestingProviders } from '../../../../testing/i18n-testing'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { StatTileComponent } from '../../ui/stat-tile/stat-tile.component'
import { StatTileSparklineComponent } from './stat-tile-sparkline.component'

@Component({
  imports: [StatTileComponent, StatTileSparklineComponent],
  template: `
    <app-stat-tile label="Spent" [valueCents]="328_450">
      <app-stat-tile-sparkline [values]="values()" />
    </app-stat-tile>
  `,
})
class Host {
  readonly values = signal<readonly (number | null)[]>([
    312_040, 298_550, 351_260, 287_400, 357_120, 328_450,
  ])
}

describe('StatTileSparklineComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [chartsI18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal('en-AU') }],
    })
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const settle = async () => {
      fixture.detectChanges()
      await fixture.whenStable()
    }
    return { fixture, settle, root: fixture.nativeElement as HTMLElement }
  }

  it('test_sits_inside_the_stat_tile_under_its_value', async () => {
    const { root } = await setup()

    expect(root.querySelector('app-stat-tile app-stat-tile-sparkline svg')).not.toBeNull()
  })

  it('test_the_line_is_the_muted_mark_and_the_current_period_a_neutral_8px_dot', async () => {
    const { root } = await setup()
    const line = root.querySelector<SVGPathElement>('app-stat-tile-sparkline path')
    const dot = root.querySelector<SVGCircleElement>('circle[data-current]')

    expect(line?.style.stroke).toBe('var(--mark-muted)')
    expect(line?.getAttribute('class')).toContain('series-line')
    expect(dot?.style.fill).toBe('var(--mark-neutral)')
    expect(dot?.getAttribute('r')).toBe('4')
    expect(dot?.getAttribute('class')).toContain('marker')
  })

  it('test_names_the_trend_in_words', async () => {
    const { root } = await setup()
    const svg = root.querySelector('app-stat-tile-sparkline svg')
    const summary = root.querySelector(`#${svg?.getAttribute('aria-labelledby')}`)

    expect(svg?.getAttribute('role')).toBe('img')
    expect(summary?.textContent?.trim()).toBe('6 months: from $3,120 to $3,285.')
  })

  it('test_no_values_render_nothing', async () => {
    const { root, fixture, settle } = await setup()
    fixture.componentInstance.values.set([])
    await settle()

    expect(root.querySelector('app-stat-tile-sparkline svg')).toBeNull()
  })
})
