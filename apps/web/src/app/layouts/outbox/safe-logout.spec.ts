import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { SessionStore } from '../../core/auth/session.store'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { enqueue, type OutboxEntry } from '../../domain/outbox'
import { BottomSheetService } from '../../shared/ui/bottom-sheet/bottom-sheet.service'
import { SafeLogout } from './safe-logout'

const NOW = new Date('2026-10-16T09:30:00.000Z')

let counter = 0

function queued(count: number): OutboxEntry[] {
  let entries: OutboxEntry[] = []
  for (let index = 0; index < count; index++) {
    counter += 1
    entries = enqueue(
      entries,
      {
        kind: 'transaction',
        payload: {
          clientId: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
          kind: 'expense',
          accountId: 1,
          date: '2026-10-16',
          amountCents: 4250,
          categoryId: null,
          payee: null,
          description: null,
          paidByUserId: 1,
          isPrivate: false,
          tags: [],
        },
      },
      NOW
    )
  }
  return entries
}

class FakeOutbox {
  readonly entries = signal<OutboxEntry[]>([])
  readonly isSyncing = signal(false)
  /** "Sync now": by default everything reaches the server. */
  readonly retry = vi.fn(async () => this.entries.set([]))
}

describe('SafeLogout', () => {
  let outbox: FakeOutbox
  let session: { logout: ReturnType<typeof vi.fn> }

  function setup(entries: OutboxEntry[], lang: 'en' | 'es' = 'en'): SafeLogout {
    outbox = new FakeOutbox()
    outbox.entries.set(entries)
    session = { logout: vi.fn(async () => undefined) }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang })],
      providers: [
        i18nTestingProviders(),
        { provide: OutboxStore, useValue: outbox },
        { provide: SessionStore, useValue: session },
      ],
    })
    return TestBed.inject(SafeLogout)
  }

  function warning(): HTMLElement | null {
    return document.querySelector('[data-testid="outbox.logout"]')
  }

  function text(testId: string): string {
    return (
      document
        .querySelector(`[data-testid="${testId}"]`)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
    )
  }

  function press(testId: string): void {
    document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click()
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_logout_with_nothing_queued_logs_out_at_once', async () => {
    const logout = setup([])

    await logout.logout()

    expect(session.logout).toHaveBeenCalledTimes(1)
    expect(warning()).toBeNull()
  })

  it('test_logout_warns_while_entries_are_queued', async () => {
    const logout = setup(queued(2))

    void logout.logout()

    await vi.waitFor(() =>
      expect(text('outbox.logout.body')).toBe(
        '2 movements are waiting to sync and will be lost if you log out.'
      )
    )
    expect(text('outbox.logout.sync')).toBe('Sync now')
    expect(text('outbox.logout.confirm')).toBe('Log out anyway')
    expect(text('outbox.logout.cancel')).toBe('Cancel')
    expect(session.logout).not.toHaveBeenCalled()
  })

  it('test_log_out_anyway_logs_out_and_drops_the_entries_with_the_session', async () => {
    const logout = setup(queued(1))
    const done = logout.logout()
    await vi.waitFor(() => expect(warning()).not.toBeNull())

    press('outbox.logout.confirm')
    await done

    expect(session.logout).toHaveBeenCalledTimes(1)
    expect(outbox.retry).not.toHaveBeenCalled()
  })

  it('test_cancel_keeps_the_session_and_the_entries', async () => {
    const logout = setup(queued(1))
    const done = logout.logout()
    await vi.waitFor(() => expect(warning()).not.toBeNull())

    press('outbox.logout.cancel')
    await done

    expect(session.logout).not.toHaveBeenCalled()
    expect(outbox.entries()).toHaveLength(1)
    await vi.waitFor(() => expect(warning()).toBeNull())
  })

  it('test_sync_now_syncs_then_logs_out_once_nothing_would_be_lost', async () => {
    const logout = setup(queued(1))
    const done = logout.logout()
    await vi.waitFor(() => expect(warning()).not.toBeNull())

    press('outbox.logout.sync')
    await done

    expect(outbox.retry).toHaveBeenCalledTimes(1)
    expect(session.logout).toHaveBeenCalledTimes(1)
  })

  it('test_sync_now_that_leaves_entries_keeps_the_warning_and_says_so', async () => {
    const logout = setup(queued(2))
    outbox.retry.mockImplementationOnce(async () => outbox.entries.update((list) => list.slice(1)))
    void logout.logout()
    await vi.waitFor(() => expect(warning()).not.toBeNull())

    press('outbox.logout.sync')

    await vi.waitFor(() =>
      expect(text('outbox.logout.stuck')).toBe(
        'Not everything could sync. Check the connection and try again, or log out anyway.'
      )
    )
    expect(text('outbox.logout.body')).toBe(
      '1 movement is waiting to sync and will be lost if you log out.'
    )
    expect(session.logout).not.toHaveBeenCalled()
  })

  it('test_the_warning_follows_the_language', async () => {
    const logout = setup(queued(1), 'es')

    void logout.logout()

    await vi.waitFor(() =>
      expect(text('outbox.logout.body')).toBe(
        '1 movimiento espera sincronizarse y se perderá si cierras sesión.'
      )
    )
  })
})
