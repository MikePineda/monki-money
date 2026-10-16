import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aCategoryTree } from '../../../../testing/ledger-fixtures'
import type { TreeCategory } from '../../../domain/category-tree'
import { provideTranslocoScope } from '@jsverse/transloco'
import { CategoryRowComponent } from './category-row.component'

const rent = aCategoryTree()[0]?.categories[0] as TreeCategory

@Component({
  imports: [CategoryRowComponent],
  providers: [provideTranslocoScope({ scope: 'categories' })],
  template: `<app-category-row
    [category]="category"
    [editing]="editing()"
    [reorderMode]="reorder()"
    [canMoveUp]="false"
    (renamed)="renamed.push($event)"
    (moved)="moves.push($event)"
    (archived)="archived.set(true)"
  />`,
})
class Host {
  readonly category = rent
  readonly editing = signal(false)
  readonly reorder = signal(false)
  readonly archived = signal(false)
  readonly renamed: string[] = []
  readonly moves: number[] = []
}

describe('CategoryRowComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const button = (label: string) =>
      element.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null
    return { fixture, host: fixture.componentInstance, element, button }
  }

  it('test_at_rest_the_row_offers_archive_and_shows_the_category_glyph', async () => {
    const { host, button, element } = await setup()

    expect(element.querySelector('svg[data-icon="house"]')).not.toBeNull()
    expect(button('Move Rent up')).toBeNull()
    button('Archive Rent')?.click()

    expect(host.archived()).toBe(true)
  })

  it('test_reorder_mode_swaps_archive_for_arrows_that_respect_the_edges', async () => {
    const { host, fixture, button } = await setup()

    host.reorder.set(true)
    await fixture.whenStable()

    expect(button('Archive Rent')).toBeNull()
    expect(button('Move Rent up')?.disabled).toBe(true)
    button('Move Rent down')?.click()
    expect(host.moves).toEqual([1])
  })

  it('test_inline_rename_commits_once_on_enter', async () => {
    const { host, fixture, element } = await setup()
    host.editing.set(true)
    await fixture.whenStable()
    const input = element.querySelector('input') as HTMLInputElement

    input.value = 'Mortgage'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    input.dispatchEvent(new FocusEvent('blur'))

    expect(host.renamed).toEqual(['Mortgage'])
  })
})
