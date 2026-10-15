import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { provideRouter } from '@angular/router'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { BarListHarness } from '../../shared/charts/bar-list/bar-list.harness'
import { ChartFrameHarness } from '../../shared/charts/chart-frame/chart-frame.harness'
import chartsEn from '../../shared/charts/i18n/en.json'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { ChipHarness } from '../../shared/ui/chip/chip.harness'
import kitEn from '../i18n/en.json'
import KitChartsPage from './kit-charts.page'

describe('KitChartsPage', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'kit/en': kitEn, 'charts/en': chartsEn } })],
      providers: [
        i18nTestingProviders(),
        provideRouter([]),
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const fixture = TestBed.createComponent(KitChartsPage)
    await fixture.whenStable()
    return { fixture, loader: TestbedHarnessEnvironment.loader(fixture) }
  }

  it('test_shows_every_chart_and_every_frame_state', async () => {
    const { loader } = await setup()
    const frames = await loader.getAllHarnesses(ChartFrameHarness)
    const states = await Promise.all(frames.map((frame) => frame.getState()))

    expect(await frames[0]?.getTitle()).toBe('Spending by category')
    expect(await frames[0]?.getSubtitle()).toBe('October · 6 categories')
    expect(new Set(states)).toEqual(new Set(['ready', 'loading', 'reloading', 'empty', 'error']))
    expect(await frames[6]?.isShowingTable()).toBe(true)
  })

  it('test_the_spending_list_opens_with_food_expanded', async () => {
    const { loader } = await setup()
    const list = await loader.getHarness(BarListHarness)

    const labels = (await list.getRows()).map((row) => row.label)
    expect(labels.slice(0, 5)).toEqual(['Housing', 'Food', 'Groceries', 'Eating out', 'Café'])
  })

  it('test_the_state_switch_drives_the_gallery_frames', async () => {
    const { loader } = await setup()
    const empty = await loader.getHarness(ChipHarness.with({ text: 'Empty' }))

    await empty.click()

    const frames = await loader.getAllHarnesses(ChartFrameHarness)
    const states = await Promise.all(frames.slice(0, 6).map((frame) => frame.getState()))
    expect(states).toEqual(Array(6).fill('empty'))
    expect(await frames[0]?.getMessage()).toBe('No spending in October yet.')
  })
})
