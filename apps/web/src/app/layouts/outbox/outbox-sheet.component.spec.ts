import { Component, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { anAccount } from '../../../testing/session-fixtures'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { OutboxStore } from '../../core/outbox/outbox.store'
import {
  discard,
  enqueue,
  markFailed,
  markSyncing,
  type OutboxEntry,
  type OutboxItem,
} from '../../domain/outbox'
import { BottomSheetService } from '../../shared/ui/bottom-sheet/bottom-sheet.service'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { OutboxPillComponent } from './outbox-pill.component'

@Component({ template: '<p>add</p>' })
class AddStub {}

const NOW = new Date('2026-10-16T09:30:00.000Z')
const EXPENSE_ID = '00000000-0000-4000-8000-000000000101'
const REFUSED_ID = '00000000-0000-4000-8000-000000000102'
const TRANSFER_ID = '00000000-0000-4000-8000-000000000103'

const EXPENSE: OutboxItem = {
  kind: 'transaction',
  payload: {
    clientId: EXPENSE_ID,
    kind: 'expense',
    accountId: 1,
    date: '2026-10-15',
    amountCents: 4250,
    categoryId: 10,
    payee: 'Corner Shop',
    description: null,
    paidByUserId: 1,
    isPrivate: false,
    tags: [],
  },
}

const REFUSED: OutboxItem = {
  kind: 'transaction',
  payload: { ...EXPENSE.payload, clientId: REFUSED_ID, payee: null, kind: 'income' },
}

const TRANSFER: OutboxItem = {
  kind: 'transfer',
  payload: {
    clientId: TRANSFER_ID,
    fromAccountId: 1,
    toAccountId: 2,
    date: '2026-10-14',
    amountCents: 50000,
    memo: null,
    tags: [],
  },
}

function anOutbox(): OutboxEntry[] {
  let entries = [EXPENSE, REFUSED, TRANSFER].reduce<OutboxEntry[]>(
    (list, item) => enqueue(list, item, NOW),
    []
  )
  entries = markFailed(
    entries,
    REFUSED_ID,
    { code: 'E_VALIDATION', message: 'The selected category does not exist' },
    false
  )
  return entries
}

class FakeOutbox {
  readonly entries = signal<OutboxEntry[]>(anOutbox())
  readonly isSyncing = signal(false)
  readonly isOnline = signal(true)
  readonly isPersisted = signal(true)
  readonly pendingCount = computed(
    () => this.entries().filter((entry) => entry.status !== 'failed').length
  )
  readonly failedCount = computed(
    () => this.entries().filter((entry) => entry.status === 'failed').length
  )
  readonly retry = vi.fn(async () => undefined)
  readonly discard = vi.fn((id: string) => this.entries.update((list) => discard(list, id)))
}

describe('OutboxSheetComponent', () => {
  async function openSheet() {
    const outbox = new FakeOutbox()
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([{ path: 'add', component: AddStub }]),
        { provide: OutboxStore, useValue: outbox },
        {
          provide: HouseholdDirectory,
          useValue: {
            load: async () => undefined,
            account: (id: number | null) =>
              id === 1
                ? anAccount({ id: 1, name: 'Everyday' })
                : id === 2
                  ? anAccount({ id: 2, name: 'Savings' })
                  : null,
            category: (id: number | null) =>
              id === 10
                ? {
                    category: { id: 10, name: 'Groceries', slug: 'groceries', icon: null },
                    group: { id: 1, name: 'Essentials' },
                  }
                : null,
          },
        },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const fixture = TestBed.createComponent(OutboxPillComponent)
    await vi.waitFor(async () => {
      await fixture.whenStable()
      const pill = fixture.nativeElement.querySelector('[data-testid="outbox.pill"]')
      expect(pill?.textContent).toContain('pending')
    })
    ;(fixture.nativeElement.querySelector('[data-testid="outbox.pill"]') as HTMLElement).click()
    await vi.waitFor(async () => {
      await fixture.whenStable()
      expect(sheet()?.textContent).toContain('Not synced yet')
    })
    return { fixture, outbox }
  }

  function sheet(): HTMLElement | null {
    return document.querySelector('.mm-sheet-panel app-outbox-sheet')
  }

  function rows(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[data-testid="outbox.entry"]')]
  }

  function textOf(element: Element | null | undefined): string {
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function button(row: HTMLElement | undefined, id: string): HTMLButtonElement {
    const found = row?.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
    if (!found) {
      throw new Error(`No ${id} in the row`)
    }
    return found
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_the_sheet_lists_each_entry_with_amount_title_date_and_status', async () => {
    await openSheet()
    const [expense, refused, transfer] = rows()

    expect(rows()).toHaveLength(3)
    expect(textOf(expense)).toContain('Corner Shop')
    expect(textOf(expense)).toContain('Thu 15 Oct · Groceries · Everyday')
    expect(textOf(expense)).toContain('−$42.50')
    expect(textOf(expense?.querySelector('[data-testid="outbox.entry.status"]'))).toBe(
      'Waiting to sync'
    )
    expect(textOf(refused)).toContain('Groceries')
    expect(textOf(refused)).toContain('+$42.50')
    expect(textOf(transfer)).toContain('Everyday → Savings')
    expect(textOf(transfer)).toContain('$500.00')
  })

  it('test_a_failed_entry_shows_the_server_message', async () => {
    await openSheet()
    const refused = rows()[1]

    expect(refused?.dataset['status']).toBe('failed')
    expect(textOf(refused?.querySelector('[data-testid="outbox.entry.status"]'))).toBe(
      'Not saved · The selected category does not exist'
    )
  })

  it('test_offline_a_waiting_entry_says_it_waits_for_the_connection', async () => {
    const { outbox, fixture } = await openSheet()

    outbox.isOnline.set(false)
    await fixture.whenStable()

    expect(textOf(rows()[0]?.querySelector('[data-testid="outbox.entry.status"]'))).toBe(
      'Waiting for a connection'
    )
  })

  it('test_only_a_failed_entry_offers_retry_and_it_retries_that_entry', async () => {
    const { outbox } = await openSheet()

    expect(rows()[0]?.querySelector('[data-testid="outbox.entry.retry"]')).toBeNull()
    button(rows()[1], 'outbox.entry.retry').click()

    expect(outbox.retry).toHaveBeenCalledWith(REFUSED_ID)
  })

  it('test_retry_all_sends_everything_again', async () => {
    const { outbox } = await openSheet()

    ;(document.querySelector('[data-testid="outbox.retryAll"]') as HTMLButtonElement).click()

    expect(outbox.retry).toHaveBeenCalledWith()
  })

  it('test_discard_asks_first_and_keep_changes_nothing', async () => {
    const { outbox, fixture } = await openSheet()

    button(rows()[0], 'outbox.entry.discard').click()
    await fixture.whenStable()
    expect(textOf(rows()[0])).toContain('Discard this entry? It will not be saved.')
    button(rows()[0], 'outbox.entry.keep').click()
    await fixture.whenStable()

    expect(outbox.discard).not.toHaveBeenCalled()
    expect(rows()[0]?.querySelector('[data-testid="outbox.entry.confirm"]')).toBeNull()
  })

  it('test_confirming_discard_drops_the_entry', async () => {
    const { outbox, fixture } = await openSheet()

    button(rows()[0], 'outbox.entry.discard').click()
    await fixture.whenStable()
    button(rows()[0], 'outbox.entry.confirmDiscard').click()
    await fixture.whenStable()

    expect(outbox.discard).toHaveBeenCalledWith(EXPENSE_ID)
    expect(rows()).toHaveLength(2)
  })

  it('test_an_entry_being_synced_cannot_be_edited_or_discarded', async () => {
    const { outbox, fixture } = await openSheet()

    outbox.entries.update((list) => markSyncing(list, EXPENSE_ID))
    await fixture.whenStable()

    expect(button(rows()[0], 'outbox.entry.edit').disabled).toBe(true)
    expect(button(rows()[0], 'outbox.entry.discard').disabled).toBe(true)
    expect(textOf(rows()[0]?.querySelector('[data-testid="outbox.entry.status"]'))).toBe('Syncing…')
  })

  it('test_edit_opens_quick_add_with_the_entry', async () => {
    const { fixture } = await openSheet()

    button(rows()[2], 'outbox.entry.edit').click()
    await fixture.whenStable()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe(`/add?outbox=${TRANSFER_ID}`))
    await vi.waitFor(() => expect(sheet()).toBeNull())
  })

  it('test_the_sheet_closes_once_nothing_is_left', async () => {
    const { outbox, fixture } = await openSheet()

    outbox.entries.set([])
    await fixture.whenStable()

    await vi.waitFor(() => expect(sheet()).toBeNull())
  })

  it('test_the_sheet_explains_entries_this_device_could_not_store', async () => {
    const { outbox, fixture } = await openSheet()
    expect(document.querySelector('[data-testid="outbox.sheet.notPersisted"]')).toBeNull()

    outbox.isPersisted.set(false)
    await fixture.whenStable()

    expect(textOf(document.querySelector('[data-testid="outbox.sheet.notPersisted"]'))).toBe(
      'This phone could not store them (storage full or private browsing): they stay only until the app closes, so keep it open until they sync.'
    )
  })
})
