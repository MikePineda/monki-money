import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { StatTileComponent } from './stat-tile.component'

describe('StatTileComponent', () => {
  async function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(StatTileComponent)
    for (const [name, value] of Object.entries({
      label: 'Spending',
      valueCents: 226340,
      ...inputs,
    })) {
      fixture.componentRef.setInput(name, value)
    }
    await fixture.whenStable()
    return fixture.nativeElement as HTMLElement
  }

  it('test_shows_the_label_and_a_whole_dollar_value', async () => {
    const tile = await render({})

    expect(tile.textContent).toContain('Spending')
    expect(tile.querySelector('app-amount-display')?.textContent?.trim()).toBe('$2,263')
  })

  it('test_favourable_change_uses_the_good_arrow_and_words', async () => {
    const tile = await render({ trend: 'down', favourable: true, deltaText: '9% less' })

    const icon = tile.querySelector('app-icon') as HTMLElement
    expect(icon.className).toContain('text-status-good')
    expect(icon.querySelector('[data-icon="arrow-down-right"]')).not.toBeNull()
    expect(tile.textContent).toContain('9% less')
  })

  it('test_unfavourable_change_uses_the_serious_arrow', async () => {
    const tile = await render({ trend: 'up', favourable: false, deltaText: '12% more' })

    expect((tile.querySelector('app-icon') as HTMLElement).className).toContain(
      'text-status-serious'
    )
  })

  it('test_no_delta_line_without_delta_text', async () => {
    const tile = await render({})

    expect(tile.querySelector('app-icon')).toBeNull()
  })

  it('test_projects_a_trend_under_the_figures', async () => {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(TileWithTrend)
    await fixture.whenStable()
    const tile = fixture.nativeElement.querySelector('app-stat-tile') as HTMLElement

    expect(tile.lastElementChild?.getAttribute('data-testid')).toBe('trend')
  })
})

@Component({
  imports: [StatTileComponent],
  template: `<app-stat-tile label="Spent" [valueCents]="100"
    ><i data-testid="trend"></i
  ></app-stat-tile>`,
})
class TileWithTrend {}
