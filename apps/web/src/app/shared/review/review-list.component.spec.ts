import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ReviewListComponent, type ReviewKey, type RowEmphasis } from './review-list.component'
import { ReviewRowDirective } from './review-row.directive'

interface Line {
  id: number
  name: string
  locked?: boolean
  doubtful?: boolean
}

@Component({
  imports: [ReviewListComponent, ReviewRowDirective],
  template: `
    <app-review-list
      label="Rows"
      moreLabel="Show more"
      [selectAllLabel]="selectAll()"
      [items]="items()"
      [key]="key"
      [checkLabel]="checkLabel"
      [selectable]="selectable"
      [emphasis]="emphasis"
      [pageSize]="pageSize()"
      [(selected)]="selected"
    >
      <ng-template appReviewRow [appReviewRowOf]="items()" let-line let-picked="selected">
        <span class="name" [attr.data-picked]="picked">{{ line.name }}</span>
      </ng-template>
    </app-review-list>
  `,
})
class Host {
  readonly items = signal<Line[]>([
    { id: 1, name: 'Corner Grocer' },
    { id: 2, name: 'Bus fare', locked: true },
    { id: 3, name: 'Sample Fest', doubtful: true },
  ])
  readonly selected = signal<ReadonlySet<ReviewKey>>(new Set())
  readonly selectAll = signal('')
  readonly pageSize = signal(60)
  readonly key = (line: Line) => line.id
  readonly checkLabel = (line: Line) => `Select ${line.name}`
  readonly selectable = (line: Line) => !line.locked
  readonly emphasis = (line: Line): RowEmphasis => (line.doubtful ? 'raised' : 'rest')
}

describe('ReviewListComponent', () => {
  async function setup(configure: (host: Host) => void = () => undefined) {
    const fixture = TestBed.createComponent(Host)
    configure(fixture.componentInstance)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const items = () => [...element.querySelectorAll<HTMLElement>('[data-testid="review.item"]')]
    const check = (name: string) =>
      element.querySelector<HTMLInputElement>(`input[aria-label="Select ${name}"]`)
    return { fixture, host: fixture.componentInstance, element, items, check }
  }

  it('test_renders_each_item_through_the_consumer_template_in_order', async () => {
    const { items } = await setup()

    expect(items().map((item) => item.textContent?.trim())).toEqual([
      'Corner Grocer',
      'Bus fare',
      'Sample Fest',
    ])
    expect(items().map((item) => item.dataset['key'])).toEqual(['1', '2', '3'])
  })

  it('test_a_checkbox_with_a_named_label_selects_the_item_two_way', async () => {
    const { fixture, host, check, element } = await setup()

    check('Corner Grocer')?.click()
    await fixture.whenStable()

    expect([...host.selected()]).toEqual([1])
    expect(element.querySelector('[data-key="1"] .name')?.getAttribute('data-picked')).toBe('true')

    check('Corner Grocer')?.click()
    await fixture.whenStable()
    expect([...host.selected()]).toEqual([])
  })

  it('test_items_that_cannot_be_selected_get_no_checkbox', async () => {
    const { check } = await setup()

    expect(check('Bus fare')).toBeNull()
    expect(check('Sample Fest')).not.toBeNull()
  })

  it('test_a_selection_set_by_the_host_shows_ticked', async () => {
    const { fixture, host, check } = await setup()

    host.selected.set(new Set([3]))
    await fixture.whenStable()

    expect(check('Sample Fest')?.checked).toBe(true)
    expect(check('Corner Grocer')?.checked).toBe(false)
  })

  it('test_raised_items_stand_out_on_a_card', async () => {
    const { items } = await setup()

    expect(items()[2]?.className).toContain('border-line')
    expect(items()[2]?.className).toContain('bg-surface-1')
    expect(items()[0]?.className).not.toContain('bg-surface-1')
  })

  it('test_select_all_picks_every_selectable_item_then_clears', async () => {
    const { fixture, host, element } = await setup((h) => h.selectAll.set('Select all'))
    const all = () =>
      element.querySelector<HTMLInputElement>('[data-testid="review.selectAll"] input')

    all()?.click()
    await fixture.whenStable()
    expect([...host.selected()].sort()).toEqual([1, 3])
    expect(all()?.checked).toBe(true)

    all()?.click()
    await fixture.whenStable()
    expect(host.selected().size).toBe(0)
  })

  it('test_long_lists_render_a_page_and_show_more_on_demand', async () => {
    const { fixture, items, element } = await setup((h) => h.pageSize.set(2))

    expect(items()).toHaveLength(2)
    element.querySelector<HTMLButtonElement>('[data-testid="review.more"]')?.click()
    await fixture.whenStable()

    expect(items()).toHaveLength(3)
    expect(element.querySelector('[data-testid="review.more"]')).toBeNull()
  })
})
