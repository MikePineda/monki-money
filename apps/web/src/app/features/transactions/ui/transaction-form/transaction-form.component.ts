import {
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core'
import { FormField, form, maxLength, min, required } from '@angular/forms/signals'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { EntryKind } from '@monkimoney/shared'
import type { CategoryOption } from '../../../../domain/category-tree'
import { recentPayees } from '../../../../domain/transaction-list'
import { categoryIcon } from '../../../../shared/icons/category-icons'
import { IconComponent } from '../../../../shared/icons/icon.component'
import type { IconName } from '../../../../shared/icons/icon-names'
import { AmountDisplayComponent } from '../../../../shared/ui/amount-display/amount-display.component'
import { AmountKeypadComponent } from '../../../../shared/ui/amount-keypad/amount-keypad.component'
import { BannerComponent } from '../../../../shared/ui/banner/banner.component'
import { BottomSheetService } from '../../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { CheckboxComponent } from '../../../../shared/ui/checkbox/checkbox.component'
import { ChipComponent } from '../../../../shared/ui/chip/chip.component'
import type { Person } from '../../../../shared/ui/person-dot/person-dot.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../../shared/ui/segmented-control/segmented-control.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../../shared/ui/select-sheet/select-sheet.component'
import { TextFieldComponent } from '../../../../shared/ui/text-field/text-field.component'
import { provideTransactionsScope } from '../../transactions.scope'
import { addTag, draftErrors, type TransactionDraft } from './transaction-draft'

/**
 * Keys read from TypeScript. translateSignal() takes them relative to the
 * scope this component provides; sheet titles take full keys.
 * t(transactions.form.expense, transactions.form.income, transactions.form.chooseAccount)
 * t(transactions.form.uncategorized, transactions.form.accountTitle)
 * t(transactions.form.personTitle, transactions.form.categoryTitle)
 */
const WORD_KEYS = ['form.expense', 'form.income', 'form.chooseAccount', 'form.uncategorized']
const TITLE_KEYS = {
  account: 'transactions.form.accountTitle',
  person: 'transactions.form.personTitle',
  category: 'transactions.form.categoryTitle',
  uncategorized: 'transactions.form.uncategorized',
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
 * It provides the `transactions` translation scope itself, so any screen
 * can host it.
 */
@Component({
  selector: 'app-transaction-form',
  providers: [provideTransactionsScope()],
  imports: [
    AmountDisplayComponent,
    AmountKeypadComponent,
    BannerComponent,
    CheckboxComponent,
    ChipComponent,
    FormField,
    IconComponent,
    SegmentedControlComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    @if (errors().form; as message) {
      <app-banner class="mx-4" status="critical" [message]="message" />
    }

    <app-segmented-control
      class="mx-4"
      data-testid="transactions.form.kind"
      [label]="'transactions.form.kind' | transloco"
      [options]="kindOptions()"
      [value]="draft().kind"
      (valueChange)="patch({ kind: $event })"
    />

    <div class="flex flex-col items-center gap-1 px-4">
      <button
        type="button"
        class="rounded-md px-2 disabled:cursor-default"
        data-testid="transactions.form.amount"
        [attr.aria-expanded]="locked() ? null : keypadOpen()"
        [disabled]="locked()"
        (click)="keypadOpen.set(!keypadOpen())"
      >
        <span class="sr-only">{{ 'transactions.form.amount' | transloco }}</span>
        <app-amount-display variant="hero" [cents]="draft().amountCents" />
      </button>
      @if (errors().amount; as message) {
        <p
          class="flex items-center gap-1.5 text-label text-status-critical"
          data-testid="transactions.form.amountError"
        >
          <app-icon name="circle-alert" [size]="16" />{{ message }}
        </p>
      } @else if (locked()) {
        <p class="text-center text-caption text-ink-3">
          {{ 'transactions.form.amountLocked' | transloco }}
        </p>
      } @else if (!keypadOpen()) {
        <p class="text-caption text-ink-3">{{ 'transactions.form.amountHint' | transloco }}</p>
      }
    </div>

    @if (keypadOpen() && !locked()) {
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

    <div class="flex flex-col gap-2 px-4">
      <span class="text-label text-ink-2">{{ 'transactions.form.category' | transloco }}</span>
      <div class="flex flex-wrap items-center gap-2">
        @if (splitCount() > 0) {
          <button
            appChip
            trailing="chevron-down"
            icon="split"
            data-testid="transactions.form.category"
            (click)="splitRequested.emit()"
          >
            {{ 'transactions.form.splitInto' | transloco: { count: splitCount() } }}
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
              <app-icon name="split" [size]="16" />{{ 'transactions.form.split' | transloco }}
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

    <label class="flex flex-col gap-2 px-4">
      <span class="text-label text-ink-2">{{ 'transactions.form.date' | transloco }}</span>
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
        [label]="'transactions.form.payee' | transloco"
        [formField]="fields.payee"
        [error]="errors().payee ?? ''"
      />
      @if (suggestions().length > 0) {
        <div
          class="flex flex-wrap gap-2"
          role="group"
          [attr.aria-label]="'transactions.form.suggestions' | transloco"
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
      [label]="'transactions.form.note' | transloco"
      [formField]="fields.description"
      [error]="errors().description ?? ''"
    />

    <div class="flex flex-col gap-2 px-4">
      <span class="text-label text-ink-2">{{ 'transactions.form.tags' | transloco }}</span>
      @if (draft().tags.length > 0) {
        <ul class="flex flex-wrap gap-2">
          @for (tag of draft().tags; track tag) {
            <li>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface-1 pr-2 pl-3 text-label text-ink-1 active:bg-surface-2"
                [attr.aria-label]="'transactions.form.removeTag' | transloco: { tag }"
                (click)="removeTag(tag)"
              >
                {{ tag }}<app-icon name="x" [size]="16" />
              </button>
            </li>
          }
        </ul>
      }
      <div class="flex items-end gap-2">
        <app-text-field
          class="min-w-0 flex-1"
          data-testid="transactions.form.tag"
          autocomplete="off"
          [label]="'transactions.form.addTag' | transloco"
          [error]="errors().tags ?? ''"
          [(value)]="tagText"
          (keydown.enter)="$event.preventDefault(); commitTag()"
        />
        <button
          type="button"
          class="mb-0 grid size-12 shrink-0 place-items-center rounded-md border border-line-strong bg-surface-1 text-ink-1 active:bg-surface-2 disabled:text-ink-3"
          [attr.aria-label]="'transactions.form.addTag' | transloco"
          [disabled]="!tagText().trim()"
          (click)="commitTag()"
        >
          <app-icon name="plus" />
        </button>
      </div>
    </div>

    <app-checkbox
      class="px-4"
      data-testid="transactions.form.private"
      [checked]="draft().isPrivate"
      (checkedChange)="patch({ isPrivate: $event })"
    >
      {{ 'transactions.form.private' | transloco }}
      <span class="block text-caption text-ink-3">{{
        'transactions.form.privateHint' | transloco
      }}</span>
    </app-checkbox>
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
  /** A 422's `{ field: message }`, keyed by API field. */
  readonly serverErrors = input<Record<string, string>>({})
  /** Lines of a split transaction; the split owns its amount and categories. */
  readonly splitCount = input(0)
  /** Offer "Split" (the edit sheet does; quick add may not). */
  readonly splittable = input(false, { transform: booleanAttribute })
  readonly keypadOpen = model(false)
  readonly splitRequested = output<void>()

  protected readonly fields = form(this.draft, (path) => {
    min(path.amountCents, 1)
    required(path.accountId)
    required(path.date)
    maxLength(path.payee, 120)
    maxLength(path.description, 500)
  })

  /** Amount above zero, an account and a date: the host may save. */
  readonly valid = computed(() => this.fields().valid())

  protected readonly tagText = signal('')
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
      this.patch({ date: value })
    }
  }

  protected commitTag(): void {
    this.patch({ tags: addTag(this.draft().tags, this.tagText()) })
    this.tagText.set('')
  }

  protected removeTag(tag: string): void {
    this.patch({ tags: this.draft().tags.filter((item) => item !== tag) })
  }

  /** A full key, translated when a sheet opens (the scope is loaded by then). */
  private label(key: string): string {
    return this.transloco.translate(key)
  }
}
