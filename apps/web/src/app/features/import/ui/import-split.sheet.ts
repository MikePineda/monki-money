import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import { rowState, type RowChange } from '../../../domain/import-row'
import { formatMoney } from '../../../domain/money'
import {
  MAX_SPLIT_LINES,
  addSplitLine,
  canSaveSplit,
  initialSplitLines,
  removeSplitLine,
  splitIssues,
  splitLeftCents,
  toSplitPayload,
  withRemainder,
  type SplitDraftLine,
} from '../../../domain/split'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { AmountKeypadComponent } from '../../../shared/ui/amount-keypad/amount-keypad.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { ImportReviewStore } from '../import-review.store'

export interface ImportSplitSheetData {
  rowId: number
}

/**
 * Keys read from TypeScript:
 * t(import.split.over, import.split.missingCategory, import.split.zeroLine)
 * t(import.split.balanced, import.split.chooseCategory, import.split.categoryTitle)
 */
const KEYS = {
  over: 'import.split.over',
  missingCategory: 'import.split.missingCategory',
  zeroLine: 'import.split.zeroLine',
  balanced: 'import.split.balanced',
  chooseCategory: 'import.split.chooseCategory',
  categoryTitle: 'import.split.categoryTitle',
}

/** A key of this scope, read only to know when the catalogue is in: t(import.split.rest) */
const CATALOGUE_PROBE = 'split.rest'

/**
 * Splits a bank row over several categories before it is confirmed (the
 * same rules as a transaction's split, `domain/split.ts`): the keypad types
 * the selected line and the last line takes the remainder. Saving stores
 * the lines as the row's decision (the row then has no single category);
 * "Remove split" goes back to one category.
 */
@Component({
  selector: 'app-import-split-sheet',
  imports: [
    AmountKeypadComponent,
    BottomSheetComponent,
    ButtonComponent,
    ChipComponent,
    IconButtonComponent,
    IconComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet
      [title]="'import.split.title' | transloco: { amount: totalText() }"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <ol class="flex flex-col" data-testid="import.split.lines">
        @for (line of filled(); track $index; let i = $index; let last = $last) {
          <li class="flex h-14 items-center gap-2 border-b border-line px-4">
            <button
              appChip
              class="min-w-0 flex-1 justify-start"
              trailing="chevron-down"
              [icon]="glyph(line.categoryId)"
              [attr.data-testid]="'import.split.category.' + i"
              (click)="chooseCategory(i)"
            >
              {{ categoryName(line.categoryId) }}
            </button>
            @if (last) {
              <span class="flex h-11 shrink-0 flex-col items-end justify-center pl-3">
                <span
                  class="text-amount tnum"
                  [class]="line.amountCents < 0 ? 'text-status-critical' : 'text-ink-1'"
                  >{{ money(line.amountCents) }}</span
                >
                <span class="text-caption text-ink-3">{{ 'import.split.rest' | transloco }}</span>
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
                [attr.aria-pressed]="active() === i"
                [attr.aria-label]="
                  ('import.split.amount' | transloco: { number: i + 1 }) +
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
                [label]="'import.split.remove' | transloco: { number: i + 1 }"
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
          (click)="add()"
        >
          <app-icon name="plus" [size]="16" />{{ 'import.split.add' | transloco }}
        </button>
      }
      <p
        class="flex items-center gap-1.5 px-4 py-2 text-label"
        role="status"
        data-testid="import.split.status"
        [class]="status().tone === 'critical' ? 'text-status-critical' : 'text-ink-2'"
      >
        <app-icon
          [name]="status().icon"
          [size]="16"
          [class]="status().tone === 'good' ? 'text-status-good' : ''"
        />{{ status().text }}
      </p>
      <app-amount-keypad [value]="activeAmount()" (valueChange)="setAmount($event)" />

      <div sheetFooter class="flex flex-col gap-2">
        <button
          appButton
          type="button"
          size="block"
          data-testid="import.split.save"
          [disabled]="!canSave()"
          (click)="save()"
        >
          {{ 'import.split.save' | transloco }}
        </button>
        @if (hasSplit) {
          <button appButton type="button" variant="ghost" (click)="unsplit()">
            {{ 'import.split.unsplit' | transloco }}
          </button>
        }
      </div>
    </app-bottom-sheet>
  `,
})
export class ImportSplitSheetComponent {
  private readonly data = inject<ImportSplitSheetData>(DIALOG_DATA)
  private readonly dialogRef = inject<DialogRef<void>>(DialogRef)
  private readonly store = inject(ImportReviewStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)
  private readonly catalogue = translateSignal(CATALOGUE_PROBE)

  private readonly row = this.store.rows().find((item) => item.id === this.data.rowId)
  private readonly total = Math.abs(this.row?.amountCents ?? 0)
  protected readonly hasSplit = (this.row?.decision?.splits ?? []).length > 0
  protected readonly maxLines = MAX_SPLIT_LINES

  protected readonly lines = signal<SplitDraftLine[]>(this.initialLines())
  protected readonly active = signal(0)
  protected readonly filled = computed(() => withRemainder(this.total, this.lines()))
  protected readonly canSave = computed(() => canSaveSplit(this.total, this.lines()))
  protected readonly activeAmount = computed(() => this.lines()[this.active()]?.amountCents ?? 0)
  protected readonly totalText = computed(() => this.money(this.total))

  protected readonly status = computed<{
    tone: 'critical' | 'neutral' | 'good'
    icon: IconName
    text: string
  }>(() => {
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
      : (this.store.directory.category(id)?.category.name ?? '')
  }

  protected glyph(id: number | null): IconName {
    return id === null ? 'circle-dashed' : categoryIcon(this.store.directory.category(id)?.category)
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
    this.active.set(this.lines().length - 2)
  }

  protected remove(index: number): void {
    this.lines.update((lines) => removeSplitLine(this.total, lines, index))
    this.active.update((active) => Math.min(active, this.lines().length - 2))
  }

  protected chooseCategory(index: number): void {
    const kind = (this.row?.amountCents ?? 0) < 0 ? 'expense' : 'income'
    const options = this.store.directory.categoriesOf(kind).map(({ category, group }) => ({
      value: category.id,
      label: category.name,
      meta: group.name,
      icon: categoryIcon(category),
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

  protected save(): void {
    if (!this.canSave()) {
      return
    }
    const change: RowChange = {
      splits: toSplitPayload(this.total, this.lines()),
      categoryId: null,
    }
    if (this.row && this.row.resolution !== 'new') {
      change.resolution = 'new'
    }
    void this.store.decide(this.data.rowId, change)
    this.dialogRef.close()
  }

  protected unsplit(): void {
    const first = this.lines()[0]?.categoryId ?? null
    void this.store.decide(this.data.rowId, { splits: [], categoryId: first })
    this.dialogRef.close()
  }

  private initialLines(): SplitDraftLine[] {
    const splits = this.row?.decision?.splits ?? []
    if (splits.length >= 2) {
      return withRemainder(
        this.total,
        splits.map((line) => ({ categoryId: line.categoryId, amountCents: line.amountCents }))
      )
    }
    return initialSplitLines({
      amountCents: this.total,
      categoryId: this.row ? rowState(this.row).categoryId : null,
      splits: [],
    })
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}
