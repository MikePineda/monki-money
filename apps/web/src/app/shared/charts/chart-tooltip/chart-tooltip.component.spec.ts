import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { ChartTooltipComponent, type TooltipRow } from './chart-tooltip.component'
import { ChartTooltipHarness } from './chart-tooltip.harness'

const ROWS: TooltipRow[] = [
  { id: 'you', label: 'You', value: '$1,510.40', color: 'person-a' },
  { id: 'partner', label: 'Your partner', value: '$1,018.20', color: 'person-b' },
]

describe('ChartTooltipComponent', () => {
  async function setup(anchorX: number) {
    const fixture = TestBed.createComponent(ChartTooltipComponent)
    fixture.componentRef.setInput('heading', 'Oct 2026')
    fixture.componentRef.setInput('rows', ROWS)
    fixture.componentRef.setInput('anchorX', anchorX)
    fixture.componentRef.setInput('containerWidth', 320)
    await fixture.whenStable()
    const tooltip = await TestbedHarnessEnvironment.harnessForFixture(fixture, ChartTooltipHarness)
    return { tooltip, host: fixture.nativeElement as HTMLElement }
  }

  it('test_lists_every_series_with_the_value_leading', async () => {
    const { tooltip, host } = await setup(100)

    expect(await tooltip.getHeading()).toBe('Oct 2026')
    expect(await tooltip.getRows()).toEqual([
      { value: '$1,510.40', label: 'You' },
      { value: '$1,018.20', label: 'Your partner' },
    ])
    const first = host.querySelector('[data-tooltip-row]')
    expect(first?.firstElementChild?.nextElementSibling?.hasAttribute('data-tooltip-value')).toBe(
      true
    )
  })

  it('test_keys_are_token_coloured_dots_and_text_stays_in_ink', async () => {
    const { host } = await setup(100)
    const dot = host.querySelector<HTMLElement>('[data-tooltip-row] span')

    expect(dot?.style.backgroundColor).toBe('var(--person-a)')
    expect(host.querySelector('[data-tooltip-value]')?.className).toContain('text-ink-1')
  })

  it('test_sits_right_of_an_anchor_on_the_left_half', async () => {
    const { tooltip, host } = await setup(100)

    expect(await tooltip.getSide()).toBe('right')
    expect(host.style.left).toBe('112px')
    expect(host.style.right).toBe('')
  })

  it('test_sits_left_of_an_anchor_on_the_right_half', async () => {
    const { tooltip, host } = await setup(300)

    expect(await tooltip.getSide()).toBe('left')
    expect(host.style.right).toBe('32px')
    expect(host.style.left).toBe('')
  })

  it('test_never_takes_pointer_events', async () => {
    const { host } = await setup(100)

    expect(host.className).toContain('pointer-events-none')
  })
})
