import { Component, booleanAttribute, computed, inject, input, model } from '@angular/core'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import { addDays } from '../../domain/month'
import { IconComponent } from '../icons/icon.component'
import { AmountDisplayComponent } from '../ui/amount-display/amount-display.component'
import { AmountKeypadComponent } from '../ui/amount-keypad/amount-keypad.component'
import { BottomSheetService } from '../ui/bottom-sheet/bottom-sheet.service'
import { ChipComponent } from '../ui/chip/chip.component'
import { openSelectSheet, type SelectOption } from '../ui/select-sheet/select-sheet.component'
import { TextFieldComponent } from '../ui/text-field/text-field.component'
import { TagsFieldComponent } from './tags-field.component'
import { provideTransactionFormI18n } from './transaction-form-i18n'

/** What the transfer form edits: a positive amount between two of the household's accounts. */
export interface TransferDraft {
  fromAccountId: number | null
  toAccountId: number | null
  amountCents: number
  date: string
  memo: string
  /** Written on both legs; a transfer into savings for a trip counts as set aside. */
  tags: string[]
}

/**
 * Keys read from TypeScript (translateSignal() takes them relative to the
 * scope this component provides; sheet titles take full keys):
 * t(transactionForm.transfer.chooseAccount, transactionForm.transfer.sameAccount)
 * t(transactionForm.transfer.fromTitle, transactionForm.transfer.toTitle)
 */
const WORD_KEYS = ['transfer.chooseAccount', 'transfer.sameAccount']
const TITLE_KEYS = {
  fromAccountId: 'transactionForm.transfer.fromTitle',
  toAccountId: 'transactionForm.transfer.toTitle',
}

/** A one-tap route ("→ Savings"), already named by the host. */
export interface TransferPreset {
  fromAccountId: number
  toAccountId: number
  fromName: string
  toName: string
}

export const EMPTY_TRANSFER: TransferDraft = {
  fromAccountId: null,
  toAccountId: null,
  amountCents: 0,
  date: '',
  memo: '',
  tags: [],
}

/** Both accounts, different from each other, an amount and a date. */
export function transferDraftValid(draft: TransferDraft): boolean {
  return (
    draft.fromAccountId !== null &&
    draft.toAccountId !== null &&
    draft.fromAccountId !== draft.toAccountId &&
    draft.amountCents > 0 &&
    draft.date !== ''
  )
}

/**
 * The transfer form (from and to accounts, amount from the keypad, date,
 * memo, and tags when `withTags`), shared by the edit sheet and quick add.
 * A transfer never counts as income or spending; both legs are written by
 * the API (tags too: a tagged transfer into savings is money set aside).
 *
 * Quick add hosts it with `keypad="external"`, its most used routes as
 * one-tap `presets`, and `compact` (date, memo and tags fold into one row).
 */
@Component({
  selector: 'app-transfer-form',
  providers: [provideTransactionFormI18n()],
  imports: [
    AmountDisplayComponent,
    AmountKeypadComponent,
    ChipComponent,
    IconComponent,
    TagsFieldComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <div
      class="flex flex-col gap-1 px-4"
      [class]="keypad() === 'external' ? 'items-start' : 'items-center'"
    >
      @if (keypad() === 'external') {
        <p data-testid="transactions.transfer.amount">
          <span class="sr-only">{{ 'transactionForm.form.amount' | transloco }}</span>
          <app-amount-display variant="hero" [cents]="draft().amountCents" />
        </p>
      } @else {
        <button
          type="button"
          class="rounded-md px-2"
          data-testid="transactions.transfer.amount"
          [attr.aria-expanded]="keypadOpen()"
          (click)="keypadOpen.set(!keypadOpen())"
        >
          <span class="sr-only">{{ 'transactionForm.form.amount' | transloco }}</span>
          <app-amount-display variant="hero" [cents]="draft().amountCents" />
        </button>
      }
      @if (errors()['amountCents']; as message) {
        <p class="flex items-center gap-1.5 text-label text-status-critical">
          <app-icon name="circle-alert" [size]="16" />{{ message }}
        </p>
      } @else if (!keypadOpen() && keypad() === 'inline') {
        <p class="text-caption text-ink-3">{{ 'transactionForm.form.amountHint' | transloco }}</p>
      }
    </div>
    @if (keypadOpen() && keypad() === 'inline') {
      <app-amount-keypad
        [value]="draft().amountCents"
        (valueChange)="patch({ amountCents: $event })"
      />
    }

    <div class="flex flex-col gap-2 px-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-label text-ink-2">{{ 'transactionForm.transfer.from' | transloco }}</span>
        <button
          appChip
          trailing="chevron-down"
          data-testid="transactions.transfer.from"
          (click)="choose('fromAccountId')"
        >
          {{ accountName(draft().fromAccountId) }}
        </button>
        <app-icon name="arrow-left-right" class="text-ink-3" />
        <span class="text-label text-ink-2">{{ 'transactionForm.transfer.to' | transloco }}</span>
        <button
          appChip
          trailing="chevron-down"
          data-testid="transactions.transfer.to"
          (click)="choose('toAccountId')"
        >
          {{ accountName(draft().toAccountId) }}
        </button>
      </div>
      @if (accountError(); as message) {
        <p
          class="flex items-center gap-1.5 text-label text-status-critical"
          data-testid="transactions.transfer.accountError"
        >
          <app-icon name="circle-alert" [size]="16" />{{ message }}
        </p>
      }
    </div>

    @if (presets().length > 0) {
      <section class="flex flex-col gap-2 px-4">
        <h3 class="text-label text-ink-2">{{ 'transactionForm.transfer.presets' | transloco }}</h3>
        <div class="flex flex-wrap gap-2">
          @for (preset of presets(); track preset.fromAccountId + '>' + preset.toAccountId) {
            <button
              appChip
              data-testid="transactions.transfer.preset"
              pressable
              [selected]="isCurrent(preset)"
              [attr.aria-label]="
                'transactionForm.transfer.route'
                  | transloco: { from: preset.fromName, to: preset.toName }
              "
              (click)="
                patch({ fromAccountId: preset.fromAccountId, toAccountId: preset.toAccountId })
              "
            >
              {{ 'transactionForm.transfer.preset' | transloco: { to: preset.toName } }}
            </button>
          }
        </div>
      </section>
    }

    @if (compact()) {
      <button
        type="button"
        data-testid="transactions.transfer.detailsToggle"
        class="mx-4 flex h-12 items-center gap-3 rounded-md border border-line bg-surface-1 pr-3 pl-4 text-left active:bg-surface-2"
        [attr.aria-expanded]="detailsOpen()"
        (click)="detailsOpen.set(!detailsOpen())"
      >
        <app-icon name="pencil" class="shrink-0 text-ink-2" />
        <span
          class="min-w-0 flex-1 truncate text-body"
          [class]="draft().memo.trim() ? 'text-ink-1' : 'text-ink-2'"
        >
          {{ draft().memo.trim() || ('transactionForm.transfer.details' | transloco) }}
        </span>
        <app-icon
          name="chevron-down"
          class="shrink-0 text-ink-2 transition-transform"
          [class.rotate-180]="detailsOpen()"
        />
      </button>
    }

    @if (!compact() || detailsOpen()) {
      @if (today()) {
        <div class="flex flex-wrap gap-2 px-4">
          <button
            appChip
            pressable
            [selected]="draft().date === today()"
            (click)="patch({ date: today() })"
          >
            {{ 'transactionForm.form.today' | transloco }}
          </button>
          <button
            appChip
            [selected]="draft().date === yesterday()"
            (click)="patch({ date: yesterday() })"
          >
            {{ 'transactionForm.form.yesterday' | transloco }}
          </button>
        </div>
      }

      <label class="flex flex-col gap-2 px-4">
        <span class="text-label text-ink-2">{{ 'transactionForm.form.date' | transloco }}</span>
        <input
          type="date"
          class="h-12 w-full rounded-md border border-line-strong bg-surface-1 px-4 text-body text-ink-1 tnum focus-visible:outline-none focus:border-2 focus:border-accent focus:px-[15px]"
          data-testid="transactions.transfer.date"
          [value]="draft().date"
          [attr.max]="today() || null"
          (change)="onDate($event)"
        />
        @if (errors()['date']; as message) {
          <span class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </span>
        }
      </label>

      <app-text-field
        class="px-4"
        data-testid="transactions.transfer.memo"
        autocomplete="off"
        [label]="'transactionForm.transfer.memo' | transloco"
        [error]="errors()['memo'] ?? ''"
        [value]="draft().memo"
        (valueChange)="patch({ memo: $event })"
      />

      @if (withTags()) {
        <app-tags-field
          class="px-4"
          testId="transactions.transfer.tag"
          [known]="tagSuggestions()"
          [error]="tagError()"
          [tags]="draft().tags"
          (tagsChange)="patch({ tags: $event })"
        />
      }
    }
  `,
  host: { class: 'flex flex-col gap-5' },
})
export class TransferFormComponent {
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)

  readonly draft = model<TransferDraft>(EMPTY_TRANSFER)
  readonly accounts = input<readonly SelectOption<number>[]>([])
  /** A 422's `{ field: message }`, keyed by API field. */
  readonly errors = input<Record<string, string>>({})
  readonly keypadOpen = model(false)
  /** `external`: the host docks the keypad; the amount is display only. */
  readonly keypad = input<'inline' | 'external'>('inline')
  /** The most used routes, offered as one-tap chips. */
  readonly presets = input<readonly TransferPreset[]>([])
  /** Fold the date and the memo into one "More" row. */
  readonly compact = input(false, { transform: booleanAttribute })
  readonly detailsOpen = model(false)
  /** Today in the household time zone: offers "Today" / "Yesterday" and caps the date. */
  readonly today = input('')
  /** Offer the tags field (the edit sheet and quick add do). */
  readonly withTags = input(false, { transform: booleanAttribute })
  /** The household's tags, most recently used first. */
  readonly tagSuggestions = input<readonly string[]>([])

  private readonly words = translateSignal(WORD_KEYS)

  /** A 422 on `tags` or one of them (`tags.0`). */
  protected readonly tagError = computed(
    () => Object.entries(this.errors()).find(([field]) => field.split('.')[0] === 'tags')?.[1] ?? ''
  )

  readonly valid = computed(() => transferDraftValid(this.draft()))

  protected readonly accountError = computed(() => {
    const draft = this.draft()
    const server = this.errors()['toAccountId'] ?? this.errors()['fromAccountId']
    if (server) {
      return server
    }
    return draft.fromAccountId !== null && draft.fromAccountId === draft.toAccountId
      ? (this.words()[1] ?? '')
      : ''
  })

  protected readonly yesterday = computed(() => (this.today() ? addDays(this.today(), -1) : ''))

  protected isCurrent(preset: TransferPreset): boolean {
    const draft = this.draft()
    return draft.fromAccountId === preset.fromAccountId && draft.toAccountId === preset.toAccountId
  }

  protected accountName(id: number | null): string {
    return this.accounts().find((option) => option.value === id)?.label ?? this.words()[0] ?? ''
  }

  protected patch(changes: Partial<TransferDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }))
  }

  protected choose(field: 'fromAccountId' | 'toAccountId'): void {
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(TITLE_KEYS[field]),
      options: this.accounts(),
      selected: this.draft()[field],
    }).subscribe((accountId) => {
      if (accountId !== undefined) {
        this.patch({ [field]: accountId })
      }
    })
  }

  protected onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value
    if (value) {
      const today = this.today()
      this.patch({ date: today && value > today ? today : value })
    }
  }
}
