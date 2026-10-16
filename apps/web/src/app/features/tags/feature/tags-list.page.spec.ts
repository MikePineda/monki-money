import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aTagSummary } from '../../../../testing/tag-fixtures'
import type { TagSummary } from '../../../core/ledger/tags.api'
import { TagsStore, type TagsStatus } from '../../../core/ledger/tags.store'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import TagsListPage from './tags-list.page'

@Component({ template: '<p data-testid="stub">elsewhere</p>' })
class Stub {}

describe('TagsListPage', () => {
  let store: {
    tags: ReturnType<typeof signal<TagSummary[]>>
    status: ReturnType<typeof signal<TagsStatus>>
    load: ReturnType<typeof vi.fn>
    refresh: ReturnType<typeof vi.fn>
  }

  async function open(tags: TagSummary[], status: TagsStatus = 'ready') {
    store = {
      tags: signal(tags),
      status: signal(status),
      load: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          { path: 'tags', component: TagsListPage },
          { path: 'tags/:tag', component: Stub },
          { path: 'transactions', component: Stub },
          { path: 'settings', component: Stub },
        ]),
        { provide: TagsStore, useValue: store },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/tags')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(root.textContent).toContain('Tags'))
    await harness.fixture.whenStable()
    return { harness, root }
  }

  function texts(root: ParentNode, selector: string): string[] {
    return [...root.querySelectorAll(selector)].map(
      (element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    )
  }

  it('test_lists_each_tag_with_its_count_months_and_totals', async () => {
    const { root } = await open([
      aTagSummary(),
      aTagSummary({
        tag: 'camping',
        count: 1,
        expenseCents: 3_000,
        setAsideCents: 0,
        firstDate: '2026-10-20',
        lastDate: '2026-10-20',
      }),
    ])

    expect(store.load).toHaveBeenCalled()
    expect(texts(root, '[data-testid="tags.row.name"]')).toEqual(['Bali 2027', 'camping'])
    const [bali, camping] = texts(root, '[data-testid="tags.row"]')
    // en-AU writes July in full even in its short month format.
    expect(bali).toContain('4 transactions · July 2026 – Jan 2027')
    expect(camping).toContain('1 transaction · Oct 2026')
    expect(texts(root, '[data-testid="tags.row.totals"]')).toEqual([
      'Spent $130.00 · Set aside $800.00',
      'Spent $30.00',
    ])
  })

  it('test_a_row_opens_its_tag_with_the_tag_encoded_in_the_url', async () => {
    const { root } = await open([aTagSummary({ tag: 'Bali / Lombok' })])

    const row = root.querySelector('[data-testid="tags.row"]') as HTMLAnchorElement

    expect(row.getAttribute('href')).toBe('/tags/Bali%20%2F%20Lombok')
  })

  it('test_without_tags_the_empty_state_says_how_to_add_one', async () => {
    const { root } = await open([])

    const empty = root.querySelector('[data-testid="tags.empty"]')
    expect(empty?.textContent).toContain('No tags yet')
    expect(empty?.textContent).toContain('add a tag')
    expect(empty?.querySelector('a')?.getAttribute('href')).toBe('/transactions')
  })

  it('test_a_failed_load_offers_to_try_again', async () => {
    const { root, harness } = await open([], 'error')

    ;(root.querySelector('[data-testid="tags.error"] button') as HTMLElement).click()
    await harness.fixture.whenStable()

    expect(store.refresh).toHaveBeenCalled()
  })
})
