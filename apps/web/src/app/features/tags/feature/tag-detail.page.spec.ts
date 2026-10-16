import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aCategoryTree } from '../../../../testing/ledger-fixtures'
import { aMember, aUser, anAccount, httpError } from '../../../../testing/session-fixtures'
import { aTagDetail } from '../../../../testing/tag-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { CategoriesApi } from '../../../core/household/categories.api'
import { HouseholdApi } from '../../../core/household/household.api'
import { TagsApi, type TagDetail } from '../../../core/ledger/tags.api'
import { MonthStore } from '../../../core/month/month.store'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import TagDetailPage from './tag-detail.page'

@Component({ template: '<p data-testid="stub">elsewhere</p>' })
class Stub {}

describe('TagDetailPage', () => {
  let api: { show: ReturnType<typeof vi.fn> }

  async function open(options: { detail?: TagDetail; url?: string; notFound?: boolean } = {}) {
    api = {
      show: vi.fn(async (tag: string) => {
        if (options.notFound) {
          throw httpError(404, { code: 'E_ROW_NOT_FOUND' })
        }
        return { ...(options.detail ?? aTagDetail()), tag }
      }),
    }
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
        { provide: MonthStore, useValue: { ledgerRevision: signal(0) } },
        { provide: AccountsApi, useValue: { list: async () => [anAccount()] } },
        { provide: CategoriesApi, useValue: { tree: async () => aCategoryTree() } },
        {
          provide: HouseholdApi,
          useValue: {
            members: async () => [
              aMember({ userId: 1 }),
              aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'member' }),
            ],
          },
        },
        {
          provide: SessionStore,
          useValue: { user: signal(aUser({ id: 1 })), onClear: () => undefined },
        },
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

    expect(api.show).toHaveBeenCalledWith('Bali 2027')
    expect(text(root, '[data-testid="tag.name"]')).toBe('Bali 2027')
    expect(text(root, '[data-testid="tag.spent"]')).toBe('$130.00')
    expect(text(root, '[data-testid="tag.meta"]')).toBe('4 transactions · Nov 2026 – Jan 2027')
    expect(text(root, '[data-testid="tag.stats.setAside"]')).toContain('$800')
    expect(text(root, '[data-testid="tag.stats.net"]')).toContain('$130')
  })

  it('test_a_tag_with_a_slash_is_read_from_its_encoded_url', async () => {
    await open({ url: '/tags/Bali%20%2F%20Lombok' })

    expect(api.show).toHaveBeenCalledWith('Bali / Lombok')
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
})
