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

/** The session's logout as far as the guard goes: asks every confirm hook, then ends. */
class FakeSession {
  readonly hooks: (() => Promise<boolean>)[] = []
  /** The session really ended (every hook agreed). */
  readonly ended = vi.fn()
  confirmLogout(hook: () => Promise<boolean>): void {
    this.hooks.push(hook)
  }
  async logout(): Promise<boolean> {
    for (const hook of this.hooks) {
      if (!(await hook())) {
        return false
      }
    }
    this.ended()
    return true
  }
}

describe('SafeLogout', () => {
  let outbox: FakeOutbox
  let session: FakeSession

  function setup(entries: OutboxEntry[], lang: 'en' | 'es' = 'en'): SafeLogout {
    outbox = new FakeOutbox()
    outbox.entries.set(entries)
    session = new FakeSession()
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

    expect(session.ended).toHaveBeenCalledTimes(1)
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
    expect(session.ended).not.toHaveBeenCalled()
  })

  it('test_log_out_anyway_logs_out_and_drops_the_entries_with_the_session', async () => {
    const logout = setup(queued(1))
    const done = logout.logout()
    await vi.waitFor(() => expect(warning()).not.toBeNull())

    press('outbox.logout.confirm')
    await done

    expect(session.ended).toHaveBeenCalledTimes(1)
    expect(outbox.retry).not.toHaveBeenCalled()
  })

  it('test_cancel_keeps_the_session_and_the_entries', async () => {
    const logout = setup(queued(1))
    const done = logout.logout()
    await vi.waitFor(() => expect(warning()).not.toBeNull())

    press('outbox.logout.cancel')
    await done

    expect(session.ended).not.toHaveBeenCalled()
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
    expect(session.ended).toHaveBeenCalledTimes(1)
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
    expect(session.ended).not.toHaveBeenCalled()
  })

  it('test_once_guarded_every_logout_of_the_app_warns_first', async () => {
    const guard = setup(queued(1))
    guard.guardLogouts()
    guard.guardLogouts()
    expect(session.hooks).toHaveLength(1)

    // The invitation's "wrong account", the deleted-household and the
    // create-household screens call the session's logout directly.
    const done = session.logout()
    await vi.waitFor(() => expect(warning()).not.toBeNull())
    press('outbox.logout.cancel')

    expect(await done).toBe(false)
    expect(session.ended).not.toHaveBeenCalled()
  })

  it('test_a_guarded_logout_with_nothing_queued_ends_at_once', async () => {
    const guard = setup([])
    guard.guardLogouts()

    expect(await session.logout()).toBe(true)
    expect(warning()).toBeNull()
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
