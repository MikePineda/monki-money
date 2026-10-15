import { Component, computed, inject, input, model, output } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { formatWeekday } from '../../../domain/dates'
import type { TransactionKind } from '../../../domain/money'
import { addDays } from '../../../domain/month'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { CheckboxComponent } from '../../../shared/ui/checkbox/checkbox.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'
import { SegmentedControlComponent } from '../../../shared/ui/segmented-control/segmented-control.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { CategoryGridComponent, type CategoryTile } from './category-grid.component'
import { FieldErrorComponent } from './field-error.component'

/** A one-tap transfer route ("→ Savings"). */
export interface PresetChoice {
  fromAccountId: number
  toAccountId: number
  fromName: string
  toName: string
  /** The route the form is set to right now. */
  current: boolean
}

/**
 * The quick-add form body (DESIGN.md, screen skeleton "Quick add"): type
 * segment, hero amount, account and "who paid" chips (or from → to for a
 * transfer with its one-tap routes), the category grid, and the collapsed
 * "More" row with merchant (recent suggestions), note, date and the private
 * switch. Presentational: values come in, choices go out; the keypad and
 * the save button belong to the page, which docks them at the bottom.
 */
@Component({
  selector: 'app-transaction-form',
  imports: [
    AmountDisplayComponent,
    CategoryGridComponent,
    CheckboxComponent,
    ChipComponent,
    FieldErrorComponent,
    IconComponent,
    SegmentedControlComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-segmented-control
      data-testid="quickAdd.kind"
      [label]="'quickAdd.kind.label' | transloco"
      [options]="[
        { value: 'expense', label: 'quickAdd.kind.expense' | transloco },
        { value: 'income', label: 'quickAdd.kind.income' | transloco },
        { value: 'transfer', label: 'quickAdd.kind.transfer' | transloco },
      ]"
      [(value)]="kind"
    />

    <div class="mt-4 flex flex-col gap-1">
      <span class="sr-only">{{ 'quickAdd.amount.label' | transloco }}</span>
      <app-amount-display data-testid="quickAdd.amount" variant="hero" [cents]="amountCents()" />
      @if (errors()['amountCents']; as message) {
        <app-field-error [message]="message" />
      }
    </div>

    @if (kind() === 'transfer') {
      <div class="mt-2 flex min-w-0 items-center gap-2">
        <button
          appChip
          data-testid="quickAdd.from"
          trailing="chevron-down"
          [attr.aria-label]="('quickAdd.transfer.from' | transloco) + ': ' + fromName()"
          (click)="pickFrom.emit()"
        >
          {{ fromName() || ('quickAdd.account.choose' | transloco) }}
        </button>
        <app-icon name="arrow-right" class="shrink-0 text-ink-3" />
        <button
          appChip
          data-testid="quickAdd.to"
          trailing="chevron-down"
          [attr.aria-label]="('quickAdd.transfer.to' | transloco) + ': ' + toName()"
          (click)="pickTo.emit()"
        >
          {{ toName() || ('quickAdd.account.choose' | transloco) }}
        </button>
      </div>
      @if (sameAccount()) {
        <app-field-error
          class="mt-2"
          data-testid="quickAdd.sameAccount"
          [message]="'quickAdd.transfer.sameAccount' | transloco"
        />
      }
      @for (field of transferFields; track field) {
        @if (errors()[field]; as message) {
          <app-field-error class="mt-2" [message]="message" />
        }
      }
      @if (presets().length > 0) {
        <section class="mt-6 flex flex-col gap-2">
          <h2 class="text-label text-ink-2">{{ 'quickAdd.transfer.presets' | transloco }}</h2>
          <div class="flex flex-wrap gap-2">
            @for (preset of presets(); track preset.fromAccountId + '>' + preset.toAccountId) {
              <button
                appChip
                data-testid="quickAdd.preset"
                [selected]="preset.current"
                [attr.aria-label]="
                  'quickAdd.transfer.route'
                    | transloco: { from: preset.fromName, to: preset.toName }
                "
                (click)="applyPreset.emit(preset)"
              >
                {{ 'quickAdd.transfer.preset' | transloco: { to: preset.toName } }}
              </button>
            }
          </div>
        </section>
      }
    } @else {
      <div class="mt-2 flex min-w-0 flex-wrap gap-2">
        <button
          appChip
          data-testid="quickAdd.account"
          trailing="chevron-down"
          [attr.aria-label]="('quickAdd.account.label' | transloco) + ': ' + accountName()"
          (click)="pickAccount.emit()"
        >
          {{ accountName() || ('quickAdd.account.choose' | transloco) }}
        </button>
        <button
          appChip
          data-testid="quickAdd.who"
          trailing="chevron-down"
          [person]="whoPerson()"
          [attr.aria-label]="('quickAdd.who.label' | transloco) + ': ' + whoLabel()"
          (click)="pickWho.emit()"
        >
          {{ whoLabel() }}
        </button>
      </div>
      @for (field of entryFields; track field) {
        @if (errors()[field]; as message) {
          <app-field-error class="mt-2" [message]="message" />
        }
      }
      <app-category-grid
        class="mt-4"
        data-testid="quickAdd.categories"
        [tiles]="tiles()"
        [selected]="categoryId()"
        [label]="'quickAdd.category.label' | transloco"
        [moreLabel]="'quickAdd.category.more' | transloco"
        (picked)="toggleCategory.emit($event)"
        (more)="moreCategories.emit()"
      />
      @if (errors()['categoryId']; as message) {
        <app-field-error class="mt-2" [message]="message" />
      }
    }

    <button
      type="button"
      data-testid="quickAdd.detailsToggle"
      class="mt-4 flex h-12 w-full items-center gap-3 rounded-md border border-line bg-surface-1 pr-3 pl-4 text-left active:bg-surface-2"
      [attr.aria-expanded]="detailsOpen()"
      aria-controls="quick-add-details"
      (click)="detailsOpen.set(!detailsOpen())"
    >
      <app-icon name="pencil" class="shrink-0 text-ink-2" />
      <span
        class="min-w-0 flex-1 truncate text-body"
        [class]="summary() ? 'text-ink-1' : 'text-ink-2'"
      >
        {{ summary() || ('quickAdd.details.toggle' | transloco) }}
      </span>
      <app-icon
        name="chevron-down"
        class="shrink-0 text-ink-2 transition-transform"
        [class.rotate-180]="detailsOpen()"
      />
    </button>

    @if (detailsOpen()) {
      <div id="quick-add-details" class="mt-4 flex flex-col gap-4" data-testid="quickAdd.details">
        @if (kind() !== 'transfer') {
          <div class="flex flex-col gap-2">
            <app-text-field
              data-testid="quickAdd.payee"
              autocomplete="off"
              [label]="'quickAdd.details.payee' | transloco"
              [error]="errors()['payee'] ?? ''"
              [(value)]="payee"
            />
            @if (payeeOptions().length > 0) {
              <div
                role="group"
                class="flex flex-wrap gap-2"
                [attr.aria-label]="'quickAdd.details.suggestions' | transloco"
              >
                @for (option of payeeOptions(); track option) {
                  <button
                    appChip
                    data-testid="quickAdd.payeeSuggestion"
                    (click)="payee.set(option)"
                  >
                    {{ option }}
                  </button>
                }
              </div>
            }
          </div>
        }
        <app-text-field
          data-testid="quickAdd.note"
          autocomplete="off"
          [label]="'quickAdd.details.note' | transloco"
          [error]="errors()['description'] ?? errors()['memo'] ?? ''"
          [(value)]="note"
        />
        <div class="flex flex-col gap-2">
          <span class="text-label text-ink-2">{{ 'quickAdd.details.date' | transloco }}</span>
          <div class="flex flex-wrap gap-2" data-testid="quickAdd.date">
            <button appChip [selected]="date() === today()" (click)="date.set(today())">
              {{ 'quickAdd.details.today' | transloco }}
            </button>
            <button appChip [selected]="date() === yesterday()" (click)="date.set(yesterday())">
              {{ 'quickAdd.details.yesterday' | transloco }}
            </button>
            <label
              class="relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-label whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
              [class]="
                picked()
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line-strong bg-surface-1 text-ink-1'
              "
            >
              <app-icon [name]="picked() ? 'check' : 'calendar'" [size]="16" />
              <span>{{ picked() ? dateText() : ('quickAdd.details.pick' | transloco) }}</span>
              <input
                type="date"
                data-testid="quickAdd.datePicker"
                class="absolute inset-0 size-full cursor-pointer opacity-0"
                [attr.aria-label]="'quickAdd.details.pick' | transloco"
                [max]="today()"
                [value]="date()"
                (click)="openPicker($event)"
                (change)="onPicked($event)"
              />
            </label>
          </div>
          @if (errors()['date']; as message) {
            <app-field-error [message]="message" />
          }
        </div>
        @if (kind() !== 'transfer') {
          <app-checkbox data-testid="quickAdd.private" [(checked)]="isPrivate">
            {{ 'quickAdd.details.private' | transloco }}
            <span class="block text-caption text-ink-3">{{
              'quickAdd.details.privateHint' | transloco
            }}</span>
          </app-checkbox>
        }
      </div>
    }
  `,
  host: { class: 'flex flex-col' },
})
export class TransactionFormComponent {
  private readonly locale = inject(APP_LOCALE)

  readonly kind = model<TransactionKind>('expense')
  readonly amountCents = input(0)
  readonly tiles = input<readonly CategoryTile[]>([])
  readonly categoryId = input<number | null>(null)
  readonly accountName = input('')
  readonly whoLabel = input('')
  readonly whoPerson = input<Person>('a')
  readonly fromName = input('')
  readonly toName = input('')
  readonly sameAccount = input(false)
  readonly presets = input<readonly PresetChoice[]>([])
  readonly payeeOptions = input<readonly string[]>([])
  /** Today in the household time zone ('YYYY-MM-DD'). */
  readonly today = input.required<string>()
  /** 422 messages by API field. */
  readonly errors = input<Readonly<Partial<Record<string, string>>>>({})

  readonly payee = model('')
  readonly note = model('')
  readonly date = model('')
  readonly isPrivate = model(false)
  readonly detailsOpen = model(false)

  readonly pickAccount = output<void>()
  readonly pickWho = output<void>()
  readonly pickFrom = output<void>()
  readonly pickTo = output<void>()
  readonly moreCategories = output<void>()
  readonly toggleCategory = output<number>()
  readonly applyPreset = output<PresetChoice>()

  protected readonly entryFields = ['accountId', 'paidByUserId', 'kind'] as const
  protected readonly transferFields = ['fromAccountId', 'toAccountId'] as const

  protected readonly yesterday = computed(() => addDays(this.today(), -1))
  protected readonly picked = computed(
    () => this.date() !== this.today() && this.date() !== this.yesterday()
  )
  protected readonly dateText = computed(() =>
    this.date() ? formatWeekday(this.date(), this.locale()) : ''
  )
  /** What the collapsed row shows once something was typed: "Corner Grocer · milk". */
  protected readonly summary = computed(() =>
    [this.kind() === 'transfer' ? '' : this.payee().trim(), this.note().trim()]
      .filter(Boolean)
      .join(' · ')
  )

  protected openPicker(event: Event): void {
    const field = event.target as HTMLInputElement & { showPicker?: () => void }
    try {
      field.showPicker?.()
    } catch {
      // Not allowed (no user gesture in some engines): the native control still opens.
    }
  }

  protected onPicked(event: Event): void {
    const value = (event.target as HTMLInputElement).value
    if (value) {
      this.date.set(value > this.today() ? this.today() : value)
    }
  }
}
