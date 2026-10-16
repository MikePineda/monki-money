import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import type { RecurringItem } from '../../../core/api/api-types'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import { CLOCK } from '../../../core/platform/clock.token'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { todayIn } from '../../../domain/month'
import { formatMoney } from '../../../domain/money'
import {
  RECURRING_CADENCES,
  draftFrom,
  draftProblems,
  type RecurringDraft,
} from '../../../domain/recurring'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountKeypadComponent } from '../../../shared/ui/amount-keypad/amount-keypad.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../shared/ui/select-sheet/select-sheet.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { RecurringStore } from '../recurring.store'

/**
 * Keys read at runtime, declared for transloco-keys-manager:
 * t(recurring.cadence.weekly, recurring.cadence.fortnightly, recurring.cadence.monthly)
 * t(recurring.cadence.quarterly, recurring.cadence.yearly)
 * t(recurring.noCategory, recurring.people.you, recurring.people.joint)
 * t(recurring.sheet.category, recurring.sheet.person)
 */

export interface RecurringSheetData {
  /** The item to edit; omitted to add one by hand. */
  item?: RecurringItem
}

/**
 * Add or edit a recurring payment: merchant, usual amount (keypad, never
 * typed as text), how often, next due date, category and who pays. Saving
 * goes through the RecurringStore (the opener passes its injector); the
 * API's field messages show under their fields and the sheet stays open.
 * Closes with true once saved.
 */
@Component({
  selector: 'app-recurring-sheet',
  imports: [
    AmountKeypadComponent,
    BottomSheetComponent,
    ButtonComponent,
    ChipComponent,
    IconComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet
      [title]="
        data.item
          ? ('recurring.sheet.editTitle' | transloco: { payee: data.item.payee })
          : ('recurring.sheet.addTitle' | transloco)
      "
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <form
        id="recurring-sheet"
        class="flex flex-col gap-5 px-4 pb-2"
        novalidate
        (submit)="save($event)"
      >
        <app-text-field
          data-testid="recurring.sheet.payee"
          autocomplete="off"
          [label]="'recurring.sheet.payee' | transloco"
          [hint]="'recurring.sheet.payeeHint' | transloco"
          [error]="errors()['payee'] ?? ''"
          [value]="draft().payee"
          (valueChange)="patch({ payee: $event })"
        />

        <div class="flex flex-col gap-2">
          <span id="recurring-sheet-amount-label" class="text-label text-ink-2">{{
            'recurring.sheet.amount' | transloco
          }}</span>
          <button
            type="button"
            class="flex h-12 w-full items-center rounded-md border bg-surface-1 text-left text-amount tnum text-ink-1"
            [class]="
              errors()['amountCents']
                ? 'border-2 border-status-critical px-[15px]'
                : keypadOpen()
                  ? 'border-2 border-accent px-[15px]'
                  : 'border-line-strong px-4'
            "
            data-testid="recurring.sheet.amount"
            aria-labelledby="recurring-sheet-amount-label recurring-sheet-amount-value"
            [attr.aria-expanded]="keypadOpen()"
            (click)="keypadOpen.set(!keypadOpen())"
          >
            <span id="recurring-sheet-amount-value">{{ amountText() }}</span>
          </button>
          @if (errors()['amountCents']; as message) {
            <p class="flex items-center gap-1.5 text-label text-status-critical">
              <app-icon name="circle-alert" [size]="16" />{{ message }}
            </p>
          }
          @if (keypadOpen()) {
            <app-amount-keypad
              class="-mx-4 mt-1"
              data-testid="recurring.sheet.keypad"
              [value]="draft().amountCents"
              (valueChange)="patch({ amountCents: $event })"
            />
          }
        </div>

        <fieldset class="flex flex-col">
          <legend class="mb-2 text-label text-ink-2">
            {{ 'recurring.sheet.cadence' | transloco }}
          </legend>
          <div class="flex flex-wrap gap-2" data-testid="recurring.sheet.cadence">
            @for (cadence of cadences; track cadence) {
              <button
                appChip
                pressable
                [attr.data-cadence]="cadence"
                [selected]="draft().cadence === cadence"
                (click)="patch({ cadence })"
              >
                {{ 'recurring.cadence.' + cadence | transloco }}
              </button>
            }
          </div>
        </fieldset>

        <label class="flex flex-col gap-2">
          <span class="text-label text-ink-2">{{ 'recurring.sheet.nextDate' | transloco }}</span>
          <input
            type="date"
            class="h-12 w-full rounded-md border bg-surface-1 text-body text-ink-1 tnum focus-visible:outline-none"
            data-testid="recurring.sheet.nextDate"
            [class]="
              errors()['nextExpectedDate']
                ? 'border-2 border-status-critical px-[15px]'
                : 'border-line-strong px-4 focus:border-2 focus:border-accent focus:px-[15px]'
            "
            [value]="draft().nextExpectedDate"
            (change)="onDate($event)"
          />
          @if (errors()['nextExpectedDate']; as message) {
            <span class="flex items-center gap-1.5 text-label text-status-critical">
              <app-icon name="circle-alert" [size]="16" />{{ message }}
            </span>
          }
        </label>

        <div class="flex flex-wrap gap-x-6 gap-y-4">
          <div class="flex flex-col gap-2">
            <span class="text-label text-ink-2">{{ 'recurring.sheet.category' | transloco }}</span>
            <button
              appChip
              trailing="chevron-down"
              class="self-start"
              data-testid="recurring.sheet.category"
              (click)="chooseCategory()"
            >
              {{ categoryName() || ('recurring.noCategory' | transloco) }}
            </button>
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-label text-ink-2">{{ 'recurring.sheet.person' | transloco }}</span>
            <button
              appChip
              trailing="chevron-down"
              class="self-start"
              data-testid="recurring.sheet.person"
              [person]="person()"
              (click)="choosePerson()"
            >
              {{ personName() || ('recurring.people.' + personKey() | transloco) }}
            </button>
          </div>
        </div>
      </form>
      <button
        sheetFooter
        appButton
        type="submit"
        form="recurring-sheet"
        size="block"
        data-testid="recurring.sheet.save"
        [disabled]="problems().length > 0 || saving()"
      >
        {{ 'recurring.sheet.save' | transloco }}
      </button>
    </app-bottom-sheet>
  `,
})
export class RecurringSheetComponent {
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)
  private readonly sheets = inject(BottomSheetService)
  private readonly store = inject(RecurringStore)
  private readonly directory = inject(HouseholdDirectory)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)
  protected readonly data = inject<RecurringSheetData>(DIALOG_DATA)

  protected readonly cadences = RECURRING_CADENCES
  protected readonly draft = signal<RecurringDraft>(
    draftFrom(this.data.item, todayIn(inject(HOUSEHOLD_TIME_ZONE)(), inject(CLOCK)()))
  )
  protected readonly keypadOpen = signal(false)
  protected readonly saving = signal(false)
  /** The API's messages by field (422), shown under their fields. */
  protected readonly errors = signal<Record<string, string>>({})
  protected readonly problems = computed(() => draftProblems(this.draft()))

  protected readonly amountText = computed(() =>
    formatMoney(this.draft().amountCents, this.locale())
  )
  protected readonly categoryName = computed(
    () => this.directory.category(this.draft().categoryId)?.category.name ?? ''
  )
  protected readonly person = computed<Person>(() =>
    this.directory.personOf(this.draft().paidByUserId)
  )
  /** The partner's name, or '' for "You" / "Shared" (translated in the template). */
  protected readonly personName = computed(() => {
    const payer = this.draft().paidByUserId
    const partner = this.directory.partner()
    return payer !== null && payer === partner?.userId ? partner.name : ''
  })
  protected readonly personKey = computed(() =>
    this.draft().paidByUserId === null ? 'joint' : 'you'
  )

  protected patch(changes: Partial<RecurringDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }))
    const touched = Object.keys(changes)
    if (touched.some((field) => field in this.errors())) {
      this.errors.update((errors) =>
        Object.fromEntries(Object.entries(errors).filter(([field]) => !touched.includes(field)))
      )
    }
  }

  protected onDate(event: Event): void {
    this.patch({ nextExpectedDate: (event.target as HTMLInputElement).value })
  }

  protected chooseCategory(): void {
    const options: SelectOption<number | null>[] = [
      { value: null, label: this.t('recurring.noCategory'), icon: 'circle-dashed' },
      ...this.directory.categoriesOf('expense').map(({ category, group }) => ({
        value: category.id,
        label: category.name,
        meta: group.name,
        icon: categoryIcon(category),
      })),
    ]
    openSelectSheet(this.sheets, {
      title: this.t('recurring.sheet.category'),
      options,
      selected: this.draft().categoryId,
    }).subscribe((categoryId) => {
      if (categoryId !== undefined) {
        this.patch({ categoryId })
      }
    })
  }

  protected choosePerson(): void {
    const options: SelectOption<number | null>[] = []
    const you = this.directory.youId()
    const partner = this.directory.partner()
    if (you !== null) {
      options.push({
        value: you,
        label: this.t('recurring.people.you'),
        person: this.directory.personOf(you),
      })
    }
    if (partner) {
      options.push({ value: partner.userId, label: partner.name, person: partner.person as Person })
    }
    options.push({ value: null, label: this.t('recurring.people.joint'), person: 'joint' })
    openSelectSheet(this.sheets, {
      title: this.t('recurring.sheet.person'),
      options,
      selected: this.draft().paidByUserId,
    }).subscribe((paidByUserId) => {
      if (paidByUserId !== undefined) {
        this.patch({ paidByUserId })
      }
    })
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault()
    if (this.problems().length > 0 || this.saving()) {
      return
    }
    this.saving.set(true)
    try {
      const errors = await this.store.save(this.data.item, this.draft())
      if (errors === null) {
        this.dialogRef.close(true)
      } else {
        this.errors.set(errors)
      }
    } finally {
      this.saving.set(false)
    }
  }

  private t(key: string): string {
    return this.transloco.translate(key)
  }
}
