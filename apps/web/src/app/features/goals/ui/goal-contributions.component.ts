import { Component, computed, inject, input, output } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import type { GoalContribution } from '../../../core/api/api-types'
import { formatShortDay } from '../../../domain/dates'
import { formatMoney } from '../../../domain/money'
import type { IsoDate } from '../../../domain/month'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'

/**
 * Keys read from TypeScript, relative to the `goals` scope the host provides:
 * t(goals.contributions.in, goals.contributions.out, goals.contributions.deleteLabel)
 */
const WORD_KEYS = ['contributions.in', 'contributions.out']
const DELETE_KEY = 'contributions.deleteLabel'

let nextId = 0

/**
 * The contributions of a goal without an account, newest first: the day,
 * the note (or "Added" / "Taken out"), who logged it and the signed amount
 * (money in green with a plus, money out with a minus), each with a delete
 * button, and "Add contribution" on top. Presentational: the host adds and
 * confirms deletes.
 */
@Component({
  selector: 'app-goal-contributions',
  imports: [AmountDisplayComponent, ButtonComponent, IconButtonComponent, TranslocoPipe],
  template: `
    <div class="flex items-center justify-between gap-3">
      <h2 [id]="headingId" class="text-heading text-ink-1">
        {{ 'goals.contributions.title' | transloco }}
      </h2>
      <button
        appButton
        type="button"
        variant="secondary"
        icon="plus"
        data-testid="goal.contributions.add"
        (click)="add.emit()"
      >
        {{ 'goals.contributions.add' | transloco }}
      </button>
    </div>
    @if (rows().length === 0) {
      <p class="text-body text-ink-2" data-testid="goal.contributions.empty">
        {{ 'goals.contributions.empty' | transloco }}
      </p>
    } @else {
      <ul
        class="flex flex-col divide-y divide-line border-y border-line"
        [attr.aria-labelledby]="headingId"
      >
        @for (row of rows(); track row.contribution.id) {
          <li class="flex min-h-14 items-center gap-3 py-2" data-testid="goal.contribution">
            <div class="min-w-0 flex-1">
              <p class="truncate text-body text-ink-1" data-testid="goal.contribution.title">
                {{ row.title }}
              </p>
              <p class="truncate text-caption text-ink-2" data-testid="goal.contribution.meta">
                {{ row.meta }}
              </p>
            </div>
            <app-amount-display
              data-testid="goal.contribution.amount"
              [cents]="row.contribution.amountCents"
              [kind]="row.contribution.amountCents > 0 ? 'income' : 'expense'"
            />
            <button
              appIconButton
              type="button"
              icon="trash-2"
              data-testid="goal.contribution.delete"
              [label]="row.deleteLabel"
              [disabled]="busy()"
              (click)="remove.emit(row.contribution)"
            ></button>
          </li>
        }
      </ul>
    }
  `,
  host: { 'class': 'flex flex-col gap-3', '[attr.data-testid]': '"goal.contributions"' },
})
export class GoalContributionsComponent {
  private readonly locale = inject(APP_LOCALE)

  readonly contributions = input.required<readonly GoalContribution[]>()
  /** The household's today, for short dates ("3 Nov", with the year when it is another one). */
  readonly today = input.required<IsoDate>()
  /** First names by user id ("You" for the reader); a missing one shows no name. */
  readonly names = input<ReadonlyMap<number, string>>(new Map())
  readonly busy = input(false)
  readonly add = output<void>()
  readonly remove = output<GoalContribution>()

  protected readonly headingId = `goal-contributions-${nextId++}`

  private readonly words = translateSignal(WORD_KEYS)
  private readonly deleteTemplate = translateSignal(DELETE_KEY, {
    amount: '{amount}',
    date: '{date}',
  })

  protected readonly rows = computed(() => {
    const [moneyIn = '', moneyOut = ''] = this.words()
    const locale = this.locale()
    return this.contributions().map((contribution) => {
      const day = formatShortDay(contribution.date, locale, this.today())
      const who = contribution.userId === null ? null : this.names().get(contribution.userId)
      return {
        contribution,
        title: contribution.memo ?? (contribution.amountCents > 0 ? moneyIn : moneyOut),
        meta: who ? `${day} · ${who}` : day,
        deleteLabel: this.deleteLabel(formatMoney(contribution.amountCents, locale), day),
      }
    })
  })

  /** "Delete −$25.00 from 3 Nov". */
  private deleteLabel(amount: string, day: string): string {
    return this.deleteTemplate().replace('{amount}', amount).replace('{date}', day)
  }
}
