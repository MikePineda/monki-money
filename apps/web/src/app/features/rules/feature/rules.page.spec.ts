import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import type { Mock } from 'vitest'
import { aRule } from '../../../../testing/import-fixtures'
import { importTestingProviders, importsApiMock } from '../../../../testing/import-testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import type { MerchantRule } from '../../../core/api/api-types'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { RulesApi } from '../data-access/rules.api'
import RulesPage from './rules.page'

describe('RulesPage', () => {
  let api: Record<'list' | 'remove' | 'apply', Mock>

  async function open(rules: MerchantRule[]) {
    api = {
      list: vi.fn(async () => rules),
      remove: vi.fn(async () => undefined),
      apply: vi.fn(async () => 2),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([{ path: 'settings/rules', component: RulesPage }]),
        ...importTestingProviders({ api: importsApiMock() }),
        { provide: RulesApi, useValue: api },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/settings/rules')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(text(root, 'h1')).toBe('Merchant rules'))
    await harness.fixture.whenStable()
    return { root, settle: () => harness.fixture.whenStable() }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  async function chooseAction(name: string): Promise<void> {
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull())
    ;[...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((item) => item.textContent?.includes(name))
      ?.click()
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_each_rule_shows_its_pattern_target_matches_and_origin', async () => {
    const { root } = await open([
      aRule({ id: 1, pattern: 'corner grocer', categoryId: 20, hitCount: 3, origin: 'learned' }),
      aRule({
        id: 2,
        matchType: 'contains',
        pattern: 'Linked Acc Trns',
        categoryId: null,
        transferAccountId: 2,
        hitCount: 0,
        origin: 'system',
      }),
    ])
    await vi.waitFor(() => expect(text(root, '[data-testid="rules.row"]')).toContain('Groceries'))

    const rows = [...root.querySelectorAll('[data-testid="rules.row"]')].map((row) =>
      [...row.querySelectorAll('span.truncate')].map((line) => line.textContent?.trim())
    )
    expect(rows).toEqual([
      ['corner grocer', 'Groceries', 'Merchant · 3 matches · Learned'],
      ['Linked Acc Trns', 'Transfer to NAB Savings', 'Contains · No matches yet · Bank default'],
    ])
  })

  it('test_deleting_a_rule_asks_first', async () => {
    const { root, settle } = await open([aRule({ id: 1 })])

    root.querySelector<HTMLButtonElement>('[data-testid="rules.row"]')?.click()
    await settle()
    await chooseAction('Delete rule')
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="confirm.yes"]')).not.toBeNull()
    )
    expect(api.remove).not.toHaveBeenCalled()
    document.querySelector<HTMLButtonElement>('[data-testid="confirm.yes"]')?.click()

    await vi.waitFor(() => expect(api.remove).toHaveBeenCalledWith(1))
    await vi.waitFor(() => expect(root.querySelector('[data-testid="rules.empty"]')).not.toBeNull())
  })

  it('test_applying_a_rule_goes_through_its_actions', async () => {
    const { root, settle } = await open([aRule({ id: 4 })])

    root.querySelector<HTMLButtonElement>('[data-testid="rules.row"]')?.click()
    await settle()
    await chooseAction('Apply to movements in review')

    await vi.waitFor(() => expect(api.apply).toHaveBeenCalledWith(4))
  })

  it('test_no_rules_yet_says_where_they_come_from', async () => {
    const { root } = await open([])

    await vi.waitFor(() =>
      expect(text(root, '[data-testid="rules.empty"]')).toContain(
        'They appear as you confirm imports.'
      )
    )
  })
})
