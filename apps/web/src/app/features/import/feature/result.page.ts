import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import { MonthStore } from '../../../core/month/month.store'
import { formatDateRange, formatDay } from '../../../domain/dates'
import { reconciliationMessage } from '../../../domain/import-row'
import { formatMoney } from '../../../domain/money'
import { monthOf } from '../../../domain/month'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import type { FeedbackStatus } from '../../../shared/ui/status-icon'
import { ImportResults, resultFromBatch, type ImportOutcome } from '../data-access/import-results'
import { ImportsApi } from '../data-access/imports.api'
import { provideImportScope } from '../import.scope'

/**
 * Keys read from TypeScript:
 * t(import.result.created, import.result.matched, import.result.transfers, import.result.ignored)
 * t(import.result.balanced, import.result.missing, import.result.differs, import.result.unknown)
 */
interface Tally {
  key: string
  count: number
}

/** A key of this scope, read only to know when the catalogue is in: t(import.result.title) */
const CATALOGUE_PROBE = 'result.title'

/**
 * The import's outcome `/import/:id/result`: how many movements were
 * created, matched, made transfers or ignored, and whether the ledger now
 * agrees with the bank's balance (or which movements are missing before a
 * date). "View month" opens the month the file ends in, freshly loaded;
 * "Import another" goes back to the upload. After a reload the counts come
 * from the completed batch, read without its rows.
 */
@Component({
  selector: 'app-import-result-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    EmptyStateComponent,
    IconButtonComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [provideImportScope()],
  template: `
    <div
      class="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-surface-0 pt-safe text-ink-1"
      data-testid="import.result"
    >
      <header class="flex h-14 shrink-0 items-center gap-1 pr-4 pl-1">
        <a
          appIconButton
          icon="x"
          routerLink="/month"
          [label]="'import.result.close' | transloco"
        ></a>
        <h1 class="truncate text-title text-ink-1">{{ 'import.result.title' | transloco }}</h1>
      </header>

      <main class="flex flex-1 flex-col gap-8 px-4 pt-2 pb-8">
        @if (outcome(); as current) {
          <section class="flex flex-col gap-1">
            <p class="text-display pnum text-ink-1" data-testid="import.result.headline">
              {{ current.result.created }}
            </p>
            <p class="text-body text-ink-2">
              {{ 'import.result.headline' | transloco: { count: current.result.created } }}
            </p>
            @if (facts()) {
              <p class="text-caption text-ink-3">{{ facts() }}</p>
            }
          </section>

          <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
            @for (item of tallies(); track item.key) {
              <div
                class="flex flex-col gap-1 bg-surface-0 p-4"
                [attr.data-testid]="'import.result.count.' + item.key"
              >
                <dt class="text-caption text-ink-2">
                  {{ 'import.result.' + item.key | transloco: { count: item.count } }}
                </dt>
                <dd class="text-title pnum text-ink-1">{{ item.count }}</dd>
              </div>
            }
          </dl>

          <app-banner
            data-testid="import.result.reconciliation"
            [attr.data-status]="reconciliation().status"
            [status]="reconciliationStatus()"
            [message]="reconciliationText()"
          />
        } @else if (failure(); as message) {
          <app-empty-state
            icon="wifi-off"
            data-testid="import.result.error"
            [title]="'import.result.error' | transloco"
            [body]="message.key | transloco: message.params ?? {}"
          >
            <button appButton variant="secondary" type="button" icon="refresh-cw" (click)="load()">
              {{ 'errors.retry' | transloco }}
            </button>
          </app-empty-state>
        } @else {
          <div class="flex flex-col gap-4" role="status">
            <span class="sr-only">{{ 'import.result.loading' | transloco }}</span>
            <app-skeleton height="48px" width="40%" />
            <app-skeleton height="160px" />
            <app-skeleton height="64px" />
          </div>
        }
      </main>

      @if (outcome()) {
        <footer
          class="sticky bottom-0 flex flex-col gap-2 bg-surface-0 px-4 pt-2 pb-[max(16px,var(--safe-bottom))]"
        >
          <button
            appButton
            type="button"
            size="block"
            data-testid="import.result.month"
            (click)="viewMonth()"
          >
            {{ 'import.result.viewMonth' | transloco }}
          </button>
          <a appButton variant="secondary" routerLink="/import" data-testid="import.result.another">
            {{ 'import.result.another' | transloco }}
          </a>
        </footer>
      }
    </div>
  `,
})
export default class ImportResultPage {
  /** Route param `:id` (component input binding). */
  readonly id = input.required<string>()

  private readonly api = inject(ImportsApi)
  private readonly results = inject(ImportResults)
  private readonly months = inject(MonthStore)
  private readonly directory = inject(HouseholdDirectory)
  private readonly router = inject(Router)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)
  private readonly catalogue = translateSignal(CATALOGUE_PROBE)

  protected readonly outcome = signal<ImportOutcome | null>(null)
  protected readonly failure = signal<Message | null>(null)

  protected readonly tallies = computed<Tally[]>(() => {
    const result = this.outcome()?.result
    if (!result) {
      return []
    }
    return [
      { key: 'created', count: result.created },
      { key: 'matched', count: result.matched },
      { key: 'transfers', count: result.transfers },
      { key: 'ignored', count: result.ignored },
    ]
  })

  protected readonly facts = computed(() => {
    this.catalogue()
    const batch = this.outcome()?.batch
    if (!batch) {
      return ''
    }
    const locale = this.locale()
    const account = this.directory.account(batch.accountId)?.name ?? ''
    const dates =
      batch.dateFrom && batch.dateTo ? formatDateRange(batch.dateFrom, batch.dateTo, locale) : ''
    return [account, dates].filter(Boolean).join(' · ')
  })

  protected readonly reconciliation = computed(() =>
    reconciliationMessage(this.outcome()?.result.reconciliation)
  )

  protected readonly reconciliationStatus = computed<FeedbackStatus | null>(() => {
    switch (this.reconciliation().status) {
      case 'balanced':
        return 'good'
      case 'missing':
      case 'differs':
        return 'warning'
      default:
        return null
    }
  })

  protected readonly reconciliationText = computed(() => {
    this.catalogue()
    const message = this.reconciliation()
    const locale = this.locale()
    const day = (date: string) => formatDay(`${date}T12:00:00.000Z`, locale, 'UTC')
    switch (message.status) {
      case 'balanced':
        return this.t('import.result.balanced', {
          amount: message.balanceCents === null ? '' : formatMoney(message.balanceCents, locale),
          date: message.asOf ? day(message.asOf) : '',
        })
      case 'missing':
        return this.t('import.result.missing', {
          amount: formatMoney(Math.abs(message.differenceCents), locale),
          date: day(message.before),
        })
      case 'differs':
        return this.t('import.result.differs', {
          amount: formatMoney(Math.abs(message.differenceCents), locale),
        })
      default:
        return this.t('import.result.unknown')
    }
  })

  constructor() {
    void this.directory.load().catch(() => undefined)
    effect(() => {
      this.id()
      untracked(() => void this.load())
    })
  }

  protected async load(): Promise<void> {
    const id = Number(this.id())
    const remembered = this.results.get(id)
    if (remembered) {
      this.outcome.set(remembered)
      return
    }
    this.failure.set(null)
    try {
      const batch = await this.api.batch(id)
      if (batch.status === 'staged') {
        await this.router.navigate(['/import', id])
        return
      }
      this.outcome.set({ result: resultFromBatch(batch), batch })
    } catch (error) {
      this.failure.set(failureMessage(toApiError(error)))
    }
  }

  protected async viewMonth(): Promise<void> {
    const dateTo = this.outcome()?.batch.dateTo
    if (!dateTo) {
      await this.router.navigate(['/month'])
      return
    }
    const month = monthOf(dateTo)
    this.months.invalidate(month)
    this.months.select(month)
    await this.router.navigate(['/month', month])
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}
