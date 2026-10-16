import { Component, computed, inject, input, output } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import type { MonthReport } from '../../../core/ledger/reports.api'
import { formatDayMonth } from '../../../domain/dates'
import { formatMoney } from '../../../domain/money'
import { committedFigures } from '../../../domain/recurring'
import { IconComponent } from '../../../shared/icons/icon.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CardComponent } from '../../../shared/ui/card/card.component'
import { provideMonthScope } from '../month.scope'

/**
 * Keys picked at runtime, declared for transloco-keys-manager:
 * t(month.committed.paidOn, month.committed.dueOn)
 * t(month.committed.detect, month.committed.detecting)
 */

interface CommittedRow {
  key: string
  payee: string
  paid: boolean
  date: string
  amount: string
}

/**
 * "Committed this month" on the Month view: what the recurring payments
 * already took (paid), what they will still take until the month ends
 * (still due) and what is left once they are all paid (income − spent −
 * still due), over the month's due items, paid ones ticked. A household
 * with no recurring payment yet sees a one-line hint with "Detect
 * recurring payments" instead (the page runs it).
 */
@Component({
  selector: 'app-committed-card',
  imports: [ButtonComponent, CardComponent, IconComponent, RouterLink, TranslocoPipe],
  providers: [provideMonthScope()],
  template: `
    @if (committed().recurringCount === 0) {
      <div
        data-testid="month.committed.hint"
        class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
      >
        <p class="text-body text-ink-2">{{ 'month.committed.hint' | transloco }}</p>
        <button
          appButton
          type="button"
          variant="link"
          icon="refresh-cw"
          class="-mx-3"
          data-testid="month.committed.detect"
          [disabled]="detecting()"
          (click)="detect.emit()"
        >
          {{ (detecting() ? 'month.committed.detecting' : 'month.committed.detect') | transloco }}
        </button>
      </div>
    } @else {
      <app-card data-testid="month.committed" [eyebrow]="'month.committed.title' | transloco">
        <dl class="grid grid-cols-3 gap-3">
          <div class="flex flex-col gap-0.5" data-testid="month.committed.paid">
            <dt class="text-caption text-ink-3">{{ 'month.committed.paid' | transloco }}</dt>
            <dd class="text-body font-semibold tnum text-ink-1">
              {{ money(figures().paidCents) }}
            </dd>
          </div>
          <div class="flex flex-col gap-0.5" data-testid="month.committed.due">
            <dt class="text-caption text-ink-3">{{ 'month.committed.due' | transloco }}</dt>
            <dd class="text-body font-semibold tnum text-ink-1">
              {{ money(figures().dueCents) }}
            </dd>
          </div>
          <div class="flex flex-col gap-0.5" data-testid="month.committed.free">
            <dt class="text-caption text-ink-3">{{ 'month.committed.free' | transloco }}</dt>
            <dd
              class="text-body font-semibold tnum"
              [class]="figures().freeCents < 0 ? 'text-status-critical' : 'text-ink-1'"
            >
              {{ money(figures().freeCents) }}
            </dd>
          </div>
        </dl>

        @if (rows().length > 0) {
          <ul
            class="-mx-4 mt-1 flex flex-col border-t border-line"
            [attr.aria-label]="'month.committed.listLabel' | transloco"
          >
            @for (row of rows(); track row.key) {
              <li
                class="flex min-h-12 items-center gap-3 px-4 py-1.5"
                data-testid="month.committed.item"
                [attr.data-paid]="row.paid"
              >
                <app-icon
                  [name]="row.paid ? 'circle-check' : 'calendar'"
                  [class]="row.paid ? 'text-status-good' : 'text-ink-3'"
                />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-body text-ink-1">{{ row.payee }}</span>
                  <span class="text-caption text-ink-3">{{
                    (row.paid ? 'month.committed.paidOn' : 'month.committed.dueOn')
                      | transloco: { date: row.date }
                  }}</span>
                </span>
                <span class="shrink-0 text-body tnum text-ink-1">{{ row.amount }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="text-caption text-ink-3">{{ 'month.committed.nothingDue' | transloco }}</p>
        }

        <a
          appButton
          variant="link"
          class="-ml-3 self-start"
          routerLink="/recurring"
          data-testid="month.committed.manage"
          >{{ 'month.committed.manage' | transloco }}</a
        >
      </app-card>
    }
  `,
  host: { class: 'block' },
})
export class CommittedCardComponent {
  private readonly locale = inject(APP_LOCALE)

  readonly committed = input.required<MonthReport['committed']>()
  readonly incomeCents = input.required<number>()
  readonly expenseCents = input.required<number>()
  /** "Detect recurring payments" is running (the hint's button waits). */
  readonly detecting = input(false)
  readonly detect = output<void>()

  protected readonly figures = computed(() =>
    committedFigures({
      incomeCents: this.incomeCents(),
      expenseCents: this.expenseCents(),
      committed: this.committed(),
    })
  )

  protected readonly rows = computed<CommittedRow[]>(() =>
    this.committed().items.map((item, index) => ({
      key: `${index}:${item.id}:${item.dueDate}`,
      payee: item.payee,
      paid: item.paid,
      date: formatDayMonth(item.dueDate, this.locale()),
      amount: formatMoney(item.amountCents, this.locale()),
    }))
  )

  protected money(cents: number): string {
    return formatMoney(cents, this.locale())
  }
}
