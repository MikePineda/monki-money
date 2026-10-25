import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aCategoryTree, aTransaction, aTransferPair } from '../../../../testing/ledger-fixtures'
import type { Transaction } from '../../../core/api/api-types'
import { groupByDay } from '../../../domain/transaction-list'
import { TransactionRowComponent, type RowSelection } from './transaction-row.component'
import { TransactionRowHarness } from './transaction-row.harness'
import { rowView, type RowContext, type TransactionRowView } from './transaction-row.view'

const MINUS = '−'
const categories = new Map(
  aCategoryTree().flatMap((group) => group.categories.map((c) => [c.id, c]))
)

const context: RowContext = {
  labels: {
    private: 'Private',
    uncategorized: 'Uncategorised',
    split: 'Split',
    transfer: 'Transfer',
    noPayee: 'No payee',
    transferFrom: (account) => `Transfer from ${account}`,
    transferTo: (account) => `Transfer to ${account}`,
  },
  accountName: (id) => ({ 1: 'NAB Everyday', 2: 'NAB Savings' })[id] ?? '',
  category: (id) => categories.get(id),
  person: (userId) => (userId === 1 ? 'a' : userId === 2 ? 'b' : 'joint'),
  personLabel: (userId) => (userId === 1 ? 'You' : userId === 2 ? 'Alex' : 'Joint'),
}

function views(rows: Transaction[]): TransactionRowView[] {
  return groupByDay(rows).flatMap((day) => day.items.map((item) => rowView(item, context)))
}

@Component({
  imports: [TransactionRowComponent],
  template: `<div role="list">
    @for (view of views(); track view.key) {
      <app-transaction-row [view]="view" [selection]="selection()" (opened)="opened.set(view.id)" />
    }
  </div>`,
})
class Host {
  readonly views = signal<TransactionRowView[]>([])
  readonly opened = signal<number | null>(null)
  readonly selection = signal<RowSelection>('none')
}

describe('TransactionRowComponent', () => {
  async function render(rows: Transaction[]) {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(Host)
    fixture.componentInstance.views.set(views(rows))
    await fixture.whenStable()
    const loader = TestbedHarnessEnvironment.loader(fixture)
    return { fixture, rows: await loader.getAllHarnesses(TransactionRowHarness) }
  }

  it('test_expense_shows_payee_category_account_and_an_ink_amount_with_a_true_minus', async () => {
    const { rows } = await render([
      aTransaction({ payee: 'Corner Grocer', categoryId: 20, amountCents: -4820, paidByUserId: 1 }),
    ])
    const [row] = rows

    expect(await row?.getTitle()).toBe('Corner Grocer')
    expect(await row?.getMeta()).toBe('Groceries · NAB Everyday')
    expect(await row?.getAmount()).toBe(`${MINUS}$48.20`)
    expect(await row?.getAmountKind()).toBe('expense')
    expect(await row?.getIcon()).toBe('shopping-cart')
    expect(await row?.getPerson()).toBe('a')
  })

  it('test_income_is_signed_plus_and_marked_as_income', async () => {
    const { rows } = await render([
      aTransaction({ kind: 'income', payee: 'Salary', categoryId: 30, amountCents: 645000 }),
    ])

    expect(await rows[0]?.getAmount()).toBe('+$6,450.00')
    expect(await rows[0]?.getAmountKind()).toBe('income')
  })

  it('test_a_partners_private_row_shows_private_and_hides_the_category', async () => {
    const { rows } = await render([
      aTransaction({
        isMasked: true,
        isPrivate: true,
        payee: null,
        categoryId: null,
        paidByUserId: 2,
        amountCents: -20000,
      }),
    ])
    const [row] = rows

    expect(await row?.isMasked()).toBe(true)
    expect(await row?.getTitle()).toBe('Private')
    expect(await row?.getMeta()).toBe('NAB Everyday')
    expect(await row?.getIcon()).toBe('lock')
    expect(await row?.getAmount()).toBe(`${MINUS}$200.00`)
    expect(await row?.getPerson()).toBe('b')
  })

  it('test_a_transfer_is_one_row_from_to_with_an_unsigned_amount_and_the_arrow', async () => {
    const { rows, fixture } = await render(aTransferPair(9, 50000))
    const [row] = rows

    expect(rows).toHaveLength(1)
    expect(await row?.getTitle()).toBe('NAB Everyday → NAB Savings')
    expect(await row?.getMeta()).toBe('Transfer')
    expect(await row?.getAmount()).toBe('$500.00')
    expect(await row?.getAmountKind()).toBe('transfer')
    expect(await row?.getPerson()).toBeNull()
    const amount = fixture.nativeElement.querySelector('app-amount-display') as HTMLElement
    expect(amount.querySelector('svg[data-icon="arrow-left-right"]')).not.toBeNull()
  })

  it('test_split_and_uncategorized_rows_say_so', async () => {
    const { rows } = await render([
      aTransaction({ isSplit: true, categoryId: null, payee: 'Big Box Store' }),
      aTransaction({ categoryId: null, payee: 'Unknown Shop' }),
    ])

    expect(await rows[0]?.getMeta()).toBe('Split · NAB Everyday')
    expect(await rows[0]?.getIcon()).toBe('split')
    expect(await rows[1]?.getMeta()).toBe('Uncategorised · NAB Everyday')
  })

  it('test_tapping_a_row_opens_it', async () => {
    const { rows, fixture } = await render([aTransaction({ id: 42 })])

    await rows[0]?.click()

    expect(fixture.componentInstance.opened()).toBe(42)
  })

  it('test_while_selecting_the_square_becomes_a_checkbox', async () => {
    const { fixture } = await render([aTransaction({ payee: 'Corner Grocer', categoryId: 20 })])
    const element = fixture.nativeElement as HTMLElement
    const button = () => element.querySelector('[data-testid="transactions.row"]') as HTMLElement

    expect(button().getAttribute('aria-pressed')).toBeNull()

    fixture.componentInstance.selection.set('unselected')
    await fixture.whenStable()
    expect(button().getAttribute('aria-pressed')).toBe('false')
    expect(button().querySelector('svg[data-icon]')?.getAttribute('data-icon')).toBe('check')

    fixture.componentInstance.selection.set('selected')
    await fixture.whenStable()
    expect(button().getAttribute('aria-pressed')).toBe('true')

    fixture.componentInstance.selection.set('unavailable')
    await fixture.whenStable()
    expect(button().getAttribute('aria-pressed')).toBeNull()
    expect(button().getAttribute('aria-disabled')).toBe('true')
  })
})
