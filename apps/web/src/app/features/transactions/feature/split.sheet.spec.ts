import { Component, Injector, computed, inject, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aCategoryTree, aTransaction } from '../../../../testing/ledger-fixtures'
import type { Transaction } from '../../../core/api/api-types'
import { flattenCategories } from '../../../domain/category-tree'
import { AmountKeypadHarness } from '../../../shared/ui/amount-keypad/amount-keypad.harness'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonHarness } from '../../../shared/ui/button/button.harness'
import { SelectSheetHarness } from '../../../shared/ui/select-sheet/select-sheet.harness'
import { TransactionsStore } from '../transactions.store'
import { provideTransactionsScope } from '../transactions.scope'
import { SplitSheetComponent, type SplitSheetData } from './split.sheet'

const MINUS = '−'

@Component({ template: '', providers: [provideTransactionsScope()] })
class Host {
  private readonly sheets = inject(BottomSheetService)
  private readonly injector = inject(Injector)
  readonly result = signal<Transaction | undefined | 'pending'>('pending')

  open(row: Transaction): void {
    this.sheets
      .open<Transaction, SplitSheetData>(SplitSheetComponent, {
        data: { row },
        injector: this.injector,
      })
      .closed.subscribe((saved) => this.result.set(saved))
  }
}

describe('SplitSheetComponent', () => {
  let store: { saveSplits: ReturnType<typeof vi.fn>; unsplit: ReturnType<typeof vi.fn> }

  async function open(row = aTransaction({ amountCents: -4250, categoryId: 20 })) {
    const tree = aCategoryTree()
    const byId = new Map(tree.flatMap((group) => group.categories.map((c) => [c.id, c])))
    store = {
      saveSplits: vi.fn(async () => ({ ...row, isSplit: true, categoryId: null })),
      unsplit: vi.fn(),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        {
          provide: TransactionsStore,
          useValue: {
            ...store,
            categories: {
              byId: computed(() => byId),
              options: computed(() => flattenCategories(tree)),
            },
          },
        },
      ],
    })
    const fixture = TestBed.createComponent(Host)
    fixture.componentInstance.open(row)
    await fixture.whenStable()
    const root = TestbedHarnessEnvironment.documentRootLoader(fixture)
    const keypad = await root.getHarness(AmountKeypadHarness)
    const save = await root.getHarness(ButtonHarness.with({ text: 'Save split' }))
    const text = (testId: string) =>
      (document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '').trim()
    return { fixture, root, keypad, save, text, host: fixture.componentInstance }
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_the_last_line_takes_the_remainder_as_the_keypad_types', async () => {
    const { keypad, text, fixture } = await open()

    await keypad.press('3', '0', '0', '0')
    await fixture.whenStable()

    expect(text('transactions.split.amount.0')).toBe('$30.00')
    expect(text('transactions.split.rest')).toContain('$12.50')
  })

  it('test_save_waits_for_a_category_on_every_line', async () => {
    const { keypad, save, root, fixture } = await open()
    await keypad.press('3', '0', '0', '0')
    expect(await save.isDisabled()).toBe(true)

    ;(
      document.querySelector('[data-testid="transactions.split.category.1"]') as HTMLElement
    ).click()
    await fixture.whenStable()
    await (await root.getHarness(SelectSheetHarness)).choose('Rent')
    await fixture.whenStable()

    expect(await save.isDisabled()).toBe(false)
    expect(
      document.querySelector('[data-testid="transactions.split.status"]')?.textContent
    ).toContain('The lines add up to $42.50.')
  })

  it('test_lines_over_the_total_cannot_be_saved_and_say_by_how_much', async () => {
    const { keypad, save, text, fixture } = await open()

    await keypad.press('5', '0', '0', '0')
    await fixture.whenStable()

    expect(text('transactions.split.rest')).toContain(`${MINUS}$7.50`)
    expect(text('transactions.split.status')).toBe('The lines go over by $7.50.')
    expect(await save.isDisabled()).toBe(true)
  })

  it('test_saving_sends_every_line_and_closes_with_the_saved_row', async () => {
    const { keypad, save, root, fixture, host } = await open()
    await keypad.press('3', '0', '0', '0')
    ;(
      document.querySelector('[data-testid="transactions.split.category.1"]') as HTMLElement
    ).click()
    await fixture.whenStable()
    await (await root.getHarness(SelectSheetHarness)).choose('Rent')
    await fixture.whenStable()

    await save.click()
    await fixture.whenStable()

    expect(store.saveSplits).toHaveBeenCalledWith(expect.objectContaining({ amountCents: -4250 }), [
      { categoryId: 20, amountCents: 3000 },
      { categoryId: 10, amountCents: 1250 },
    ])
    expect(host.result()).toEqual(expect.objectContaining({ isSplit: true }))
  })
})
