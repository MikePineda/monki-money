import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import type { Mock } from 'vitest'
import { aRule } from '../../../../testing/import-fixtures'
import { importTestingProviders, importsApiMock } from '../../../../testing/import-testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { httpError } from '../../../../testing/session-fixtures'
import type { MerchantRule } from '../../../core/api/api-types'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { RulesApi } from '../data-access/rules.api'
import RulesPage from './rules.page'

describe('RulesPage', () => {
  let api: Record<'list' | 'create' | 'update' | 'remove' | 'apply', Mock>

  async function open(rules: MerchantRule[]) {
    api = {
      list: vi.fn(async () => rules),
      create: vi.fn(async (body: Record<string, unknown>) =>
        aRule({ id: 50, origin: 'user', hitCount: 0, ...body })
      ),
      update: vi.fn(async (id: number, body: Record<string, unknown>) => ({
        ...(rules.find((rule) => rule.id === id) as MerchantRule),
        ...body,
        origin: 'user',
      })),
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

  function inSheet(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(`app-rule-sheet ${selector}`)
    if (!element) {
      throw new Error(`Nothing in the rule sheet matches ${selector}`)
    }
    return element
  }

  function sheetText(selector: string): string {
    return text(document, `app-rule-sheet ${selector}`)
  }

  /** The rule sheet is open and translated. */
  async function formShown(): Promise<void> {
    await vi.waitFor(() => expect(sheetText('[data-testid="rules.form.save"]')).toBe('Save rule'))
  }

  async function openForm(root: HTMLElement, settle: () => Promise<unknown>): Promise<void> {
    root.querySelector<HTMLButtonElement>('[data-testid="rules.new"]')?.click()
    await settle()
    await formShown()
  }

  function typeInto(selector: string, value: string): void {
    const input = inSheet(`${selector} input`) as HTMLInputElement
    input.value = value
    input.dispatchEvent(new Event('input'))
  }

  function pick(selector: string, label: string): void {
    const radio = [...inSheet(selector).querySelectorAll<HTMLElement>('[role="radio"]')].find(
      (item) => item.textContent?.trim() === label
    )
    if (!radio) {
      throw new Error(`No option ${label} in ${selector}`)
    }
    radio.click()
  }

  async function choose(chip: string, label: string): Promise<void> {
    inSheet(chip).click()
    await chooseAction(label)
    await vi.waitFor(() => expect(sheetText(chip)).toContain(label))
  }

  async function save(settle: () => Promise<unknown>): Promise<void> {
    inSheet('[data-testid="rules.form.save"]').click()
    await settle()
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
        'They appear as you confirm imports, or write one yourself.'
      )
    )
  })

  it('test_a_new_rule_requires_a_category_or_a_transfer_account', async () => {
    const { root, settle } = await open([aRule({ id: 1 })])
    await openForm(root, settle)

    typeInto('[data-testid="rules.form.pattern"]', 'FRESHCO')
    await settle()
    await save(settle)

    await vi.waitFor(() =>
      expect(sheetText('[data-testid="rules.form.targetError"]')).toBe(
        'Choose a category or a transfer account.'
      )
    )
    expect(api.create).not.toHaveBeenCalled()
  })

  it('test_creating_a_rule_from_the_screen_lists_it_first', async () => {
    const { root, settle } = await open([aRule({ id: 1 })])
    await openForm(root, settle)
    expect(sheetText('[data-testid="rules.form.matchHelp"]')).toContain('merchant name')

    pick('[data-testid="rules.form.matchType"]', 'Contains')
    await settle()
    expect(sheetText('[data-testid="rules.form.matchHelp"]')).toContain('contains')
    typeInto('[data-testid="rules.form.pattern"]', ' FRESHCO ')
    await choose('[data-testid="rules.form.category"]', 'Groceries')
    await save(settle)

    await vi.waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        matchType: 'contains',
        pattern: 'FRESHCO',
        categoryId: 20,
        transferAccountId: null,
        paidByUserId: null,
        payeeOverride: null,
        priority: 0,
      })
    )
    await vi.waitFor(() => expect(document.querySelector('app-rule-sheet')).toBeNull())
    await vi.waitFor(() =>
      expect(text(root, '[data-testid="rules.row"] [data-testid="rules.pattern"]')).toBe('FRESHCO')
    )
  })

  it('test_a_regex_that_does_not_compile_shows_the_error_on_the_pattern_field', async () => {
    const { root, settle } = await open([])
    api.create.mockRejectedValueOnce(
      httpError(422, {
        errors: [
          {
            field: 'pattern',
            rule: 'regex',
            message: 'This is not a valid regular expression',
          },
        ],
      })
    )
    await openForm(root, settle)

    pick('[data-testid="rules.form.matchType"]', 'Pattern')
    typeInto('[data-testid="rules.form.pattern"]', '(unclosed')
    await choose('[data-testid="rules.form.category"]', 'Groceries')
    await save(settle)

    await vi.waitFor(() =>
      expect(sheetText('[data-testid="rules.form.pattern"]')).toContain(
        'This is not a valid regular expression'
      )
    )
    expect(document.querySelector('app-rule-sheet')).not.toBeNull()
    expect(root.querySelector('[data-testid="rules.row"]')).toBeNull()
  })

  it('test_a_transfer_rule_points_at_an_account_with_its_payer_name_and_priority', async () => {
    const { root, settle } = await open([])
    await openForm(root, settle)

    typeInto('[data-testid="rules.form.pattern"]', 'NAB transfer')
    await choose('[data-testid="rules.form.category"]', 'Groceries')
    pick('[data-testid="rules.form.target"]', 'Transfer')
    await settle()
    await choose('[data-testid="rules.form.account"]', 'NAB Savings')
    await choose('[data-testid="rules.form.paidBy"]', 'Alex')
    typeInto('[data-testid="rules.form.payee"]', 'Savings')
    inSheet('[data-testid="rules.form.more"]').click()
    await settle()
    inSheet('[data-testid="rules.form.priorityUp"]').click()
    inSheet('[data-testid="rules.form.priorityUp"]').click()
    await settle()
    expect(sheetText('[data-testid="rules.form.priority"]')).toBe('2')
    await save(settle)

    await vi.waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        matchType: 'merchant',
        pattern: 'NAB transfer',
        categoryId: null,
        transferAccountId: 2,
        paidByUserId: 2,
        payeeOverride: 'Savings',
        priority: 2,
      })
    )
  })

  it('test_editing_a_rule_opens_the_form_filled_in_and_saves_only_the_changes', async () => {
    const { root, settle } = await open([
      aRule({ id: 1, pattern: 'corner grocer', categoryId: 20 }),
      aRule({ id: 2, pattern: 'bean there cafe', categoryId: 20 }),
    ])

    root.querySelector<HTMLButtonElement>('[data-testid="rules.row"]')?.click()
    await settle()
    await chooseAction('Edit rule')
    await formShown()
    expect((inSheet('[data-testid="rules.form.pattern"] input') as HTMLInputElement).value).toBe(
      'corner grocer'
    )
    expect(sheetText('[data-testid="rules.form.category"]')).toBe('Groceries')
    expect(inSheet('[data-testid="rules.form.save"]').hasAttribute('disabled')).toBe(true)

    await choose('[data-testid="rules.form.category"]', 'Rent')
    await save(settle)

    await vi.waitFor(() => expect(api.update).toHaveBeenCalledWith(1, { categoryId: 10 }))
    await vi.waitFor(() =>
      expect(
        [...root.querySelectorAll('[data-testid="rules.row"]')].map((row) =>
          [...row.querySelectorAll('span.truncate')].map((line) => line.textContent?.trim())
        )
      ).toEqual([
        ['corner grocer', 'Rent', 'Merchant · 3 matches · Yours'],
        ['bean there cafe', 'Groceries', 'Merchant · 3 matches · Learned'],
      ])
    )
  })

  it('test_a_bank_default_keeps_its_pattern_and_changes_its_target', async () => {
    const { root, settle } = await open([
      aRule({
        id: 9,
        origin: 'system',
        matchType: 'contains',
        pattern: 'Linked Acc Trns',
        categoryId: null,
        transferAccountId: 2,
      }),
    ])

    root.querySelector<HTMLButtonElement>('[data-testid="rules.row"]')?.click()
    await settle()
    await chooseAction('Edit rule')
    await formShown()

    expect(document.querySelector('app-rule-sheet [data-testid="rules.form.pattern"]')).toBeNull()
    expect(sheetText('[data-testid="rules.form.locked"]')).toContain('Linked Acc Trns')
    await choose('[data-testid="rules.form.account"]', 'NAB Everyday')
    await save(settle)

    await vi.waitFor(() => expect(api.update).toHaveBeenCalledWith(9, { transferAccountId: 1 }))
  })
})
