import { Component, signal, viewChild } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { aCategoryTree } from '../../../testing/ledger-fixtures'
import { flattenCategories } from '../../domain/category-tree'
import { AmountKeypadHarness } from '../ui/amount-keypad/amount-keypad.harness'
import { BottomSheetService } from '../ui/bottom-sheet/bottom-sheet.service'
import { SelectSheetHarness } from '../ui/select-sheet/select-sheet.harness'
import { TextFieldHarness } from '../ui/text-field/text-field.harness'
import transactionFormEn from './i18n/en.json'
import type { TransactionDraft } from './transaction-draft'
import { TransactionFormComponent } from './transaction-form.component'

@Component({
  imports: [TransactionFormComponent],
  template: `<app-transaction-form
    [(draft)]="draft"
    [accounts]="accounts"
    [people]="people"
    [categories]="categories"
    [payees]="payees"
    [tagSuggestions]="knownTags"
    [serverErrors]="errors()"
  />`,
})
class Host {
  readonly draft = signal<TransactionDraft>({
    kind: 'expense',
    amountCents: 4820,
    accountId: 1,
    paidByUserId: 1,
    categoryId: 20,
    date: '2026-10-15',
    payee: '',
    description: '',
    isPrivate: false,
    tags: [],
  })
  readonly errors = signal<Record<string, string>>({})
  readonly accounts = [
    { value: 1, label: 'NAB Everyday' },
    { value: 2, label: 'NAB Savings' },
  ]
  readonly people = [
    { value: 1 as number | null, label: 'You', person: 'a' as const },
    { value: null, label: 'Joint', person: 'joint' as const },
  ]
  readonly categories = flattenCategories(aCategoryTree())
  readonly payees = ['Corner Grocer', 'Coffee Cart', 'Bus Ticket']
  /** The household's tags, most recently used first. */
  readonly knownTags = ['Bali 2027', 'camping', 'Work trip']
  readonly form = viewChild.required(TransactionFormComponent)
}

describe('TransactionFormComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'transactionForm/en': transactionFormEn } })],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    return {
      fixture,
      host: fixture.componentInstance,
      loader: TestbedHarnessEnvironment.loader(fixture),
      root: TestbedHarnessEnvironment.documentRootLoader(fixture),
      element: fixture.nativeElement as HTMLElement,
    }
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_a_422_puts_each_message_under_its_field_and_unknown_ones_on_top', async () => {
    const { host, fixture, loader, element } = await setup()

    host.errors.set({
      'amountCents': 'The amount is too large.',
      'payee': 'The payee is too long.',
      'tags.0': 'A tag is too long.',
      'clientId': 'Something is off.',
    })
    await fixture.whenStable()

    expect(
      element.querySelector('[data-testid="transactions.form.amountError"]')?.textContent
    ).toContain('The amount is too large.')
    const payee = await loader.getHarness(TextFieldHarness.with({ label: 'Payee' }))
    expect(await payee.getMessage()).toContain('The payee is too long.')
    expect(await payee.isInvalid()).toBe(true)
    const tag = await loader.getHarness(TextFieldHarness.with({ label: 'Add a tag' }))
    expect(await tag.getMessage()).toContain('A tag is too long.')
    expect(element.querySelector('app-banner')?.textContent).toContain('Something is off.')
  })

  it('test_the_amount_comes_from_the_keypad_only', async () => {
    const { host, fixture, loader, element } = await setup()
    expect(element.querySelector('input[inputmode="decimal"]')).toBeNull()

    ;(element.querySelector('[data-testid="transactions.form.amount"]') as HTMLElement).click()
    await fixture.whenStable()
    const keypad = await loader.getHarness(AmountKeypadHarness)
    await keypad.press('backspace', '0')

    expect(host.draft().amountCents).toBe(4820)
    expect(host.form().valid()).toBe(true)
  })

  it('test_a_zero_amount_makes_the_form_invalid', async () => {
    const { host, fixture } = await setup()

    host.draft.update((draft) => ({ ...draft, amountCents: 0 }))
    await fixture.whenStable()

    expect(host.form().valid()).toBe(false)
  })

  it('test_typing_a_payee_offers_recent_ones_and_a_tap_fills_it', async () => {
    const { host, fixture, loader, element } = await setup()
    const payee = await loader.getHarness(TextFieldHarness.with({ label: 'Payee' }))

    await payee.setValue('co')
    await fixture.whenStable()
    const suggestions = [...element.querySelectorAll('[aria-label="Recent payees"] button')]
    expect(suggestions.map((button) => button.textContent?.trim())).toEqual([
      'Corner Grocer',
      'Coffee Cart',
    ])

    ;(suggestions[1] as HTMLElement).click()
    await fixture.whenStable()
    expect(host.draft().payee).toBe('Coffee Cart')
  })

  it('test_recent_tags_are_offered_as_chips_and_a_tap_adds_one', async () => {
    const { host, fixture, loader, element } = await setup()
    const suggested = () =>
      [...element.querySelectorAll('[aria-label="Recent tags"] button')].map((button) =>
        button.textContent?.trim()
      )

    expect(suggested()).toEqual(['Bali 2027', 'camping', 'Work trip'])

    const field = await loader.getHarness(TextFieldHarness.with({ label: 'Add a tag' }))
    await field.setValue('BA')
    await fixture.whenStable()
    expect(suggested()).toEqual(['Bali 2027'])

    ;(element.querySelector('[aria-label="Add tag Bali 2027"]') as HTMLElement).click()
    await fixture.whenStable()
    expect(host.draft().tags).toEqual(['Bali 2027'])
    expect(await field.getValue()).toBe('')
    expect(suggested()).toEqual(['camping', 'Work trip'])
  })

  it('test_a_new_tag_can_still_be_typed', async () => {
    const { host, fixture, loader, element } = await setup()
    const field = await loader.getHarness(TextFieldHarness.with({ label: 'Add a tag' }))

    await field.setValue('  Lombok ')
    await fixture.whenStable()
    ;(element.querySelector('button[aria-label="Add a tag"]') as HTMLElement).click()
    await fixture.whenStable()

    expect(host.draft().tags).toEqual(['Lombok'])
    ;(element.querySelector('[aria-label="Remove tag Lombok"]') as HTMLElement).click()
    await fixture.whenStable()
    expect(host.draft().tags).toEqual([])
  })

  it('test_category_picker_lists_categories_of_the_same_kind', async () => {
    const { host, fixture, root, element } = await setup()

    ;(element.querySelector('[data-testid="transactions.form.category"]') as HTMLElement).click()
    await fixture.whenStable()
    const sheet = await root.getHarness(SelectSheetHarness)
    const options = await sheet.getOptions()

    expect(options.some((option) => option.startsWith('Salary'))).toBe(false)
    await sheet.choose('Rent')
    await fixture.whenStable()
    expect(host.draft().categoryId).toBe(10)
  })
})
