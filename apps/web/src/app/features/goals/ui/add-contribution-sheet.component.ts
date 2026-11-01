import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import {
  contributionPayload,
  contributionProblems,
  emptyContributionDraft,
  type ContributionDirection,
  type ContributionDraft,
  type ContributionFields,
  type ContributionProblem,
} from '../../../domain/goals'
import type { IsoDate } from '../../../domain/month'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountFieldComponent } from '../../../shared/ui/amount-field/amount-field.component'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'

export interface AddContributionSheetData {
  /** The household's today: the default day and the latest one allowed. */
  today: IsoDate
}

/**
 * Keys read from TypeScript, relative to the `goals` scope the host provides:
 * t(goals.contributions.sheet.in, goals.contributions.sheet.out)
 * t(goals.contributions.problems.amountCents, goals.contributions.problems.date)
 */
const DIRECTION_KEYS = ['contributions.sheet.in', 'contributions.sheet.out']
const PROBLEMS: readonly ContributionProblem[] = ['amountCents', 'date']
const PROBLEM_KEYS = PROBLEMS.map((problem) => `contributions.problems.${problem}`)

/**
 * "Add contribution" on a goal without an account: money in or out
 * (segmented control), the amount on the keypad (open from the start), the
 * day (today by default, never later) and an optional note. Missing fields
 * are named under their inputs on submit. Closes with the API body (signed
 * amount), or nothing when dismissed. Open it with the page's injector so
 * it reads the `goals` scope.
 */
@Component({
  selector: 'app-add-contribution-sheet',
  imports: [
    AmountFieldComponent,
    BottomSheetComponent,
    ButtonComponent,
    IconComponent,
    SegmentedControlComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet
      [title]="'goals.contributions.sheet.title' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <div class="flex flex-col gap-5 px-4 pb-2">
        <app-segmented-control
          data-testid="goals.contribution.direction"
          [label]="'goals.contributions.sheet.direction' | transloco"
          [options]="directions()"
          [value]="draft().direction"
          (valueChange)="patch({ direction: $event })"
        />

        <app-amount-field
          testId="goals.contribution.amount"
          [label]="'goals.contributions.sheet.amount' | transloco"
          [cents]="draft().amountCents"
          [open]="keypadOpen()"
          [error]="errorFor('amountCents')"
          (toggled)="keypadOpen.set(!keypadOpen())"
          (changed)="patch({ amountCents: $event })"
        />

        <label class="flex flex-col gap-2">
          <span class="text-label text-ink-2">{{
            'goals.contributions.sheet.date' | transloco
          }}</span>
          <input
            type="date"
            class="h-12 w-full rounded-md border bg-surface-1 text-body text-ink-1 tnum focus-visible:outline-none"
            data-testid="goals.contribution.date"
            [class]="
              errorFor('date')
                ? 'border-2 border-status-critical px-[15px]'
                : 'border-line-strong px-4 focus:border-2 focus:border-accent focus:px-[15px]'
            "
            [max]="data.today"
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
          data-testid="goals.contribution.memo"
          autocomplete="off"
          [label]="'goals.contributions.sheet.memo' | transloco"
          [hint]="'goals.contributions.sheet.optional' | transloco"
          [value]="draft().memo"
          (valueChange)="patch({ memo: $event })"
        />
      </div>
      <div sheetFooter class="flex flex-col gap-2">
        <button
          appButton
          type="button"
          size="block"
          data-testid="goals.contribution.save"
          (click)="submit()"
        >
          {{ 'goals.contributions.sheet.save' | transloco }}
        </button>
        <button appButton type="button" variant="ghost" (click)="dialogRef.close()">
          {{ 'goals.contributions.sheet.cancel' | transloco }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class AddContributionSheetComponent {
  protected readonly dialogRef = inject<DialogRef<ContributionFields>>(DialogRef)
  protected readonly data = inject<AddContributionSheetData>(DIALOG_DATA)

  protected readonly draft = signal<ContributionDraft>(emptyContributionDraft(this.data.today))
  protected readonly keypadOpen = signal(true)
  private readonly tried = signal(false)

  private readonly directionWords = translateSignal(DIRECTION_KEYS)
  private readonly problemWords = translateSignal(PROBLEM_KEYS)

  protected readonly directions = computed<SegmentOption<ContributionDirection>[]>(() => {
    const [moneyIn = '', moneyOut = ''] = this.directionWords()
    return [
      { value: 'in', label: moneyIn },
      { value: 'out', label: moneyOut },
    ]
  })

  private readonly problems = computed(() =>
    this.tried() ? contributionProblems(this.draft(), this.data.today) : []
  )

  protected errorFor(field: ContributionProblem): string {
    if (!this.problems().includes(field)) {
      return ''
    }
    return this.problemWords()[PROBLEMS.indexOf(field)] ?? ''
  }

  protected patch(change: Partial<ContributionDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }))
  }

  protected onDate(event: Event): void {
    this.patch({ date: (event.target as HTMLInputElement).value })
  }

  protected submit(): void {
    this.tried.set(true)
    if (contributionProblems(this.draft(), this.data.today).length > 0) {
      return
    }
    this.dialogRef.close(contributionPayload(this.draft()))
  }
}
