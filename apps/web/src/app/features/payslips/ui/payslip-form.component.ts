import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import type { Account } from '../../../core/api/api-types'
import type { CategoryEntry } from '../../../core/household/household-directory.store'
import type { OwnerChoice } from '../../../domain/account-presets'
import { formatWeekdayDate } from '../../../domain/dates'
import { formatMoney } from '../../../domain/money'
import {
  choosePayout,
  choosePayoutLater,
  payslipProblems,
  serviceFeeCents,
  type DeductionDraft,
  type PayoutCandidate,
  type PayslipDraft,
  type PayslipProblem,
} from '../../../domain/payslip-draft'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountFieldComponent } from '../../../shared/ui/amount-field/amount-field.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'

/** Which money field has the keypad open. */
type Keypad = 'net' | 'gross' | 'tax' | 'extra'
/** Which deduction a category sheet is for. */
type Line = 'tax' | 'fee' | 'extra'

/**
 * Keys read from TypeScript (relative to the `payslips` scope the host
 * provides), declared for transloco-keys-manager:
 * t(payslips.form.you, payslips.form.joint, payslips.form.chooseAccount, payslips.form.candidate)
 * t(payslips.form.chooseCategory, payslips.form.tax, payslips.form.fee, payslips.form.extra)
 * t(payslips.form.problems.transferId, payslips.form.problems.toAccountId)
 * t(payslips.form.problems.netCents, payslips.form.problems.grossCents)
 * t(payslips.form.problems.deductions, payslips.form.problems.taxCategory)
 * t(payslips.form.problems.feeCategory, payslips.form.problems.extra)
 */
const WORD_KEYS = [
  'form.you',
  'form.joint',
  'form.chooseAccount',
  'form.chooseCategory',
  'form.tax',
  'form.fee',
  'form.extra',
]
/** "{date} · {amount} · to {account}", filled in TypeScript (no object literal in the template). */
const CANDIDATE_KEY = 'form.candidate'
const PROBLEMS: readonly PayslipProblem[] = [
  'transferId',
  'toAccountId',
  'netCents',
  'grossCents',
  'deductions',
  'taxCategory',
  'feeCategory',
  'extra',
]
const PROBLEM_KEYS = PROBLEMS.map((problem) => `form.problems.${problem}`)
/** API fields this form shows under an input; any other 422 message goes above Save. */
const SHOWN_FIELDS = new Set<string>([...PROBLEMS, 'date', 'userId', 'memo'])

/**
 * The "New payslip" form: which transfer took the net to the bank (the
 * candidates, newest first, or "No transfer yet" with a destination and
 * the net typed), the gross and the tax withheld (amount keypad), the
 * service fee worked out live as gross - tax - net (its category can
 * change; a third line is optional), who earned it, the date (the
 * transfer's by default) and a note. Missing pieces are named on submit;
 * a 422's messages show under their inputs. Presentational: the host saves.
 */
@Component({
  selector: 'app-payslip-form',
  imports: [
    AmountFieldComponent,
    ButtonComponent,
    ChipComponent,
    IconComponent,
    SegmentedControlComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <form class="flex flex-col gap-6" novalidate (submit)="submit($event)">
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 text-label text-ink-2">{{ 'payslips.form.payout' | transloco }}</legend>
        <p class="text-caption text-ink-3">{{ 'payslips.form.payoutHint' | transloco }}</p>
        <div
          role="radiogroup"
          class="flex flex-col overflow-hidden rounded-md border border-line bg-surface-1"
          data-testid="payslips.form.payouts"
          [attr.aria-label]="'payslips.form.payout' | transloco"
        >
          @for (option of candidateViews(); track option.candidate.transferId) {
            <button
              type="button"
              role="radio"
              class="flex min-h-12 items-center gap-3 px-4 py-3 text-left text-body text-ink-1 active:bg-surface-2 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line"
              [attr.aria-checked]="option.checked"
              [attr.data-testid]="'payslips.form.candidate.' + option.candidate.transferId"
              (click)="pick(option.candidate)"
            >
              <app-icon
                [name]="option.checked ? 'circle-check' : 'circle-dashed'"
                [class]="option.checked ? 'text-accent' : 'text-ink-3'"
              />
              <span class="min-w-0 flex-1 tnum">{{ option.label }}</span>
            </button>
          }
          <button
            type="button"
            role="radio"
            class="flex min-h-12 items-center gap-3 px-4 py-3 text-left text-body text-ink-1 active:bg-surface-2 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line"
            data-testid="payslips.form.later"
            [attr.aria-checked]="draft().source === 'new'"
            (click)="later()"
          >
            <app-icon
              [name]="draft().source === 'new' ? 'circle-check' : 'circle-dashed'"
              [class]="draft().source === 'new' ? 'text-accent' : 'text-ink-3'"
            />
            <span class="min-w-0 flex-1">{{ 'payslips.form.later' | transloco }}</span>
          </button>
        </div>
        @if (errorFor('transferId'); as message) {
          <p class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        } @else if (draft().source === 'new') {
          <p class="text-caption text-ink-3">{{ 'payslips.form.laterHint' | transloco }}</p>
        } @else if (candidates().length === 0) {
          <p class="text-caption text-ink-3" data-testid="payslips.form.noCandidates">
            {{ 'payslips.form.noCandidates' | transloco }}
          </p>
        }
      </fieldset>

      @if (draft().source === 'new') {
        <div class="flex flex-col gap-2">
          <span class="text-label text-ink-2">{{ 'payslips.form.toAccount' | transloco }}</span>
          <button
            appChip
            trailing="chevron-down"
            icon="landmark"
            class="self-start"
            data-testid="payslips.form.toAccount"
            (click)="chooseDestination()"
          >
            {{ destinationLabel() }}
          </button>
          @if (errorFor('toAccountId'); as message) {
            <p class="flex items-center gap-1.5 text-label text-status-critical">
              <app-icon name="circle-alert" [size]="16" />{{ message }}
            </p>
          }
        </div>
        <app-amount-field
          testId="payslips.form.net"
          [label]="'payslips.form.net' | transloco"
          [cents]="draft().netCents"
          [open]="keypad() === 'net'"
          [hint]="'payslips.form.amountHint' | transloco"
          [error]="errorFor('netCents')"
          (toggled)="toggleKeypad('net')"
          (changed)="patch({ netCents: $event })"
        />
      }

      <app-amount-field
        testId="payslips.form.gross"
        [label]="'payslips.form.gross' | transloco"
        [cents]="draft().grossCents"
        [open]="keypad() === 'gross'"
        [hint]="'payslips.form.amountHint' | transloco"
        [error]="errorFor('grossCents')"
        (toggled)="toggleKeypad('gross')"
        (changed)="patch({ grossCents: $event })"
      />

      <div class="flex flex-col gap-2">
        <app-amount-field
          testId="payslips.form.tax"
          [label]="'payslips.form.tax' | transloco"
          [cents]="draft().tax.amountCents"
          [open]="keypad() === 'tax'"
          (toggled)="toggleKeypad('tax')"
          (changed)="patchLine('tax', { amountCents: $event })"
        />
        <button
          appChip
          trailing="chevron-down"
          icon="tag"
          class="self-start"
          data-testid="payslips.form.taxCategory"
          [attr.aria-label]="categoryAria('tax', draft().tax.categoryId)"
          (click)="chooseCategory('tax')"
        >
          {{ categoryLabel(draft().tax.categoryId) }}
        </button>
        @if (errorFor('taxCategory'); as message) {
          <p class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        }
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-label text-ink-2" id="payslip-fee-label">{{
          'payslips.form.fee' | transloco
        }}</span>
        <output
          class="flex h-12 items-center rounded-md bg-surface-2 px-4 text-amount text-ink-1 tnum"
          aria-labelledby="payslip-fee-label"
          data-testid="payslips.form.fee"
          >{{ feeText() }}</output
        >
        <button
          appChip
          trailing="chevron-down"
          icon="tag"
          class="self-start"
          data-testid="payslips.form.feeCategory"
          [attr.aria-label]="categoryAria('fee', draft().feeCategoryId)"
          (click)="chooseCategory('fee')"
        >
          {{ categoryLabel(draft().feeCategoryId) }}
        </button>
        @if (errorFor('deductions') || errorFor('feeCategory'); as message) {
          <p
            class="flex items-center gap-1.5 text-label text-status-critical"
            data-testid="payslips.form.feeError"
          >
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        } @else {
          <p class="text-caption text-ink-3">{{ 'payslips.form.feeHint' | transloco }}</p>
        }
      </div>

      @if (draft().extra; as extra) {
        <div class="flex flex-col gap-2">
          <app-amount-field
            testId="payslips.form.extra"
            [label]="'payslips.form.extra' | transloco"
            [cents]="extra.amountCents"
            [open]="keypad() === 'extra'"
            (toggled)="toggleKeypad('extra')"
            (changed)="patchLine('extra', { amountCents: $event })"
          />
          <button
            appChip
            trailing="chevron-down"
            icon="tag"
            class="self-start"
            data-testid="payslips.form.extraCategory"
            [attr.aria-label]="categoryAria('extra', extra.categoryId)"
            (click)="chooseCategory('extra')"
          >
            {{ categoryLabel(extra.categoryId) }}
          </button>
          <app-text-field
            data-testid="payslips.form.extraMemo"
            autocomplete="off"
            [label]="'payslips.form.lineMemo' | transloco"
            [hint]="'payslips.form.optional' | transloco"
            [value]="extra.memo"
            (valueChange)="patchLine('extra', { memo: $event })"
          />
          @if (errorFor('extra'); as message) {
            <p class="flex items-center gap-1.5 text-label text-status-critical">
              <app-icon name="circle-alert" [size]="16" />{{ message }}
            </p>
          }
          <button
            appButton
            type="button"
            variant="link"
            class="-ml-3 self-start"
            data-testid="payslips.form.removeLine"
            (click)="removeLine()"
          >
            {{ 'payslips.form.removeLine' | transloco }}
          </button>
        </div>
      } @else {
        <button
          appButton
          type="button"
          variant="secondary"
          icon="plus"
          class="self-start"
          data-testid="payslips.form.addLine"
          (click)="addLine()"
        >
          {{ 'payslips.form.addLine' | transloco }}
        </button>
      }

      <div class="flex flex-col gap-2">
        <span class="text-label text-ink-2">{{ 'payslips.form.person' | transloco }}</span>
        <app-segmented-control
          data-testid="payslips.form.person"
          [label]="'payslips.form.person' | transloco"
          [options]="personOptions()"
          [value]="draft().person"
          (valueChange)="patch({ person: $event })"
        />
        @if (errorFor('userId'); as message) {
          <p class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        }
      </div>

      <label class="flex flex-col gap-2">
        <span class="text-label text-ink-2">{{ 'payslips.form.date' | transloco }}</span>
        <input
          type="date"
          class="h-12 w-full rounded-md border bg-surface-1 text-body text-ink-1 tnum focus-visible:outline-none"
          data-testid="payslips.form.date"
          [class]="
            errorFor('date')
              ? 'border-2 border-status-critical px-[15px]'
              : 'border-line-strong px-4 focus:border-2 focus:border-accent focus:px-[15px]'
          "
          [value]="draft().date"
          (change)="onDate($event)"
        />
        @if (errorFor('date'); as message) {
          <span class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </span>
        }
      </label>

      <app-text-field
        data-testid="payslips.form.memo"
        autocomplete="off"
        [label]="'payslips.form.memo' | transloco"
        [hint]="'payslips.form.optional' | transloco"
        [error]="errorFor('memo')"
        [value]="draft().memo"
        (valueChange)="patch({ memo: $event })"
      />

      <div class="flex flex-col gap-2">
        @for (message of otherErrors(); track $index) {
          <p
            class="flex items-center gap-1.5 text-label text-status-critical"
            data-testid="payslips.form.otherError"
          >
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        }
        <p class="text-caption text-ink-3">{{ 'payslips.editHint' | transloco }}</p>
        <button
          appButton
          type="submit"
          size="block"
          data-testid="payslips.form.submit"
          [loading]="busy()"
        >
          {{ 'payslips.form.save' | transloco }}
        </button>
      </div>
    </form>
  `,
  host: { class: 'block' },
})
export class PayslipFormComponent {
  private readonly sheets = inject(BottomSheetService)
  private readonly locale = inject(APP_LOCALE)

  readonly initial = input.required<PayslipDraft>()
  /** Transfers out of the account that no payslip explains yet, newest first. */
  readonly candidates = input<readonly PayoutCandidate[]>([])
  /** Every account of the household (names), and the one the payslip is for. */
  readonly accounts = input<readonly Account[]>([])
  readonly accountId = input.required<number>()
  /** Expense categories to pick a deduction's from. */
  readonly categories = input<readonly CategoryEntry[]>([])
  /** The partner's first name; null in a household of one. */
  readonly partnerName = input<string | null>(null)
  readonly busy = input(false)
  /** A 422's `{ field: message }`, keyed by API field. */
  readonly serverErrors = input<Record<string, string>>({})
  readonly submitted = output<PayslipDraft>()

  protected readonly draft = linkedSignal(() => this.initial())
  protected readonly keypad = signal<Keypad | null>(null)
  private readonly attempted = signal(false)

  private readonly words = translateSignal(WORD_KEYS)
  private readonly problemWords = translateSignal(PROBLEM_KEYS)
  private readonly candidateTemplate = translateSignal(CANDIDATE_KEY, {
    date: '{date}',
    amount: '{amount}',
    account: '{account}',
  })

  private readonly problems = computed(() =>
    this.attempted() ? payslipProblems(this.draft()) : []
  )

  protected readonly candidateViews = computed(() => {
    const draft = this.draft()
    const locale = this.locale()
    const template = this.candidateTemplate()
    return this.candidates().map((candidate) => ({
      candidate,
      checked: draft.source === 'transfer' && draft.transferId === candidate.transferId,
      label: template
        .replace('{date}', formatWeekdayDate(candidate.date, locale, { withYear: true }))
        .replace('{amount}', formatMoney(candidate.amountCents, locale))
        .replace('{account}', this.accountName(candidate.toAccountId)),
    }))
  })

  protected readonly personOptions = computed<SegmentOption<OwnerChoice>[]>(() => {
    const [you = '', joint = ''] = this.words()
    const partner = this.partnerName()
    return [
      { value: 'you', label: you },
      ...(partner ? [{ value: 'partner' as const, label: partner }] : []),
      { value: 'joint', label: joint },
    ]
  })

  protected readonly feeText = computed(() =>
    formatMoney(serviceFeeCents(this.draft()), this.locale())
  )

  protected readonly destinationLabel = computed(() => {
    const toAccountId = this.draft().toAccountId
    return toAccountId === null ? (this.words()[2] ?? '') : this.accountName(toAccountId)
  })

  protected readonly otherErrors = computed(() =>
    Object.entries(this.serverErrors())
      .filter(([field]) => !SHOWN_FIELDS.has(field))
      .map(([, message]) => message)
  )

  /** A 422 message first, then what the form itself found missing. */
  protected errorFor(field: string): string {
    const server = this.serverErrors()[field]
    if (server) {
      return server
    }
    const index = PROBLEMS.indexOf(field as PayslipProblem)
    return index >= 0 && this.problems().includes(field as PayslipProblem)
      ? (this.problemWords()[index] ?? '')
      : ''
  }

  protected categoryLabel(categoryId: number | null): string {
    const entry = this.categories().find((item) => item.category.id === categoryId)
    return entry?.category.name ?? this.words()[3] ?? ''
  }

  protected categoryAria(line: Line, categoryId: number | null): string {
    const [, , , , tax = '', fee = '', extra = ''] = this.words()
    const name = { tax, fee, extra }[line]
    return `${name}: ${this.categoryLabel(categoryId)}`
  }

  protected patch(changes: Partial<PayslipDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }))
  }

  protected patchLine(line: 'tax' | 'extra', changes: Partial<DeductionDraft>): void {
    this.draft.update((draft) => {
      if (line === 'tax') {
        return { ...draft, tax: { ...draft.tax, ...changes } }
      }
      return draft.extra ? { ...draft, extra: { ...draft.extra, ...changes } } : draft
    })
  }

  protected pick(candidate: PayoutCandidate): void {
    this.draft.update((draft) => choosePayout(draft, candidate))
    if (this.keypad() === 'net') {
      this.keypad.set(null)
    }
  }

  protected later(): void {
    if (this.draft().source !== 'new') {
      this.draft.update((draft) => choosePayoutLater(draft))
    }
  }

  protected toggleKeypad(target: Keypad): void {
    this.keypad.update((open) => (open === target ? null : target))
  }

  protected addLine(): void {
    this.patch({ extra: { categoryId: null, amountCents: 0, memo: '' } })
    this.keypad.set('extra')
  }

  protected removeLine(): void {
    this.patch({ extra: null })
    if (this.keypad() === 'extra') {
      this.keypad.set(null)
    }
  }

  protected onDate(event: Event): void {
    this.patch({ date: (event.target as HTMLInputElement).value })
  }

  protected chooseDestination(): void {
    openSelectSheet(this.sheets, {
      title: this.words()[2] ?? '',
      options: this.accounts()
        .filter((account) => account.isActive && account.id !== this.accountId())
        .map((account) => ({ value: account.id, label: account.name, icon: 'landmark' as const })),
      selected: this.draft().toAccountId,
    }).subscribe((toAccountId) => {
      if (toAccountId !== undefined) {
        this.patch({ toAccountId })
      }
    })
  }

  protected chooseCategory(line: Line): void {
    const draft = this.draft()
    const selected =
      line === 'tax'
        ? draft.tax.categoryId
        : line === 'fee'
          ? draft.feeCategoryId
          : (draft.extra?.categoryId ?? null)
    openSelectSheet(this.sheets, {
      title: this.words()[3] ?? '',
      options: this.categories().map((entry) => ({
        value: entry.category.id,
        label: entry.category.name,
        meta: entry.group.name,
      })),
      selected,
    }).subscribe((categoryId) => {
      if (categoryId === undefined) {
        return
      }
      if (line === 'fee') {
        this.patch({ feeCategoryId: categoryId })
      } else {
        this.patchLine(line, { categoryId })
      }
    })
  }

  protected submit(event: Event): void {
    event.preventDefault()
    this.attempted.set(true)
    this.keypad.set(null)
    if (payslipProblems(this.draft()).length > 0) {
      return
    }
    this.submitted.emit(this.draft())
  }

  private accountName(accountId: number): string {
    return this.accounts().find((account) => account.id === accountId)?.name ?? ''
  }
}
