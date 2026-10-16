import { computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { enqueue, markFailed, type OutboxEntry } from '../../domain/outbox'
import { BottomSheetService } from '../../shared/ui/bottom-sheet/bottom-sheet.service'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { OutboxPillComponent } from './outbox-pill.component'

const NOW = new Date('2026-10-16T09:30:00.000Z')

let counter = 0

function queued(count: number, failed = 0): OutboxEntry[] {
  let entries: OutboxEntry[] = []
  for (let index = 0; index < count + failed; index++) {
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
  for (const entry of entries.slice(count)) {
    entries = markFailed(entries, entry.id, { code: 'E_VALIDATION', message: 'No' }, false)
  }
  return entries
}

class FakeOutbox {
  readonly entries = signal<OutboxEntry[]>([])
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
  readonly discard = vi.fn()
}

describe('OutboxPillComponent', () => {
  async function setup(lang: 'en' | 'es' = 'en') {
    const outbox = new FakeOutbox()
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang })],
      providers: [
        i18nTestingProviders(),
        provideRouter([]),
        { provide: OutboxStore, useValue: outbox },
        {
          provide: HouseholdDirectory,
          useValue: { load: async () => undefined, account: () => null, category: () => null },
        },
        { provide: APP_LOCALE, useValue: signal(lang === 'es' ? 'es-MX' : 'en-AU') },
      ],
    })
    const fixture = TestBed.createComponent(OutboxPillComponent)
    await fixture.whenStable()
    const root = fixture.nativeElement as HTMLElement
    const pill = () => root.querySelector<HTMLButtonElement>('[data-testid="outbox.pill"]')
    const show = async (entries: OutboxEntry[]) => {
      outbox.entries.set(entries)
      await vi.waitFor(async () => {
        await fixture.whenStable()
        expect(pill()?.textContent).toMatch(/\d \p{L}/u)
      })
    }
    return { fixture, outbox, root, pill, show }
  }

  function label(button: HTMLElement | null): string {
    return button?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_the_pill_is_hidden_while_everything_is_synced', async () => {
    const { pill } = await setup()

    expect(pill()).toBeNull()
  })

  it('test_the_pill_counts_pending_entries', async () => {
    const { pill, show } = await setup()

    await show(queued(1))

    expect(label(pill())).toBe('1 pending')
    expect(pill()?.querySelector('[data-icon="refresh-cw"]')).not.toBeNull()
  })

  it('test_offline_the_pill_says_it_waits_for_the_connection', async () => {
    const { pill, show, outbox, fixture } = await setup()
    outbox.isOnline.set(false)

    await show(queued(2))
    await fixture.whenStable()

    expect(label(pill())).toBe('2 pending')
    expect(pill()?.querySelector('[data-icon="wifi-off"]')).not.toBeNull()
  })

  it('test_the_pill_spins_while_syncing', async () => {
    const { pill, show, outbox, fixture } = await setup()
    outbox.isSyncing.set(true)

    await show(queued(1))
    await fixture.whenStable()

    expect(
      pill()?.querySelector('[data-icon="loader-circle"]')?.parentElement?.className
    ).toContain('animate-spin')
  })

  it('test_failed_entries_show_in_the_warning_colour', async () => {
    const { pill, show } = await setup()

    await show(queued(0, 2))

    expect(label(pill())).toBe('2 failed')
    expect(pill()?.className).toContain('border-status-warning')
    expect(
      pill()?.querySelector('[data-icon="triangle-alert"]')?.parentElement?.className
    ).toContain('text-status-warning')
  })

  it('test_pending_and_failed_show_together', async () => {
    const { pill, show } = await setup()

    await show(queued(1, 1))

    expect(label(pill())).toBe('1 pending · 1 failed')
  })

  it('test_the_pill_says_not_persisted_when_this_device_refused_to_store_the_entries', async () => {
    const { pill, show, outbox, fixture } = await setup()
    outbox.isPersisted.set(false)

    await show(queued(1))
    await fixture.whenStable()

    expect(label(pill())).toBe('1 pending · not persisted')
    expect(pill()?.className).toContain('border-status-warning')
    expect(pill()?.querySelector('[data-icon="triangle-alert"]')).not.toBeNull()
  })

  it('test_not_persisted_follows_the_language', async () => {
    const { pill, show, outbox, fixture } = await setup('es')
    outbox.isPersisted.set(false)

    await show(queued(1))
    await fixture.whenStable()

    expect(label(pill())).toBe('1 pendiente · sin guardar en el dispositivo')
  })

  it('test_the_pill_follows_the_language', async () => {
    const { pill, show } = await setup('es')

    await show(queued(2, 1))

    expect(label(pill())).toBe('2 pendientes · 1 con error')
  })

  it('test_tapping_the_pill_opens_the_sheet', async () => {
    const { pill, show, fixture } = await setup()
    await show(queued(1))

    pill()?.click()
    await fixture.whenStable()

    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="outbox.sheet"]')).not.toBeNull()
    )
  })
})
