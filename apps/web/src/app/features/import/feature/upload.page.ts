import { Component, computed, inject } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { ImportBatch } from '../../../core/api/api-types'
import { formatDateRange } from '../../../domain/dates'
import { CSV_ACCEPT, maskAccountNumber, type StagedNext } from '../../../domain/import-upload'
import { IconComponent } from '../../../shared/icons/icon.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { ProgressTrackComponent } from '../../../shared/ui/progress-track/progress-track.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../shared/ui/select-sheet/select-sheet.component'
import { ToastOutletComponent } from '../../../layouts/toast-outlet/toast-outlet.component'
import { ImportUploadStore, type MappingChoice, type UploadProblem } from '../import-upload.store'
import { provideImportScope } from '../import.scope'

/** "New account" in the mapping select sheet. */
const NEW_ACCOUNT = -1
/** "Detect from the file" in the account select sheet. */
const AUTO_DETECT = -1

/**
 * Keys read from TypeScript:
 * t(import.upload.problem.notCsv, import.upload.problem.empty, import.upload.problem.tooLarge)
 * t(import.upload.problem.limit, import.upload.problem.batchOpen)
 * t(import.upload.csv.E_CSV_TOO_LARGE, import.upload.csv.E_CSV_TOO_MANY_ROWS)
 * t(import.upload.csv.E_CSV_ENCODING, import.upload.csv.E_CSV_UNKNOWN_FORMAT)
 * t(import.upload.csv.E_CSV_MALFORMED, import.upload.csv.E_CSV_INVALID_VALUE)
 * t(import.upload.csv.E_CSV_EMPTY, import.upload.csv.where, import.upload.csv.whereLine)
 * t(import.upload.accountAuto, import.upload.accountTitle, import.mapping.choose)
 * t(import.mapping.newAccount, import.mapping.newAccountName, import.mapping.title)
 * t(import.upload.size.kb, import.upload.size.mb, import.upload.progress, import.review.rows)
 */
const CSV_CODES = [
  'E_CSV_TOO_LARGE',
  'E_CSV_TOO_MANY_ROWS',
  'E_CSV_ENCODING',
  'E_CSV_UNKNOWN_FORMAT',
  'E_CSV_MALFORMED',
  'E_CSV_INVALID_VALUE',
  'E_CSV_EMPTY',
]

/** A key of this scope, read only to know when the catalogue is in: t(import.upload.title) */
const CATALOGUE_PROBE = 'upload.title'

/**
 * Import a bank CSV `/import`: pick the account (or let the file say),
 * choose the CSV and watch it upload (real progress, cancellable). Problems
 * are said where they happen: a wrong file before it leaves, a malformed
 * one with its line and column, an account that already has an import
 * waiting (with a link to it), the plan's limit. Account numbers the
 * household has never seen open a mapping step; a file with several
 * accounts lists one review per account. Imports still waiting for review
 * are offered at the top.
 */
@Component({
  selector: 'app-import-upload-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    ChipComponent,
    EmptyStateComponent,
    IconButtonComponent,
    IconComponent,
    ProgressTrackComponent,
    RouterLink,
    ToastOutletComponent,
    TranslocoPipe,
  ],
  providers: [ImportUploadStore, provideImportScope()],
  template: `
    <div
      class="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-surface-0 pt-safe text-ink-1"
      data-testid="import.upload"
    >
      <header class="flex h-14 shrink-0 items-center gap-1 pr-4 pl-1">
        <a
          appIconButton
          icon="arrow-left"
          routerLink="/month"
          [label]="'import.upload.back' | transloco"
        ></a>
        <h1 class="truncate text-title text-ink-1">{{ 'import.upload.title' | transloco }}</h1>
      </header>
      <app-toast-outlet class="fixed inset-x-0 top-[calc(var(--safe-top)+56px)] z-20" />

      <main class="flex flex-1 flex-col gap-8 px-4 pt-2 pb-8">
        @if (waiting().length > 0 && store.step().step === 'pick') {
          <section class="flex flex-col gap-2" data-testid="import.upload.waiting">
            <h2 class="text-heading text-ink-1">{{ 'import.upload.waiting' | transloco }}</h2>
            <ul class="flex flex-col">
              @for (batch of waiting(); track batch.id) {
                <li class="border-b border-line last:border-b-0">
                  <a
                    class="flex min-h-14 items-center gap-3 py-2 active:bg-surface-2"
                    [routerLink]="['/import', batch.id]"
                  >
                    <app-icon name="file-text" class="text-ink-2" />
                    <span class="flex min-w-0 flex-1 flex-col">
                      <span class="truncate text-body text-ink-1">{{ accountName(batch) }}</span>
                      <span class="truncate text-caption text-ink-3">{{ batchFacts(batch) }}</span>
                    </span>
                    <span class="text-label text-accent">{{
                      'import.upload.continue' | transloco
                    }}</span>
                  </a>
                </li>
              }
            </ul>
          </section>
        }

        @switch (store.step().step) {
          @case ('uploading') {
            <section class="flex flex-col gap-3" data-testid="import.upload.progress">
              <p class="truncate text-body text-ink-1">
                {{ 'import.upload.uploading' | transloco: { name: uploadingName() } }}
              </p>
              <app-progress-track
                [value]="progress()"
                [label]="'import.upload.progressLabel' | transloco"
              />
              <p class="text-caption tnum text-ink-2">{{ progressText() }}</p>
              <button
                appButton
                variant="secondary"
                type="button"
                data-testid="import.upload.cancel"
                (click)="store.cancel()"
              >
                {{ 'import.upload.cancel' | transloco }}
              </button>
            </section>
          }
          @case ('mapping') {
            <section class="flex flex-col gap-4" data-testid="import.mapping">
              <div class="flex flex-col gap-1">
                <h2 class="text-heading text-ink-1">{{ 'import.mapping.title' | transloco }}</h2>
                <p class="text-body text-ink-2">{{ 'import.mapping.body' | transloco }}</p>
              </div>
              <ul class="flex flex-col">
                @for (entry of mappingRows(); track entry.number) {
                  <li
                    class="flex min-h-14 items-center gap-3 border-b border-line py-2"
                    [attr.data-number]="entry.masked"
                  >
                    <app-icon name="landmark" class="text-ink-2" />
                    <span class="min-w-0 flex-1 text-body text-ink-1">{{
                      'import.mapping.number' | transloco: { number: entry.masked }
                    }}</span>
                    <button
                      appChip
                      trailing="chevron-down"
                      [attr.data-testid]="'import.mapping.choose.' + $index"
                      (click)="chooseMapping(entry.number)"
                    >
                      {{ entry.label }}
                    </button>
                  </li>
                }
              </ul>
              @if (problemText(); as text) {
                <app-banner
                  status="critical"
                  data-testid="import.upload.problem"
                  [message]="text"
                />
              }
              <button
                appButton
                type="button"
                size="block"
                data-testid="import.mapping.continue"
                [disabled]="!store.mappingComplete()"
                [loading]="store.mappingBusy()"
                (click)="applyMapping()"
              >
                {{ 'import.mapping.continue' | transloco }}
              </button>
              <button appButton variant="ghost" type="button" (click)="store.reset()">
                {{ 'import.upload.another' | transloco }}
              </button>
            </section>
          }
          @case ('choose') {
            <section class="flex flex-col gap-2" data-testid="import.upload.several">
              <h2 class="text-heading text-ink-1">
                {{ 'import.upload.several.title' | transloco: { count: chooseBatches().length } }}
              </h2>
              <p class="text-body text-ink-2">{{ 'import.upload.several.body' | transloco }}</p>
              <ul class="flex flex-col">
                @for (batch of chooseBatches(); track batch.id) {
                  <li class="border-b border-line">
                    <a
                      class="flex min-h-14 items-center gap-3 py-2 active:bg-surface-2"
                      [routerLink]="['/import', batch.id]"
                    >
                      <app-icon name="landmark" class="text-ink-2" />
                      <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate text-body text-ink-1">{{ accountName(batch) }}</span>
                        <span class="truncate text-caption text-ink-3">{{
                          batchFacts(batch)
                        }}</span>
                      </span>
                      <app-icon name="chevron-right" class="text-ink-2" />
                    </a>
                  </li>
                }
              </ul>
            </section>
          }
          @case ('nothingNew') {
            <app-empty-state
              icon="circle-check"
              data-testid="import.upload.nothingNew"
              [title]="'import.upload.nothingNew.title' | transloco"
              [body]="'import.upload.nothingNew.body' | transloco"
            >
              <button appButton variant="secondary" type="button" (click)="store.reset()">
                {{ 'import.upload.another' | transloco }}
              </button>
            </app-empty-state>
          }
          @default {
            <section class="flex flex-col gap-6">
              <p class="text-body text-ink-2">{{ 'import.upload.intro' | transloco }}</p>
              <div class="flex flex-col gap-2">
                <span class="text-label text-ink-2" id="import-account-label">{{
                  'import.upload.account' | transloco
                }}</span>
                <button
                  appChip
                  trailing="chevron-down"
                  class="self-start"
                  data-testid="import.upload.account"
                  aria-describedby="import-account-label"
                  (click)="chooseAccount()"
                >
                  {{ accountLabel() }}
                </button>
              </div>
              @if (problemText(); as text) {
                <app-banner
                  data-testid="import.upload.problem"
                  [status]="problemStatus()"
                  [message]="text"
                  [actionLabel]="
                    openBatchId() ? ('import.upload.problem.openAction' | transloco) : ''
                  "
                  (action)="openBatch()"
                />
              }
            </section>
          }
        }
      </main>

      @if (store.step().step === 'pick') {
        <footer class="sticky bottom-0 bg-surface-0 px-4 pt-2 pb-[max(16px,var(--safe-bottom))]">
          <input
            #fileInput
            type="file"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            data-testid="import.upload.file"
            [accept]="accept"
            (change)="onFile($event)"
          />
          <button
            appButton
            type="button"
            size="block"
            icon="file-up"
            data-testid="import.upload.choose"
            (click)="fileInput.click()"
          >
            {{ 'import.upload.choose' | transloco }}
          </button>
          <p class="pt-2 text-center text-caption text-ink-3">
            {{ 'import.upload.hint' | transloco }}
          </p>
        </footer>
      }
    </div>
  `,
})
export default class ImportUploadPage {
  protected readonly store = inject(ImportUploadStore)
  private readonly router = inject(Router)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)
  private readonly catalogue = translateSignal(CATALOGUE_PROBE)
  private readonly t = (key: string, params?: Record<string, string | number>): string =>
    this.transloco.translate(key, params)

  protected readonly accept = CSV_ACCEPT

  protected readonly waiting = computed(() =>
    this.store.openBatches.hasValue() ? this.store.openBatches.value() : []
  )

  protected readonly accountLabel = computed(() => {
    this.catalogue()
    const id = this.store.accountId()
    return (
      (id === null ? null : this.store.directory.account(id)?.name) ??
      this.t('import.upload.accountAuto')
    )
  })

  protected readonly uploadingName = computed(() => {
    const step = this.store.step()
    return step.step === 'uploading' ? step.fileName : ''
  })

  protected readonly progress = computed(() => {
    const step = this.store.step()
    return step.step === 'uploading' ? step.progress : null
  })

  protected readonly progressText = computed(() => {
    this.catalogue()
    const step = this.store.step()
    if (step.step !== 'uploading') {
      return ''
    }
    const total = this.size(step.sizeBytes)
    if (step.progress === null) {
      return total
    }
    return this.t('import.upload.progress', {
      percent: Math.round(step.progress * 100),
      size: total,
    })
  })

  protected readonly mappingRows = computed(() => {
    this.catalogue()
    const step = this.store.step()
    const mapping = this.store.mapping()
    if (step.step !== 'mapping') {
      return []
    }
    return step.accountNumbers.map((number) => {
      const choice = mapping[number] ?? null
      const label =
        choice === null
          ? this.t('import.mapping.choose')
          : choice === 'new'
            ? this.t('import.mapping.newAccount')
            : (this.store.directory.account(choice)?.name ?? '')
      return { number, masked: maskAccountNumber(number), label }
    })
  })

  protected readonly chooseBatches = computed(() => {
    const step = this.store.step()
    return step.step === 'choose' ? step.batches : []
  })

  protected readonly openBatchId = computed(() => {
    const problem = this.store.problem()
    return problem?.kind === 'batchOpen' ? problem.batchId : null
  })

  protected readonly problemStatus = computed(() =>
    this.store.problem()?.kind === 'batchOpen' ? 'warning' : 'critical'
  )

  protected readonly problemText = computed(() => {
    this.catalogue()
    const problem = this.store.problem()
    return problem ? this.describe(problem) : ''
  })

  protected accountName(batch: ImportBatch): string {
    return this.store.directory.account(batch.accountId)?.name ?? ''
  }

  protected batchFacts(batch: ImportBatch): string {
    const locale = this.locale()
    const dates =
      batch.dateFrom && batch.dateTo ? formatDateRange(batch.dateFrom, batch.dateTo, locale) : ''
    return [dates, this.t('import.review.rows', { count: batch.counts.rows })]
      .filter(Boolean)
      .join(' · ')
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // Let the same file be picked again after a problem.
    input.value = ''
    if (file) {
      await this.go(await this.store.pick(file))
    }
  }

  protected chooseAccount(): void {
    const options: SelectOption<number>[] = [
      { value: AUTO_DETECT, label: this.t('import.upload.accountAuto'), icon: 'file-text' },
      ...this.store.directory.activeAccounts().map((account) => ({
        value: account.id,
        label: account.name,
        icon: 'landmark' as const,
      })),
    ]
    openSelectSheet(this.sheets, {
      title: this.t('import.upload.accountTitle'),
      options,
      selected: this.store.accountId() ?? AUTO_DETECT,
    }).subscribe((value) => {
      if (value !== undefined) {
        this.store.accountId.set(value === AUTO_DETECT ? null : value)
      }
    })
  }

  protected chooseMapping(accountNumber: string): void {
    const current = this.store.mapping()[accountNumber] ?? null
    const options: SelectOption<number>[] = [
      ...this.store.directory.activeAccounts().map((account) => ({
        value: account.id,
        label: account.name,
        meta: account.externalAccountNumber
          ? maskAccountNumber(account.externalAccountNumber)
          : undefined,
        icon: 'landmark' as const,
      })),
      { value: NEW_ACCOUNT, label: this.t('import.mapping.newAccount'), icon: 'plus' },
    ]
    openSelectSheet(this.sheets, {
      title: this.t('import.mapping.title'),
      options,
      selected: current === 'new' ? NEW_ACCOUNT : current,
    }).subscribe((value) => {
      if (value !== undefined) {
        const choice: MappingChoice = value === NEW_ACCOUNT ? 'new' : value
        this.store.choose(accountNumber, choice)
      }
    })
  }

  protected async applyMapping(): Promise<void> {
    const next = await this.store.applyMapping((accountNumber) =>
      this.t('import.mapping.newAccountName', { number: accountNumber.slice(-4) })
    )
    await this.go(next)
  }

  protected openBatch(): void {
    const id = this.openBatchId()
    if (id !== null) {
      void this.router.navigate(['/import', id])
    }
  }

  private async go(next: StagedNext | null): Promise<void> {
    if (next?.next === 'review') {
      await this.router.navigate(['/import', next.batchId])
    }
  }

  private describe(problem: UploadProblem): string {
    switch (problem.kind) {
      case 'file':
        return this.t(`import.upload.problem.${problem.problem}`)
      case 'csv': {
        const message = CSV_CODES.includes(problem.code)
          ? this.t(`import.upload.csv.${problem.code}`)
          : (problem.message ?? this.t('errors.server'))
        const where =
          problem.line === null
            ? ''
            : problem.column === null
              ? this.t('import.upload.csv.whereLine', { line: problem.line })
              : this.t('import.upload.csv.where', { line: problem.line, column: problem.column })
        return [message, where].filter(Boolean).join(' ')
      }
      case 'batchOpen':
        return this.t('import.upload.problem.batchOpen')
      case 'limit':
        return this.t('import.upload.problem.limit')
      case 'invalid':
        return problem.message || this.t('errors.server')
      case 'failure':
        return this.t(problem.message.key, problem.message.params)
    }
  }

  /** "1.2 MB" / "340 KB" in the active locale. */
  private size(bytes: number): string {
    const locale = this.locale()
    if (bytes >= 1024 * 1024) {
      const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
        bytes / (1024 * 1024)
      )
      return this.t('import.upload.size.mb', { value })
    }
    const value = new Intl.NumberFormat(locale).format(Math.max(1, Math.round(bytes / 1024)))
    return this.t('import.upload.size.kb', { value })
  }
}
