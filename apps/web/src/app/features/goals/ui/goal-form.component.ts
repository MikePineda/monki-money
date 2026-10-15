import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import type { Account } from '../../../core/api/api-types'
import {
  EMPTY_GOAL_DRAFT,
  draftProblems,
  type ContributionMode,
  type DraftProblem,
  type GoalDraft,
  type GoalOwner,
  type SavedFrom,
} from '../../../domain/goals'
import { formatMoney } from '../../../domain/money'
import { IconComponent } from '../../../shared/icons/icon.component'
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
import { GoalAmountFieldComponent } from './goal-amount-field.component'

/** Which money field has the keypad open. */
export type GoalKeypad = 'target' | 'starting' | 'contribution'

/**
 * Keys read from TypeScript, relative to the `goals` scope the host provides:
 * t(goals.form.saved.account, goals.form.saved.manual, goals.form.contribution.estimate)
 * t(goals.form.contribution.fixed, goals.owner.household, goals.owner.you)
 * t(goals.form.chooseAccount, goals.form.account, goals.form.balance)
 * t(goals.form.problems.name, goals.form.problems.targetCents, goals.form.problems.accountId)
 */
const WORD_KEYS = [
  'form.saved.account',
  'form.saved.manual',
  'form.contribution.estimate',
  'form.contribution.fixed',
  'owner.household',
  'owner.you',
  'form.chooseAccount',
  'form.account',
]
const BALANCE_KEY = 'form.balance'
/** What `draftProblems` can report, and its message key in the same order. */
const PROBLEMS: readonly DraftProblem[] = ['name', 'targetCents', 'accountId']
const PROBLEM_KEYS = PROBLEMS.map((problem) => `form.problems.${problem}`)

/**
 * The goal form, for "New goal" and for editing: name, target amount
 * (keypad), an optional target date, what is saved so far (track an
 * account's cleared balance, or type a starting amount), the monthly
 * contribution (the app's estimate by default, or a fixed amount) and whose
 * goal it is (the household, you or your partner). Missing fields are
 * named under their inputs on submit; a 422's field messages show the same
 * way. Presentational: the host saves.
 */
@Component({
  selector: 'app-goal-form',
  imports: [
    ButtonComponent,
    ChipComponent,
    FormField,
    GoalAmountFieldComponent,
    IconComponent,
    SegmentedControlComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <form class="flex flex-col gap-6" novalidate (submit)="submit($event)">
      <app-text-field
        data-testid="goals.form.name"
        autocomplete="off"
        [label]="'goals.form.name' | transloco"
        [formField]="fields.name"
        [error]="errorFor('name')"
      />

      <app-goal-amount-field
        testId="goals.form.target"
        [label]="'goals.form.target' | transloco"
        [cents]="draft().targetCents"
        [open]="keypad() === 'target'"
        [hint]="'goals.form.amountHint' | transloco"
        [error]="errorFor('targetCents')"
        (toggled)="toggleKeypad('target')"
        (changed)="patch({ targetCents: $event })"
      />

      <label class="flex flex-col gap-2">
        <span class="text-label text-ink-2">{{ 'goals.form.targetDate' | transloco }}</span>
        <input
          type="date"
          class="h-12 w-full rounded-md border bg-surface-1 text-body text-ink-1 tnum focus-visible:outline-none"
          data-testid="goals.form.targetDate"
          [class]="
            errorFor('targetDate')
              ? 'border-2 border-status-critical px-[15px]'
              : 'border-line-strong px-4 focus:border-2 focus:border-accent focus:px-[15px]'
          "
          [value]="draft().targetDate"
          (change)="onDate($event)"
        />
        @if (errorFor('targetDate'); as message) {
          <span class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </span>
        } @else {
          <span class="text-caption text-ink-3">{{ 'goals.form.optional' | transloco }}</span>
        }
      </label>
      @if (draft().targetDate) {
        <button
          appButton
          type="button"
          variant="link"
          class="-mt-5 -ml-3 self-start"
          data-testid="goals.form.clearDate"
          (click)="patch({ targetDate: '' })"
        >
          {{ 'goals.form.clearDate' | transloco }}
        </button>
      }

      <fieldset class="flex flex-col gap-3">
        <legend class="mb-2 text-label text-ink-2">
          {{ 'goals.form.saved.label' | transloco }}
        </legend>
        <app-segmented-control
          data-testid="goals.form.savedFrom"
          [label]="'goals.form.saved.label' | transloco"
          [options]="savedOptions()"
          [value]="draft().savedFrom"
          (valueChange)="patch({ savedFrom: $event })"
        />
        @if (draft().savedFrom === 'account') {
          <div class="flex flex-col gap-2">
            <button
              appChip
              trailing="chevron-down"
              icon="wallet"
              class="self-start"
              data-testid="goals.form.account"
              (click)="chooseAccount()"
            >
              {{ accountLabel() }}
            </button>
            @if (errorFor('accountId'); as message) {
              <p class="flex items-center gap-1.5 text-label text-status-critical">
                <app-icon name="circle-alert" [size]="16" />{{ message }}
              </p>
            } @else {
              <p class="text-caption text-ink-3">{{ 'goals.form.accountHint' | transloco }}</p>
            }
          </div>
        } @else {
          <app-goal-amount-field
            testId="goals.form.starting"
            [label]="'goals.form.starting' | transloco"
            [cents]="draft().startingCents"
            [open]="keypad() === 'starting'"
            [error]="errorFor('startingCents')"
            (toggled)="toggleKeypad('starting')"
            (changed)="patch({ startingCents: $event })"
          />
        }
      </fieldset>

      <fieldset class="flex flex-col gap-3">
        <legend class="mb-2 text-label text-ink-2">
          {{ 'goals.form.contribution.label' | transloco }}
        </legend>
        <app-segmented-control
          data-testid="goals.form.contribution"
          [label]="'goals.form.contribution.label' | transloco"
          [options]="contributionOptions()"
          [value]="draft().contribution"
          (valueChange)="setContribution($event)"
        />
        @if (draft().contribution === 'fixed') {
          <app-goal-amount-field
            testId="goals.form.monthly"
            [label]="'goals.form.contribution.amount' | transloco"
            [cents]="draft().monthlyContributionCents"
            [open]="keypad() === 'contribution'"
            [error]="errorFor('monthlyContributionCents')"
            (toggled)="toggleKeypad('contribution')"
            (changed)="patch({ monthlyContributionCents: $event })"
          />
        } @else {
          <p class="text-caption text-ink-3">
            {{ 'goals.form.contribution.estimateHint' | transloco }}
          </p>
        }
      </fieldset>

      <div class="flex flex-col gap-2">
        <span class="text-label text-ink-2">{{ 'goals.form.owner' | transloco }}</span>
        <app-segmented-control
          data-testid="goals.form.owner"
          [label]="'goals.form.owner' | transloco"
          [options]="ownerOptions()"
          [value]="draft().owner"
          (valueChange)="patch({ owner: $event })"
        />
        @if (errorFor('userId'); as message) {
          <p class="flex items-center gap-1.5 text-label text-status-critical">
            <app-icon name="circle-alert" [size]="16" />{{ message }}
          </p>
        }
      </div>

      <div class="flex flex-col gap-2">
        <button
          appButton
          type="submit"
          size="block"
          data-testid="goals.form.submit"
          [loading]="busy()"
        >
          {{ submitLabel() }}
        </button>
        @if (cancellable()) {
          <button
            appButton
            type="button"
            variant="ghost"
            data-testid="goals.form.cancel"
            (click)="cancelled.emit()"
          >
            {{ 'goals.form.cancel' | transloco }}
          </button>
        }
      </div>
    </form>
  `,
  host: { class: 'block' },
})
export class GoalFormComponent {
  private readonly sheets = inject(BottomSheetService)
  private readonly locale = inject(APP_LOCALE)

  readonly initial = input<GoalDraft>(EMPTY_GOAL_DRAFT)
  /** The household's active accounts, to track one's cleared balance. */
  readonly accounts = input<readonly Account[]>([])
  /** The partner's first name; null in a household of one. */
  readonly partnerName = input<string | null>(null)
  readonly submitLabel = input.required<string>()
  readonly busy = input(false)
  /** A 422's `{ field: message }`, keyed by API field. */
  readonly serverErrors = input<Record<string, string>>({})
  readonly cancellable = input(false)
  /** The money field whose keypad starts open (the detail's "set a contribution" nudge). */
  readonly startWith = input<GoalKeypad | null>(null)
  readonly submitted = output<GoalDraft>()
  readonly cancelled = output<void>()

  protected readonly draft = linkedSignal(() => this.initial())
  protected readonly fields = form(this.draft, (path) => {
    required(path.name)
  })
  protected readonly keypad = linkedSignal<GoalKeypad | null>(() => this.startWith())
  private readonly attempted = signal(false)

  private readonly words = translateSignal(WORD_KEYS)
  private readonly problemWords = translateSignal(PROBLEM_KEYS)
  private readonly balanceTemplate = translateSignal(BALANCE_KEY, { amount: '{amount}' })

  private readonly problems = computed(() => (this.attempted() ? draftProblems(this.draft()) : []))

  protected readonly savedOptions = computed<SegmentOption<SavedFrom>[]>(() => {
    const [account = '', manual = ''] = this.words()
    return [
      { value: 'account', label: account },
      { value: 'manual', label: manual },
    ]
  })

  protected readonly contributionOptions = computed<SegmentOption<ContributionMode>[]>(() => {
    const [, , estimate = '', fixed = ''] = this.words()
    return [
      { value: 'estimate', label: estimate },
      { value: 'fixed', label: fixed },
    ]
  })

  protected readonly ownerOptions = computed<SegmentOption<GoalOwner>[]>(() => {
    const words = this.words()
    const options: SegmentOption<GoalOwner>[] = [
      { value: 'household', label: words[4] ?? '' },
      { value: 'you', label: words[5] ?? '' },
    ]
    const partner = this.partnerName()
    if (partner) {
      options.push({ value: 'partner', label: partner })
    }
    return options
  })

  protected readonly accountLabel = computed(() => {
    const account = this.accounts().find((item) => item.id === this.draft().accountId)
    return account?.name ?? this.words()[6] ?? ''
  })

  /** A 422 message first, then what the form itself found missing. */
  protected errorFor(field: string): string {
    const server = this.serverErrors()[field]
    if (server) {
      return server
    }
    const index = PROBLEMS.indexOf(field as DraftProblem)
    return index >= 0 && this.problems().includes(field as DraftProblem)
      ? (this.problemWords()[index] ?? '')
      : ''
  }

  protected patch(changes: Partial<GoalDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }))
  }

  protected toggleKeypad(target: GoalKeypad): void {
    this.keypad.update((open) => (open === target ? null : target))
  }

  protected setContribution(mode: ContributionMode): void {
    this.patch({ contribution: mode })
    this.keypad.set(mode === 'fixed' ? 'contribution' : null)
  }

  protected onDate(event: Event): void {
    this.patch({ targetDate: (event.target as HTMLInputElement).value })
  }

  protected chooseAccount(): void {
    openSelectSheet(this.sheets, {
      title: this.words()[7] ?? '',
      options: this.accounts().map((account) => ({
        value: account.id,
        label: account.name,
        icon: 'wallet' as const,
        meta: this.balanceText(account.clearedBalanceCents),
      })),
      selected: this.draft().accountId,
    }).subscribe((accountId) => {
      if (accountId !== undefined) {
        this.patch({ accountId })
      }
    })
  }

  protected submit(event: Event): void {
    event.preventDefault()
    this.attempted.set(true)
    this.keypad.set(null)
    if (draftProblems(this.draft()).length > 0) {
      return
    }
    this.submitted.emit(this.draft())
  }

  private balanceText(cents: number): string {
    return this.balanceTemplate().replace('{amount}', formatMoney(cents, this.locale()))
  }
}
