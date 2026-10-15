import { DialogRef } from '@angular/cdk/dialog'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { formatWeekdayDate } from '../../domain/dates'
import type { TransactionKind } from '../../domain/money'
import type { OutboxEntry, OutboxStatus } from '../../domain/outbox'
import { categoryIcon } from '../../shared/icons/category-icons'
import { IconComponent } from '../../shared/icons/icon.component'
import type { IconName } from '../../shared/icons/icon-names'
import { AmountDisplayComponent } from '../../shared/ui/amount-display/amount-display.component'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../shared/ui/button/button.component'

/**
 * Words read from TypeScript, relative to the `outbox` scope the pill provides:
 * t(outbox.sheet.kind.expense, outbox.sheet.kind.income, outbox.sheet.kind.transfer)
 */
const KIND_KEYS = ['sheet.kind.expense', 'sheet.kind.income', 'sheet.kind.transfer']

/** One queued entry as the sheet shows it. */
interface OutboxRow {
  id: string
  status: OutboxStatus
  icon: IconName
  title: string
  meta: string
  cents: number
  kind: TransactionKind
  /** The API's message for a refused entry ('' when it gave none). */
  error: string
}

/**
 * The sheet behind the sync pill: every entry saved on this phone but not
 * on the server yet, oldest first, with its amount, payee or category (or
 * "from → to"), date and status, the API's message when it was refused,
 * and what to do: retry, edit in quick add (`/add?outbox=<id>`) or discard
 * (asked first). "Retry all" sends everything again now. Closes by itself
 * once nothing is left.
 */
@Component({
  selector: 'app-outbox-sheet',
  imports: [
    AmountDisplayComponent,
    BottomSheetComponent,
    ButtonComponent,
    IconComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet
      [title]="'outbox.sheet.title' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <div data-testid="outbox.sheet">
        <p class="px-4 pb-2 text-body text-ink-2">{{ 'outbox.sheet.body' | transloco }}</p>
        <ul role="list">
          @for (row of rows(); track row.id) {
            <li
              data-testid="outbox.entry"
              class="flex flex-col gap-2 border-b border-line px-4 py-3"
              [attr.data-status]="row.status"
            >
              <div class="flex items-center gap-3">
                <span
                  class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-1"
                >
                  <app-icon [name]="row.icon" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-body text-ink-1">{{ row.title }}</span>
                  <span class="truncate text-caption text-ink-3">{{ row.meta }}</span>
                </span>
                <app-amount-display class="shrink-0" [cents]="row.cents" [kind]="row.kind" />
              </div>

              <p
                class="flex items-start gap-1.5 text-label text-ink-2"
                data-testid="outbox.entry.status"
              >
                @switch (row.status) {
                  @case ('syncing') {
                    <app-icon name="loader-circle" class="animate-spin" [size]="16" />
                    <span>{{ 'outbox.sheet.status.syncing' | transloco }}</span>
                  }
                  @case ('failed') {
                    <app-icon name="triangle-alert" class="text-status-warning" [size]="16" />
                    <span>
                      <span class="text-ink-1">{{ 'outbox.sheet.status.failed' | transloco }}</span>
                      ·
                      <span data-testid="outbox.entry.error">{{
                        row.error || ('outbox.sheet.refused' | transloco)
                      }}</span>
                    </span>
                  }
                  @default {
                    @if (outbox.isOnline()) {
                      <app-icon name="refresh-cw" [size]="16" />
                      <span>{{ 'outbox.sheet.status.pending' | transloco }}</span>
                    } @else {
                      <app-icon name="wifi-off" [size]="16" />
                      <span>{{ 'outbox.sheet.status.offline' | transloco }}</span>
                    }
                  }
                }
              </p>

              @if (confirming() === row.id) {
                <div class="flex items-center gap-2" data-testid="outbox.entry.confirm">
                  <p class="min-w-0 flex-1 text-label text-ink-1">
                    {{ 'outbox.sheet.confirm.question' | transloco }}
                  </p>
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    data-testid="outbox.entry.keep"
                    (click)="confirming.set(null)"
                  >
                    {{ 'outbox.sheet.confirm.keep' | transloco }}
                  </button>
                  <button
                    appButton
                    type="button"
                    variant="destructive"
                    data-testid="outbox.entry.confirmDiscard"
                    (click)="discard(row.id)"
                  >
                    {{ 'outbox.sheet.confirm.discard' | transloco }}
                  </button>
                </div>
              } @else {
                <div class="-mr-3 flex flex-wrap justify-end">
                  @if (row.status === 'failed') {
                    <button
                      appButton
                      type="button"
                      variant="ghost"
                      icon="refresh-cw"
                      data-testid="outbox.entry.retry"
                      (click)="retry(row.id)"
                    >
                      {{ 'outbox.sheet.retry' | transloco }}
                    </button>
                  }
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    icon="pencil"
                    data-testid="outbox.entry.edit"
                    [disabled]="row.status === 'syncing'"
                    (click)="edit(row.id)"
                  >
                    {{ 'outbox.sheet.edit' | transloco }}
                  </button>
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    icon="trash-2"
                    data-testid="outbox.entry.discard"
                    [disabled]="row.status === 'syncing'"
                    (click)="confirming.set(row.id)"
                  >
                    {{ 'outbox.sheet.discard' | transloco }}
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      </div>

      <div sheetFooter>
        <button
          appButton
          type="button"
          size="block"
          icon="refresh-cw"
          data-testid="outbox.retryAll"
          [loading]="outbox.isSyncing()"
          (click)="retryAll()"
        >
          {{ 'outbox.sheet.retryAll' | transloco }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class OutboxSheetComponent {
  protected readonly outbox = inject(OutboxStore)
  private readonly directory = inject(HouseholdDirectory)
  private readonly router = inject(Router)
  private readonly dialogRef = inject(DialogRef, { optional: true })
  private readonly locale = inject(APP_LOCALE)

  /** The entry whose "Discard" waits for confirmation. */
  protected readonly confirming = signal<string | null>(null)

  private readonly kindLabels = translateSignal(KIND_KEYS)

  protected readonly rows = computed(() => this.outbox.entries().map((entry) => this.row(entry)))

  constructor() {
    // Names for accounts and categories (already loaded on most screens).
    void this.directory.load().catch(() => undefined)
    effect(() => {
      if (this.outbox.entries().length === 0) {
        this.dialogRef?.close()
      }
    })
  }

  protected retry(id: string): void {
    void this.outbox.retry(id)
  }

  protected retryAll(): void {
    void this.outbox.retry()
  }

  protected discard(id: string): void {
    this.confirming.set(null)
    this.outbox.discard(id)
  }

  /** Quick add opens with the entry's values; saving there replaces it. */
  protected edit(id: string): void {
    this.dialogRef?.close()
    void this.router.navigate(['/add'], { queryParams: { outbox: id } })
  }

  private row(entry: OutboxEntry): OutboxRow {
    const [expense = '', income = '', transfer = ''] = this.kindLabels()
    const date = formatWeekdayDate(entry.payload.date, this.locale())
    const base = {
      id: entry.id,
      status: entry.status,
      error: entry.error?.message ?? '',
    }
    if (entry.kind === 'transfer') {
      const from = this.directory.account(entry.payload.fromAccountId)?.name
      const to = this.directory.account(entry.payload.toAccountId)?.name
      return {
        ...base,
        icon: 'arrow-left-right',
        title: from && to ? `${from} → ${to}` : transfer,
        meta: date,
        cents: entry.payload.amountCents,
        kind: 'transfer',
      }
    }
    const { payload } = entry
    const category = this.directory.category(payload.categoryId)?.category ?? null
    const account = this.directory.account(payload.accountId)?.name
    const title = payload.payee ?? category?.name ?? (payload.kind === 'income' ? income : expense)
    const meta = [date, payload.payee ? category?.name : null, account].filter(Boolean).join(' · ')
    return {
      ...base,
      icon: category ? categoryIcon(category) : 'circle-dashed',
      title,
      meta,
      cents: payload.kind === 'income' ? payload.amountCents : -payload.amountCents,
      kind: payload.kind,
    }
  }
}
