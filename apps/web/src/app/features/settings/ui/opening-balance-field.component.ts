import { Component, computed, inject, model } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { formatMoney } from '../../../domain/money'
import { AmountKeypadComponent } from '../../../shared/ui/amount-keypad/amount-keypad.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { CheckboxComponent } from '../../../shared/ui/checkbox/checkbox.component'

let nextId = 0

/** The signed cents of an opening balance: a debt is negative (never −0). */
export function signedOpeningBalance(magnitude: number, owes: boolean): number {
  return owes && magnitude !== 0 ? -magnitude : magnitude
}

/**
 * An account's opening balance in the account sheet: the amount in a
 * field-shaped button with the amount keypad under it (money is never
 * typed text), "Owes money" for a card or loan in debt (the balance turns
 * negative, shown with a true minus), the date it was true on, and one
 * line on what it is for. Presentational: the sheet owns the values.
 */
@Component({
  selector: 'app-opening-balance-field',
  imports: [AmountKeypadComponent, CheckboxComponent, TranslocoPipe],
  template: `
    <div class="flex flex-col gap-2">
      <span [id]="labelId" class="text-label text-ink-2">{{
        'settings.accounts.sheet.openingBalance' | transloco
      }}</span>
      <button
        type="button"
        class="flex h-12 w-full items-center rounded-md border bg-surface-1 text-left text-amount tnum text-ink-1"
        data-testid="accountSheet.openingBalance"
        [class]="open() ? 'border-2 border-accent px-[15px]' : 'border-line-strong px-4'"
        [attr.aria-labelledby]="labelId + ' ' + valueId"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        <span [id]="valueId">{{ text() }}</span>
      </button>
      @if (open()) {
        <app-amount-keypad
          class="-mx-4 mt-1"
          data-testid="accountSheet.keypad"
          [value]="magnitude()"
          (valueChange)="magnitude.set($event)"
        />
      }
      <app-checkbox data-testid="accountSheet.owes" [(checked)]="owes">
        {{ 'settings.accounts.sheet.owes' | transloco }}
        <span class="block text-caption text-ink-3">{{
          'settings.accounts.sheet.owesHint' | transloco
        }}</span>
      </app-checkbox>
    </div>
    <label class="flex flex-col gap-2">
      <span class="text-label text-ink-2">{{
        'settings.accounts.sheet.openingDate' | transloco
      }}</span>
      <input
        type="date"
        class="h-12 w-full rounded-md border border-line-strong bg-surface-1 px-4 text-body text-ink-1 tnum focus-visible:outline-none focus:border-2 focus:border-accent focus:px-[15px]"
        data-testid="accountSheet.openingDate"
        [attr.aria-describedby]="helpId"
        [value]="date()"
        (change)="onDate($event)"
      />
    </label>
    <p [id]="helpId" class="text-caption text-ink-3">
      {{ 'settings.accounts.sheet.openingHelp' | transloco }}
    </p>
  `,
  host: { class: 'flex flex-col gap-4' },
})
export class OpeningBalanceFieldComponent {
  private readonly locale = inject(APP_LOCALE)

  /** Integer cents, never negative: the sign comes from `owes`. */
  readonly magnitude = model(0)
  readonly owes = model(false)
  /** `YYYY-MM-DD`, or '' when unset. */
  readonly date = model('')
  /** The keypad under the amount. */
  readonly open = model(false)

  private readonly id = nextId++
  protected readonly labelId = `opening-balance-${this.id}-label`
  protected readonly valueId = `opening-balance-${this.id}-value`
  protected readonly helpId = `opening-balance-${this.id}-help`

  protected readonly text = computed(() =>
    formatMoney(signedOpeningBalance(this.magnitude(), this.owes()), this.locale())
  )

  protected onDate(event: Event): void {
    this.date.set((event.target as HTMLInputElement).value)
  }
}
