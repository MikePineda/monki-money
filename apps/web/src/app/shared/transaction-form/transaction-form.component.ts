import { Component, booleanAttribute, computed, inject, input, model, output } from '@angular/core'
import { FormField, form, maxLength, min, required } from '@angular/forms/signals'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { EntryKind } from '@monkimoney/shared'
import type { CategoryOption } from '../../domain/category-tree'
import { addDays } from '../../domain/month'
import { recentPayees } from '../../domain/transaction-list'
import { categoryIcon } from '../icons/category-icons'
import { IconComponent } from '../icons/icon.component'
import type { IconName } from '../icons/icon-names'
import { AmountDisplayComponent } from '../ui/amount-display/amount-display.component'
import { AmountKeypadComponent } from '../ui/amount-keypad/amount-keypad.component'
import { BannerComponent } from '../ui/banner/banner.component'
import { BottomSheetService } from '../ui/bottom-sheet/bottom-sheet.service'
import { CheckboxComponent } from '../ui/checkbox/checkbox.component'
import { ChipComponent } from '../ui/chip/chip.component'
import type { Person } from '../ui/person-dot/person-dot.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../ui/segmented-control/segmented-control.component'
import { openSelectSheet, type SelectOption } from '../ui/select-sheet/select-sheet.component'
import { TextFieldComponent } from '../ui/text-field/text-field.component'
import { provideTransactionFormI18n } from './transaction-form-i18n'
import { CategoryGridComponent, type CategoryTile } from './category-grid.component'
import { TagsFieldComponent } from './tags-field.component'
import { draftErrors, type TransactionDraft } from './transaction-draft'

/**
 * Keys read from TypeScript. translateSignal() takes them relative to the
 * scope this component provides; sheet titles take full keys.
 * t(transactionForm.form.expense, transactionForm.form.income, transactionForm.form.chooseAccount)
 * t(transactionForm.form.uncategorized, transactionForm.form.accountTitle)
 * t(transactionForm.form.personTitle, transactionForm.form.categoryTitle)
 */
const WORD_KEYS = ['form.expense', 'form.income', 'form.chooseAccount', 'form.uncategorized']
const TITLE_KEYS = {
  account: 'transactionForm.form.accountTitle',
  person: 'transactionForm.form.personTitle',
  category: 'transactionForm.form.categoryTitle',
  uncategorized: 'transactionForm.form.uncategorized',
}

/** A blank expense; hosts replace it with their defaults or a row's values. */
export const EMPTY_DRAFT: TransactionDraft = {
  kind: 'expense',
  amountCents: 0,
  accountId: null,
  paidByUserId: null,
  categoryId: null,
  date: '',
  payee: '',
  description: '',
  isPrivate: false,
  tags: [],
}

/**
 * The expense/income form, shared by the edit sheet and quick add: type,
 * amount (keypad only, never typed text), account, who paid, category,
 * date, payee with recent suggestions, note, private toggle and tags.
 *
 * Presentational: it edits the `draft` model and opens select sheets, and
 * its host saves. Server field errors (a 422's `{ field: message }`) go
 * under the field they belong to; unknown fields show above the form.
 * It provides its own translation scope (`transactionForm`), so any
 * screen can host it.
 *
 * Quick add hosts it with `keypad="external"` (the page docks the keypad),
 * `[showKind]="false"` (the page's segment also offers a transfer),
 * `[categoryTiles]` (the 4 × 2 grid of the most used categories, the
 * eighth tile opens the full list) and `compact` (date, payee, note, tags
 * and the private switch fold into one "More" row).
 */
@Component({
  selector: 'app-transaction-form',
  providers: [provideTransactionFormI18n()],
  imports: [
    AmountDisplayComponent,
    AmountKeypadComponent,
    BannerComponent,
    CategoryGridComponent,
    CheckboxComponent,
    ChipComponent,
    FormField,
    IconComponent,
    SegmentedControlComponent,
    TagsFieldComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    @if (errors().form; as message) {
      <app-banner class="mx-4" status="critical" [message]="message" />
    }

    @if (showKind()) {
      <app-segmented-control
        class="mx-4"
        data-testid="transactions.form.kind"
        [label]="'transactionForm.form.kind' | transloco"
        [options]="kindOptions()"
        [value]="draft().kind"
        (valueChange)="patch({ kind: $event })"
      />
    }

    <div
      class="flex flex-col gap-1 px-4"
      [class]="keypad() === 'external' ? 'items-start' : 'items-center'"
    >
      @if (keypad() === 'external') {
        <p data-testid="transactions.form.amount">
          <span class="sr-only">{{ 'transactionForm.form.amount' | transloco }}</span>
          <app-amount-display variant="hero" [cents]="draft().amountCents" />
        </p>
      } @else {
        <button
          type="button"
          class="rounded-md px-2 disabled:cursor-default"
          data-testid="transactions.form.amount"
          [attr.aria-expanded]="locked() ? null : keypadOpen()"
          [disabled]="locked()"
          (click)="keypadOpen.set(!keypadOpen())"
        >
          <span class="sr-only">{{ 'transactionForm.form.amount' | transloco }}</span>
          <app-amount-display variant="hero" [cents]="draft().amountCents" />
        </button>
      }
      @if (errors().amount; as message) {
        <p
          class="flex items-center gap-1.5 text-label text-status-critical"
          data-testid="transactions.form.amountError"
        >
          <app-icon name="circle-alert" [size]="16" />{{ message }}
        </p>
      } @else if (locked()) {
        <p class="text-center text-caption text-ink-3">
          {{ 'transactionForm.form.amountLocked' | transloco }}
        </p>
      } @else if (!keypadOpen() && keypad() === 'inline') {
        <p class="text-caption text-ink-3">{{ 'transactionForm.form.amountHint' | transloco }}</p>
      }
    </div>

    @if (keypadOpen() && !locked() && keypad() === 'inline') {
      <app-amount-keypad
        data-testid="transactions.form.keypad"
        [value]="draft().amountCents"
        (valueChange)="patch({ amountCents: $event })"
      />
    }

    <div class="flex flex-col gap-2 px-4">
      <div class="flex flex-wrap gap-2">
        <button
          appChip
          trailing="chevron-down"
          icon="wallet"
          data-testid="transactions.form.account"
          (click)="chooseAccount()"
        >
          {{ accountLabel() }}
        </button>
        <button
          appChip
          trailing="chevron-down"
          data-testid="transactions.form.person"
          [person]="personMark()"
          (click)="choosePerson()"
        >
          {{ personLabel() }}
        </button>
      </div>
      @for (message of [errors().account, errors().person]; track $index) {
        @if (message) {
          <p class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        }
      }
    </div>

    @if (categoryTiles(); as tiles) {
      <div class="flex flex-col gap-2 px-4">
        <app-category-grid
          data-testid="transactions.form.categoryGrid"
          [tiles]="tiles"
          [selected]="draft().categoryId"
          [label]="'transactionForm.form.category' | transloco"
          [moreLabel]="'transactionForm.form.moreCategories' | transloco"
          (picked)="toggleCategory($event)"
          (more)="chooseCategory()"
        />
        @if (errors().category; as message) {
          <p class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        }
      </div>
    } @else {
      <div class="flex flex-col gap-2 px-4">
        <span class="text-label text-ink-2">{{ 'transactionForm.form.category' | transloco }}</span>
        <div class="flex flex-wrap items-center gap-2">
          @if (splitCount() > 0) {
            <button
              appChip
              trailing="chevron-down"
              icon="split"
              data-testid="transactions.form.category"
              (click)="splitRequested.emit()"
            >
              {{ 'transactionForm.form.splitInto' | transloco: { count: splitCount() } }}
            </button>
          } @else {
            <button
              appChip
              trailing="chevron-down"
              data-testid="transactions.form.category"
              [icon]="categoryGlyph()"
              (click)="chooseCategory()"
            >
              {{ categoryLabel() }}
            </button>
            @if (splittable()) {
              <button
                type="button"
                class="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-label text-accent active:bg-surface-2"
                data-testid="transactions.form.split"
                (click)="splitRequested.emit()"
              >
                <app-icon name="split" [size]="16" />{{ 'transactionForm.form.split' | transloco }}
              </button>
            }
          }
        </div>
        @if (errors().category; as message) {
          <p class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        }
      </div>
    }

    @if (compact()) {
      <button
        type="button"
        data-testid="transactions.form.detailsToggle"
        class="mx-4 flex h-12 items-center gap-3 rounded-md border border-line bg-surface-1 pr-3 pl-4 text-left active:bg-surface-2"
        [attr.aria-expanded]="detailsOpen()"
        (click)="detailsOpen.set(!detailsOpen())"
      >
        <app-icon name="pencil" class="shrink-0 text-ink-2" />
        <span
          class="min-w-0 flex-1 truncate text-body"
          [class]="detailsSummary() ? 'text-ink-1' : 'text-ink-2'"
        >
          {{ detailsSummary() || ('transactionForm.form.details' | transloco) }}
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
        <div class="flex flex-wrap gap-2 px-4" data-testid="transactions.form.dateShortcuts">
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
          class="h-12 w-full rounded-md border bg-surface-1 text-body text-ink-1 tnum focus-visible:outline-none"
          data-testid="transactions.form.date"
          [class]="
            errors().date
              ? 'border-2 border-status-critical px-[15px]'
              : 'border-line-strong px-4 focus:border-2 focus:border-accent focus:px-[15px]'
          "
          [value]="draft().date"
          [attr.max]="today() || null"
          (change)="onDate($event)"
        />
        @if (errors().date; as message) {
          <span class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </span>
        }
      </label>

      <div class="flex flex-col gap-2 px-4">
        <app-text-field
          data-testid="transactions.form.payee"
          autocomplete="off"
          [label]="'transactionForm.form.payee' | transloco"
          [formField]="fields.payee"
          [error]="errors().payee ?? ''"
        />
        @if (suggestions().length > 0) {
          <div
            class="flex flex-wrap gap-2"
            role="group"
            [attr.aria-label]="'transactionForm.form.suggestions' | transloco"
          >
            @for (payee of suggestions(); track payee) {
              <button appChip icon="receipt" (click)="patch({ payee })">{{ payee }}</button>
            }
          </div>
        }
      </div>

      <app-text-field
        class="px-4"
        data-testid="transactions.form.note"
        autocomplete="off"
        [label]="'transactionForm.form.note' | transloco"
        [formField]="fields.description"
        [error]="errors().description ?? ''"
      />

      <app-tags-field
        class="px-4"
        [known]="tagSuggestions()"
        [error]="errors().tags ?? ''"
        [tags]="draft().tags"
        (tagsChange)="patch({ tags: $event })"
      />

      <app-checkbox
        class="px-4"
        data-testid="transactions.form.private"
        [checked]="draft().isPrivate"
        (checkedChange)="patch({ isPrivate: $event })"
      >
        {{ 'transactionForm.form.private' | transloco }}
        <span class="block text-caption text-ink-3">{{
          'transactionForm.form.privateHint' | transloco
        }}</span>
      </app-checkbox>
    }
  `,
  host: { class: 'flex flex-col gap-5' },
})
export class TransactionFormComponent {
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)

  readonly draft = model<TransactionDraft>(EMPTY_DRAFT)
  readonly accounts = input<readonly SelectOption<number>[]>([])
  /** You, the partner and joint (value null), already worded by the host. */
  readonly people = input<readonly SelectOption<number | null>[]>([])
  readonly categories = input<readonly CategoryOption[]>([])
  /** Payees seen recently, most recent first. */
  readonly payees = input<readonly string[]>([])
  /** The household's tags, most recently used first (`GET /tags`), offered as chips. */
  readonly tagSuggestions = input<readonly string[]>([])
  /** A 422's `{ field: message }`, keyed by API field. */
  readonly serverErrors = input<Record<string, string>>({})
  /** Lines of a split transaction; the split owns its amount and categories. */
  readonly splitCount = input(0)
  /** Offer "Split" (the edit sheet does; quick add may not). */
  readonly splittable = input(false, { transform: booleanAttribute })
  readonly keypadOpen = model(false)
  readonly splitRequested = output<void>()
  /** Show the expense/income segment (quick add shows its own, with transfer). */
  readonly showKind = input(true)
  /** `external`: the host docks the keypad; the amount is display only. */
  readonly keypad = input<'inline' | 'external'>('inline')
  /** The quick-add grid: seven tiles, the eighth opens the full list. Null shows the chip. */
  readonly categoryTiles = input<readonly CategoryTile[] | null>(null)
  /** Fold date, payee, note, tags and the private switch into one "More" row. */
  readonly compact = input(false, { transform: booleanAttribute })
  readonly detailsOpen = model(false)
  /** Today in the household time zone: offers "Today" / "Yesterday" and caps the date. */
  readonly today = input('')

  protected readonly fields = form(this.draft, (path) => {
    min(path.amountCents, 1)
    required(path.accountId)
    required(path.date)
    maxLength(path.payee, 120)
    maxLength(path.description, 500)
  })

  /** Amount above zero, an account and a date: the host may save. */
  readonly valid = computed(() => this.fields().valid())

  protected readonly errors = computed(() => draftErrors(this.serverErrors()))
  protected readonly locked = computed(() => this.splitCount() > 0)

  private readonly words = translateSignal(WORD_KEYS)

  protected readonly kindOptions = computed<SegmentOption<EntryKind>[]>(() => {
    const [expense = '', income = ''] = this.words()
    return [
      { value: 'expense', label: expense },
      { value: 'income', label: income },
    ]
  })

  protected readonly accountLabel = computed(
    () =>
      this.accounts().find((option) => option.value === this.draft().accountId)?.label ??
      this.words()[2] ??
      ''
  )

  private readonly personOption = computed(() =>
    this.people().find((option) => option.value === this.draft().paidByUserId)
  )
  protected readonly personLabel = computed(() => this.personOption()?.label ?? '')
  protected readonly personMark = computed<Person | null>(() => this.personOption()?.person ?? null)

  private readonly category = computed(() =>
    this.categories().find((option) => option.id === this.draft().categoryId)
  )
  protected readonly categoryLabel = computed(() => this.category()?.name ?? this.words()[3] ?? '')
  protected readonly categoryGlyph = computed<IconName>(() => {
    const category = this.category()
    return category ? categoryIcon(category) : 'circle-dashed'
  })

  protected readonly suggestions = computed(() => recentPayees(this.payees(), this.draft().payee))

  protected readonly yesterday = computed(() => (this.today() ? addDays(this.today(), -1) : ''))
  /** What the folded row shows once something was typed: "Corner Grocer · milk". */
  protected readonly detailsSummary = computed(() =>
    [this.draft().payee.trim(), this.draft().description.trim()].filter(Boolean).join(' · ')
  )

  /** A tile picks its category; tapping the picked one again leaves the entry uncategorised. */
  protected toggleCategory(id: number): void {
    this.patch({ categoryId: this.draft().categoryId === id ? null : id })
  }

  protected patch(changes: Partial<TransactionDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }))
  }

  protected chooseAccount(): void {
    openSelectSheet(this.sheets, {
      title: this.label(TITLE_KEYS.account),
      options: this.accounts(),
      selected: this.draft().accountId,
    }).subscribe((accountId) => {
      if (accountId !== undefined) {
        this.patch({ accountId })
      }
    })
  }

  protected choosePerson(): void {
    openSelectSheet(this.sheets, {
      title: this.label(TITLE_KEYS.person),
      options: this.people(),
      selected: this.draft().paidByUserId,
    }).subscribe((paidByUserId) => {
      if (paidByUserId !== undefined) {
        this.patch({ paidByUserId })
      }
    })
  }

  protected chooseCategory(): void {
    const kind = this.draft().kind
    const options: SelectOption<number | null>[] = [
      { value: null, label: this.label(TITLE_KEYS.uncategorized), icon: 'circle-dashed' },
      ...this.categories()
        .filter((option) => option.kind === kind || option.id === this.draft().categoryId)
        .map((option) => ({
          value: option.id,
          label: option.name,
          meta: option.groupName,
          icon: categoryIcon(option),
        })),
    ]
    openSelectSheet(this.sheets, {
      title: this.label(TITLE_KEYS.category),
      options,
      selected: this.draft().categoryId,
    }).subscribe((categoryId) => {
      if (categoryId !== undefined) {
        this.patch({ categoryId })
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

  /** A full key, translated when a sheet opens (the scope is loaded by then). */
  private label(key: string): string {
    return this.transloco.translate(key)
  }
}
