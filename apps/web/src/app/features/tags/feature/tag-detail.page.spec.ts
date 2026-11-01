import { Component, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aCategoryTree } from '../../../../testing/ledger-fixtures'
import { anAccount, aSessionStub, httpError } from '../../../../testing/session-fixtures'
import { aTagDetail, aTagSummary, tagsStoreStub } from '../../../../testing/tag-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { CategoriesApi } from '../../../core/household/categories.api'
import { TagsApi, type TagDetail } from '../../../core/ledger/tags.api'
import { MonthStore } from '../../../core/month/month.store'
import { ToastStore } from '../../../core/ui/toast.store'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import TagDetailPage from './tag-detail.page'

@Component({ template: '<p data-testid="stub">elsewhere</p>' })
class Stub {}

describe('TagDetailPage', () => {
  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  let api: { show: ReturnType<typeof vi.fn>; rename: ReturnType<typeof vi.fn> }
  let months: {
    ledgerRevision: ReturnType<typeof signal<number>>
    invalidate: ReturnType<typeof vi.fn>
  }

  async function open(options: { detail?: TagDetail; url?: string; notFound?: boolean } = {}) {
    api = {
      show: vi.fn(async (tag: string) => {
        if (options.notFound) {
          throw httpError(404, { code: 'E_ROW_NOT_FOUND' })
        }
        return { ...(options.detail ?? aTagDetail()), tag }
      }),
      rename: vi.fn(async (_tag: string, name: string) => ({ tag: name, updated: 3 })),
    }
    months = { ledgerRevision: signal(0), invalidate: vi.fn() }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'tags', component: Stub },
            { path: 'tags/:tag', component: TagDetailPage },
            { path: 'transactions', component: Stub },
          ],
          withComponentInputBinding()
        ),
        { provide: TagsApi, useValue: api },
        {
          provide: MonthStore,
          useValue: { ...months, current: computed(() => '2026-10') },
        },
        tagsStoreStub([aTagSummary(), aTagSummary({ tag: 'Bali' })]),
        { provide: AccountsApi, useValue: { list: async () => [anAccount()] } },
        { provide: CategoriesApi, useValue: { tree: async () => aCategoryTree() } },
        { provide: SessionStore, useValue: aSessionStub() },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl(options.url ?? '/tags/Bali%202027')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => {
      expect(root.querySelector('[data-testid="tag.loading"]')).toBeNull()
      expect(root.textContent).toMatch(/Spent with this tag|not in use/)
    })
    await harness.fixture.whenStable()
    return { harness, root }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  it('test_the_hero_shows_the_money_spent_with_the_count_and_months', async () => {
    const { root } = await open()

    expect(api.show).toHaveBeenCalledWith('Bali 2027', {})
    expect(text(root, '[data-testid="tag.name"]')).toBe('Bali 2027')
    expect(text(root, '[data-testid="tag.spent"]')).toBe('$130.00')
    expect(text(root, '[data-testid="tag.meta"]')).toBe('4 transactions · Nov 2026 – Jan 2027')
    expect(text(root, '[data-testid="tag.stats.setAside"]')).toContain('$800')
    expect(text(root, '[data-testid="tag.stats.net"]')).toContain('$130')
  })

  it('test_a_tag_with_a_slash_is_read_from_its_encoded_url', async () => {
    await open({ url: '/tags/Bali%20%2F%20Lombok' })

    expect(api.show).toHaveBeenCalledWith('Bali / Lombok', {})
  })

  it('test_charts_show_spending_by_category_the_months_and_who_paid', async () => {
    const detail = aTagDetail({
      byCategory: [
        {
          bucket: 'category',
          categoryId: 20,
          groupId: 2,
          kind: 'expense',
          amountCents: 7_000,
          count: 1,
        },
        {
          bucket: 'uncategorized',
          categoryId: null,
          groupId: null,
          kind: 'expense',
          amountCents: 6_000,
          count: 2,
        },
      ],
    })
    const { root } = await open({ detail })

    const spend = text(root, '[data-testid="tag.spend"]')
    expect(spend).toContain('Groceries')
    expect(spend).toContain('$70.00')
    expect(spend).toContain('Uncategorised')
    // Each chart keeps its table view.
    expect(root.querySelectorAll('[data-testid^="tag."] [data-chart-toggle]')).toHaveLength(3)
    expect(text(root, '[data-testid="tag.trend"]')).toContain('Nov 2026 – Jan 2027')
    expect(text(root, '[data-testid="tag.trend"]')).toContain('Set aside')
    const whoPaid = text(root, '[data-testid="tag.whoPaid"]')
    expect(whoPaid).toContain('You')
    expect(whoPaid).toContain('Shared')
  })

  it('test_links_to_the_transactions_filtered_by_the_tag', async () => {
    const { root } = await open()

    const link = root.querySelector('[data-testid="tag.movements"]') as HTMLAnchorElement

    expect(link.getAttribute('href')).toBe('/transactions?tag=Bali%202027')
  })

  it('test_a_tag_nobody_uses_is_not_found', async () => {
    const { root } = await open({ notFound: true, url: '/tags/lombok' })

    expect(text(root, '[data-testid="tag.notFound"]')).toContain('This tag is not in use')
  })

  it('test_the_period_in_the_url_narrows_the_tag_to_those_dates', async () => {
    const { root } = await open({ url: '/tags/Bali%202027?period=lastYear' })

    expect(api.show).toHaveBeenLastCalledWith('Bali 2027', {
      from: '2025-01-01',
      to: '2025-12-31',
    })
    expect(text(root, '[data-testid="tags.period"]')).toBe('Last year')
    const back = root.querySelector('a[icon="arrow-left"]') as HTMLAnchorElement
    expect(back.getAttribute('href')).toBe('/tags?period=lastYear')
  })

  async function typeNewName(harness: RouterTestingHarness, name: string) {
    const root = harness.fixture.nativeElement as HTMLElement
    ;(root.querySelector('[data-testid="tag.rename"]') as HTMLElement).click()
    await harness.fixture.whenStable()
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="tags.rename"]')).not.toBeNull()
    )
    const input = document.querySelector(
      '[data-testid="tags.rename.name"] input'
    ) as HTMLInputElement
    input.value = name
    input.dispatchEvent(new Event('input'))
    await harness.fixture.whenStable()
  }

  it('test_renaming_a_tag_opens_it_under_its_new_name', async () => {
    const { harness } = await open()

    await typeNewName(harness, '  Bali trip  ')
    expect(document.querySelector('[data-testid="tags.rename.merge"]')).toBeNull()
    const save = document.querySelector('[data-testid="tags.rename.save"]') as HTMLButtonElement
    expect(save.textContent).toContain('Rename')
    save.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/tags/Bali%20trip'))
    expect(api.rename).toHaveBeenCalledWith('Bali 2027', 'Bali trip')
    expect(months.invalidate).toHaveBeenCalled()
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('tags.toast.renamed')
  })

  it('test_renaming_into_another_tag_explains_the_merge_first', async () => {
    const { harness } = await open()

    await typeNewName(harness, 'Bali')

    const merge = document.querySelector('[data-testid="tags.rename.merge"]')
    expect(merge?.textContent).toContain('There is already a tag called "Bali"')
    const save = document.querySelector('[data-testid="tags.rename.save"]') as HTMLButtonElement
    expect(save.textContent).toContain('Merge tags')
    save.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/tags/Bali'))
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('tags.toast.merged')
  })

  it('test_the_same_name_cannot_be_saved', async () => {
    const { harness } = await open()

    await typeNewName(harness, 'Bali 2027')

    const save = document.querySelector('[data-testid="tags.rename.save"]') as HTMLButtonElement
    expect(save.disabled).toBe(true)
  })
})
