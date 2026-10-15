import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { Transaction } from '../../../core/api/api-types'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { formatMoney } from '../../../domain/money'
import {
  MAX_SPLIT_LINES,
  addSplitLine,
  canSaveSplit,
  initialSplitLines,
  removeSplitLine,
  splitIssues,
  splitLeftCents,
  withRemainder,
  type SplitDraftLine,
} from '../../../domain/split'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { AmountKeypadComponent } from '../../../shared/ui/amount-keypad/amount-keypad.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { TransactionsStore } from '../transactions.store'

/**
 * Keys read from TypeScript:
 * t(transactions.split.over, transactions.split.missingCategory, transactions.split.zeroLine)
 * t(transactions.split.balanced, transactions.split.chooseCategory, transactions.split.categoryTitle)
 */
/** Relative to the list page's scope: t(transactions.split.rest) */
const CATALOGUE_PROBE = 'split.rest'
const KEYS = {
  over: 'transactions.split.over',
  missingCategory: 'transactions.split.missingCategory',
  zeroLine: 'transactions.split.zeroLine',
  balanced: 'transactions.split.balanced',
  chooseCategory: 'transactions.split.chooseCategory',
  categoryTitle: 'transactions.split.categoryTitle',
}

export interface SplitSheetData {
  row: Transaction
}

/**
 * Split editor (plan, screen 9): N lines of category + amount. The keypad
 * types the selected line; the last line always takes the remainder, so
 * the lines add up to the transaction by construction. Saving is allowed
 * once every line has a category and an amount and nothing goes over.
 * Closes with the saved transaction.
 */
@Component({
  selector: 'app-split-sheet',
  imports: [
    AmountKeypadComponent,
    BannerComponent,
    BottomSheetComponent,
    ButtonComponent,
    ChipComponent,
    IconButtonComponent,
    IconComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet
      [title]="'transactions.split.title' | transloco: { amount: totalText() }"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      @if (failure(); as message) {
        <app-banner class="mx-4 mb-2" status="critical" [message]="message" />
      }
      <ol class="flex flex-col" data-testid="transactions.split.lines">
        @for (line of filled(); track $index; let i = $index; let last = $last) {
          <li
            class="flex h-14 items-center gap-2 border-b border-line px-4"
            [attr.data-testid]="'transactions.split.line.' + i"
          >
            <button
              appChip
              class="min-w-0 flex-1 justify-start"
              trailing="chevron-down"
              [icon]="glyph(line.categoryId)"
              [attr.data-testid]="'transactions.split.category.' + i"
              (click)="chooseCategory(i)"
            >
              {{ categoryName(line.categoryId) }}
            </button>
            @if (last) {
              <span
                class="flex h-11 shrink-0 flex-col items-end justify-center pl-3"
                data-testid="transactions.split.rest"
              >
                <span
                  class="text-amount tnum"
                  [class]="line.amountCents < 0 ? 'text-status-critical' : 'text-ink-1'"
                  >{{ money(line.amountCents) }}</span
                >
                <span class="text-caption text-ink-3">{{
                  'transactions.split.rest' | transloco
                }}</span>
              </span>
            } @else {
              <button
                type="button"
                class="h-11 shrink-0 rounded-md border px-3 text-amount tnum"
                [class]="
                  active() === i
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line-strong bg-surface-1 text-ink-1'
                "
                [attr.data-testid]="'transactions.split.amount.' + i"
                [attr.aria-pressed]="active() === i"
                [attr.aria-label]="
                  ('transactions.split.amount' | transloco: { number: i + 1 }) +
                  ', ' +
                  money(line.amountCents)
                "
                (click)="active.set(i)"
              >
                {{ money(line.amountCents) }}
              </button>
            }
            @if (lines().length > 2) {
              <button
                appIconButton
                type="button"
                icon="x"
                class="-mr-3"
                [label]="'transactions.split.remove' | transloco: { number: i + 1 }"
                (click)="remove(i)"
              ></button>
            }
          </li>
        }
      </ol>
      @if (lines().length < maxLines) {
        <button
          type="button"
          class="mx-1 inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-label text-accent active:bg-surface-2"
          data-testid="transactions.split.add"
          (click)="add()"
        >
          <app-icon name="plus" [size]="16" />{{ 'transactions.split.add' | transloco }}
        </button>
      }

      <p
        class="flex items-center gap-1.5 px-4 py-2 text-label"
        role="status"
        data-testid="transactions.split.status"
        [class]="status().tone === 'critical' ? 'text-status-critical' : 'text-ink-2'"
      >
        <app-icon
          [name]="status().icon"
          [size]="16"
          [class]="status().tone === 'good' ? 'text-status-good' : ''"
        />{{ status().text }}
      </p>

      <app-amount-keypad
        data-testid="transactions.split.keypad"
        [value]="activeAmount()"
        (valueChange)="setAmount($event)"
      />

      <div sheetFooter class="flex flex-col gap-2">
        <button
          appButton
          type="button"
          size="block"
          data-testid="transactions.split.save"
          [disabled]="!canSave()"
          [loading]="saving()"
          (click)="save()"
        >
          {{ 'transactions.split.save' | transloco }}
        </button>
        @if (data.row.isSplit) {
          <button
            appButton
            type="button"
            variant="ghost"
            data-testid="transactions.split.unsplit"
            [disabled]="saving()"
            (click)="unsplit()"
          >
            {{ 'transactions.split.unsplit' | transloco }}
          </button>
        }
      </div>
    </app-bottom-sheet>
  `,
})
export class SplitSheetComponent {
  protected readonly data = inject<SplitSheetData>(DIALOG_DATA)
  private readonly dialogRef = inject<DialogRef<Transaction>>(DialogRef)
  private readonly store = inject(TransactionsStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)

  protected readonly maxLines = MAX_SPLIT_LINES
  /** Changes once the `transactions` catalogue is in (computed wording depends on it). */
  private readonly catalogue = translateSignal(CATALOGUE_PROBE)
  private readonly total = Math.abs(this.data.row.amountCents)

  protected readonly lines = signal<SplitDraftLine[]>(initialSplitLines(this.data.row))
  /** The line the keypad types into; never the last (it takes the remainder). */
  protected readonly active = signal(0)
  protected readonly saving = signal(false)
  protected readonly failure = signal('')

  protected readonly filled = computed(() => withRemainder(this.total, this.lines()))
  protected readonly canSave = computed(
    () => canSaveSplit(this.total, this.lines()) && !this.saving()
  )
  protected readonly activeAmount = computed(() => this.lines()[this.active()]?.amountCents ?? 0)
  protected readonly totalText = computed(() => this.money(this.total))

  protected readonly status = computed<{
    tone: 'critical' | 'neutral' | 'good'
    icon: IconName
    text: string
  }>(() => {
    // Re-word when the language changes or the catalogue finishes loading.
    this.locale()
    this.catalogue()
    const issues = splitIssues(this.total, this.lines())
    if (issues.includes('overTotal')) {
      const over = -splitLeftCents(this.total, this.lines())
      return {
        tone: 'critical',
        icon: 'circle-alert',
        text: this.t(KEYS.over, { amount: this.money(over) }),
      }
    }
    if (issues.includes('missingCategory')) {
      return { tone: 'neutral', icon: 'info', text: this.t(KEYS.missingCategory) }
    }
    if (issues.includes('zeroLine')) {
      return { tone: 'neutral', icon: 'info', text: this.t(KEYS.zeroLine) }
    }
    return {
      tone: 'good',
      icon: 'circle-check',
      text: this.t(KEYS.balanced, { amount: this.totalText() }),
    }
  })

  protected money(cents: number): string {
    return formatMoney(cents, this.locale())
  }

  protected categoryName(id: number | null): string {
    return id === null
      ? this.t(KEYS.chooseCategory)
      : (this.store.categories.byId().get(id)?.name ?? '')
  }

  protected glyph(id: number | null): IconName {
    return id === null ? 'circle-dashed' : categoryIcon(this.store.categories.byId().get(id))
  }

  protected setAmount(cents: number): void {
    const index = this.active()
    this.lines.update((lines) =>
      withRemainder(
        this.total,
        lines.map((line, position) => (position === index ? { ...line, amountCents: cents } : line))
      )
    )
  }

  protected add(): void {
    this.lines.update((lines) => addSplitLine(this.total, lines))
    // The new line takes the remainder; type into the one that used to.
    this.active.set(this.lines().length - 2)
  }

  protected remove(index: number): void {
    this.lines.update((lines) => removeSplitLine(this.total, lines, index))
    this.active.update((active) => Math.min(active, this.lines().length - 2))
  }

  protected chooseCategory(index: number): void {
    const kind = this.data.row.amountCents < 0 ? 'expense' : 'income'
    const options = this.store.categories
      .options()
      .filter((option) => option.kind === kind)
      .map((option) => ({
        value: option.id,
        label: option.name,
        meta: option.groupName,
        icon: categoryIcon(option),
      }))
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.categoryTitle),
      options,
      selected: this.lines()[index]?.categoryId ?? null,
    }).subscribe((categoryId) => {
      if (categoryId !== undefined) {
        this.lines.update((lines) =>
          lines.map((line, position) => (position === index ? { ...line, categoryId } : line))
        )
      }
    })
  }

  protected async save(): Promise<void> {
    await this.persist(() => this.store.saveSplits(this.data.row, this.lines()))
  }

  protected async unsplit(): Promise<void> {
    const first = this.lines()[0]?.categoryId ?? null
    await this.persist(() => this.store.unsplit(this.data.row, first))
  }

  private async persist(change: () => Promise<Transaction>): Promise<void> {
    if (this.saving()) {
      return
    }
    this.saving.set(true)
    this.failure.set('')
    try {
      const saved = await change()
      this.dialogRef.close(saved)
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.failure.set(Object.values(failure.fields)[0] ?? '')
      } else if (failure.kind !== 'unauthorized') {
        const message = failureMessage(failure)
        this.failure.set(this.t(message.key, message.params))
      }
    } finally {
      this.saving.set(false)
    }
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}
