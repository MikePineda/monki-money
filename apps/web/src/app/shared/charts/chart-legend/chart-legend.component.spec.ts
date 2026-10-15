import { TestBed } from '@angular/core/testing'
import { ChartLegendComponent, type LegendItem } from './chart-legend.component'

const PEOPLE: LegendItem[] = [
  { id: 'you', label: 'You', color: 'person-a', value: '$1,510.40', detail: '46%' },
  { id: 'partner', label: 'Your partner', color: 'person-b', value: '$1,018.20', detail: '31%' },
  { id: 'shared', label: 'Shared', color: 'muted', value: '$756.00', detail: '23%' },
]

describe('ChartLegendComponent', () => {
  async function render(items: LegendItem[], layout: 'row' | 'list' = 'row') {
    const fixture = TestBed.createComponent(ChartLegendComponent)
    fixture.componentRef.setInput('items', items)
    fixture.componentRef.setInput('layout', layout)
    await fixture.whenStable()
    return fixture.nativeElement as HTMLElement
  }

  it('test_each_item_pairs_a_token_coloured_key_with_its_label', async () => {
    const legend = await render(PEOPLE)
    const keys = [...legend.querySelectorAll<HTMLElement>('[data-legend-key="dot"]')]

    expect(keys.map((key) => key.style.backgroundColor)).toEqual([
      'var(--person-a)',
      'var(--person-b)',
      'var(--mark-muted)',
    ])
    expect([...legend.querySelectorAll('[data-legend-label]')].map((l) => l.textContent)).toEqual([
      'You',
      'Your partner',
      'Shared',
    ])
  })

  it('test_labels_are_set_in_ink_never_in_the_series_colour', async () => {
    const legend = await render(PEOPLE)

    for (const label of legend.querySelectorAll<HTMLElement>('[data-legend-label]')) {
      expect(label.style.color).toBe('')
      expect(label.closest('li')?.className).toContain('text-ink-1')
    }
  })

  it('test_line_and_dashed_keys_mirror_line_marks', async () => {
    const legend = await render([
      { id: 'actual', label: 'Actual', color: 'neutral', key: 'line' },
      { id: 'projected', label: 'Projected', color: 'neutral', key: 'dashed' },
    ])

    const solid = legend.querySelector('[data-legend-key="line"] line')
    const dashed = legend.querySelector('[data-legend-key="dashed"] line')
    expect(solid?.getAttribute('stroke-dasharray')).toBeNull()
    expect(dashed?.getAttribute('stroke-dasharray')).toBe('4 4')
  })

  it('test_list_layout_adds_the_percentage_and_the_amount', async () => {
    const legend = await render(PEOPLE, 'list')
    const first = legend.querySelector('[data-legend-item]')

    expect(first?.querySelector('[data-legend-detail]')?.textContent).toBe('46%')
    expect(first?.querySelector('[data-legend-value]')?.textContent).toBe('$1,510.40')
  })

  it('test_row_layout_shows_labels_only', async () => {
    const legend = await render(PEOPLE)

    expect(legend.querySelector('[data-legend-value]')).toBeNull()
  })
})
