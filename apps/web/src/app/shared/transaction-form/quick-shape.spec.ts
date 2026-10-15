import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { aCategoryTree } from '../../../testing/ledger-fixtures'
import { flattenCategories } from '../../domain/category-tree'
import type { CategoryTile } from './category-grid.component'
import transactionFormEn from './i18n/en.json'
import type { TransactionDraft } from './transaction-draft'
import { TransactionFormComponent } from './transaction-form.component'
import {
  EMPTY_TRANSFER,
  TransferFormComponent,
  type TransferDraft,
} from './transfer-form.component'

const TODAY = '2026-10-15'

@Component({
  imports: [TransactionFormComponent, TransferFormComponent],
  template: `
    @if (transfer()) {
      <app-transfer-form
        keypad="external"
        compact
        [today]="today"
        [presets]="presets"
        [accounts]="accounts"
        [(draft)]="transferDraft"
      />
    } @else {
      <app-transaction-form
        keypad="external"
        compact
        [showKind]="false"
        [today]="today"
        [categoryTiles]="tiles"
        [accounts]="accounts"
        [people]="people"
        [categories]="categories"
        [(draft)]="draft"
      />
    }
  `,
})
class QuickHost {
  readonly transfer = signal(false)
  readonly today = TODAY
  readonly accounts = [
    { value: 1, label: 'Everyday' },
    { value: 2, label: 'Savings' },
  ]
  readonly people = [{ value: 1 as number | null, label: 'You', person: 'a' as const }]
  readonly categories = flattenCategories(aCategoryTree())
  readonly tiles: CategoryTile[] = [
    { id: 20, name: 'Groceries', icon: 'shopping-cart' },
    { id: 10, name: 'Rent', icon: 'house' },
  ]
  readonly presets = [{ fromAccountId: 1, toAccountId: 2, fromName: 'Everyday', toName: 'Savings' }]
  readonly draft = signal<TransactionDraft>({
    kind: 'expense',
    amountCents: 4250,
    accountId: 1,
    paidByUserId: 1,
    categoryId: null,
    date: TODAY,
    payee: '',
    description: '',
    isPrivate: false,
    tags: [],
  })
  readonly transferDraft = signal<TransferDraft>({ ...EMPTY_TRANSFER, date: TODAY })
}

describe('the forms in their quick-add shape', () => {
  async function setup(transfer = false) {
    TestBed.configureTestingModule({
      imports: [i18nTesting({ scopes: { 'transactionForm/en': transactionFormEn } })],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(QuickHost)
    fixture.componentInstance.transfer.set(transfer)
    await fixture.whenStable()
    return {
      fixture,
      host: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
    }
  }

  function byTestId(element: HTMLElement, id: string): HTMLElement | null {
    return element.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  }

  it('test_an_external_keypad_leaves_only_the_amount_on_display', async () => {
    const { element } = await setup()

    expect(byTestId(element, 'transactions.form.amount')?.tagName).toBe('P')
    expect(element.querySelector('app-amount-keypad')).toBeNull()
    expect(byTestId(element, 'transactions.form.kind')).toBeNull()
  })

  it('test_tiles_pick_a_category_and_a_second_tap_clears_it', async () => {
    const { host, fixture, element } = await setup()
    const tile = () => element.querySelector<HTMLElement>('[data-category="20"]') as HTMLElement

    tile().click()
    await fixture.whenStable()
    expect(host.draft().categoryId).toBe(20)
    expect(tile().getAttribute('aria-pressed')).toBe('true')

    tile().click()
    await fixture.whenStable()
    expect(host.draft().categoryId).toBeNull()
  })

  it('test_details_stay_folded_until_asked_and_offer_today_and_yesterday', async () => {
    const { host, fixture, element } = await setup()
    expect(byTestId(element, 'transactions.form.payee')).toBeNull()

    byTestId(element, 'transactions.form.detailsToggle')?.click()
    await fixture.whenStable()
    expect(byTestId(element, 'transactions.form.payee')).not.toBeNull()
    const yesterday = [
      ...element.querySelectorAll<HTMLElement>(
        '[data-testid="transactions.form.dateShortcuts"] button'
      ),
    ].find((button) => button.textContent?.includes('Yesterday')) as HTMLElement
    yesterday.click()
    await fixture.whenStable()

    expect(host.draft().date).toBe('2026-10-14')
  })

  it('test_a_preset_sets_both_transfer_accounts', async () => {
    const { host, fixture, element } = await setup(true)

    byTestId(element, 'transactions.transfer.preset')?.click()
    await fixture.whenStable()

    expect(host.transferDraft()).toMatchObject({ fromAccountId: 1, toAccountId: 2 })
    expect(byTestId(element, 'transactions.transfer.preset')?.getAttribute('aria-pressed')).toBe(
      'true'
    )
  })

  it('test_the_same_account_twice_is_called_out', async () => {
    const { host, fixture, element } = await setup(true)

    host.transferDraft.set({ ...EMPTY_TRANSFER, fromAccountId: 1, toAccountId: 1, date: TODAY })
    await fixture.whenStable()

    expect(byTestId(element, 'transactions.transfer.accountError')?.textContent).toContain(
      'Choose two different accounts.'
    )
  })
})
