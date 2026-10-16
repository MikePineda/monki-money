import { Component, input, output } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { CardComponent } from '../../../shared/ui/card/card.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'

/** One deduction as the card shows it; `name` null = no category. */
export interface PayslipLineView {
  name: string | null
  masked: boolean
  memo: string | null
  amount: string
}

/** A payslip with its words resolved (dates, money, names) by the page. */
export interface PayslipCardView {
  id: number
  date: string
  /** "You", the partner's first name or "Joint", already in the reader's language. */
  person: string
  gross: string
  deductions: string
  net: string
  /** The bank account the net went to; null when no transfer is linked. */
  toAccount: string | null
  lines: PayslipLineView[]
}

/**
 * One payslip in the list (DESIGN.md, Card): its date and who earned it,
 * gross / deductions / net side by side in tabular figures, each deduction
 * with its category, where the net went, and a delete action (the page
 * asks first).
 */
@Component({
  selector: 'app-payslip-card',
  imports: [CardComponent, IconButtonComponent, TranslocoPipe],
  template: `
    <app-card class="gap-3!" [attr.data-testid]="'payslips.card.' + view().id">
      <div class="flex items-start gap-2">
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="text-body-strong text-ink-1" data-testid="payslips.card.date">{{
            view().date
          }}</span>
          <span class="truncate text-caption text-ink-3" data-testid="payslips.card.meta">
            {{ view().person }} ·
            @if (view().toAccount; as account) {
              {{ 'payslips.card.to' | transloco: { account } }}
            } @else {
              {{ 'payslips.card.unlinked' | transloco }}
            }
          </span>
        </div>
        <button
          appIconButton
          type="button"
          icon="trash-2"
          data-testid="payslips.card.delete"
          [label]="'payslips.card.delete' | transloco: { date: view().date }"
          [disabled]="busy()"
          (click)="deleteRequested.emit()"
        ></button>
      </div>

      <dl class="grid grid-cols-3 gap-2">
        <div class="flex min-w-0 flex-col">
          <dt class="text-caption text-ink-3">{{ 'payslips.card.gross' | transloco }}</dt>
          <dd class="truncate text-body text-ink-1 tnum" data-testid="payslips.card.gross">
            {{ view().gross }}
          </dd>
        </div>
        <div class="flex min-w-0 flex-col">
          <dt class="text-caption text-ink-3">{{ 'payslips.card.deductions' | transloco }}</dt>
          <dd class="truncate text-body text-ink-1 tnum" data-testid="payslips.card.deductions">
            {{ view().deductions }}
          </dd>
        </div>
        <div class="flex min-w-0 flex-col">
          <dt class="text-caption text-ink-3">{{ 'payslips.card.net' | transloco }}</dt>
          <dd class="truncate text-body-strong text-ink-1 tnum" data-testid="payslips.card.net">
            {{ view().net }}
          </dd>
        </div>
      </dl>

      @if (view().lines.length > 0) {
        <ul class="flex flex-col gap-1 border-t border-line pt-3">
          @for (line of view().lines; track $index) {
            <li class="flex items-baseline gap-3 text-caption" data-testid="payslips.card.line">
              <span class="min-w-0 flex-1 truncate text-ink-2">
                @if (line.masked) {
                  {{ 'payslips.card.private' | transloco }}
                } @else if (line.name; as name) {
                  {{ name }}
                } @else {
                  {{ 'payslips.card.noCategory' | transloco }}
                }
                @if (line.memo; as memo) {
                  <span class="text-ink-3"> · {{ memo }}</span>
                }
              </span>
              <span class="text-ink-2 tnum">{{ line.amount }}</span>
            </li>
          }
        </ul>
      }
    </app-card>
  `,
  host: { class: 'block' },
})
export class PayslipCardComponent {
  readonly view = input.required<PayslipCardView>()
  readonly busy = input(false)
  readonly deleteRequested = output<void>()
}
