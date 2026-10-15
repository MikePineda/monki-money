import { Component, input, output } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'

/** What a receipt line shows, already worded by the review. */
export interface ReceiptLineView {
  id: number
  description: string
  /** The amount it will be saved with (the last line takes what is left of the total). */
  amountCents: number
  quantity: number | null
  categoryName: string
  categoryIcon: IconName
  /** The last line took a difference to match the total. */
  adjusted: boolean
}

/**
 * One printed line of a receipt in the review list, next to the list's
 * checkbox: the words over "category · quantity", the amount it will be
 * saved with ("Adjusted" when the last line took the difference to the
 * total). Tapping it picks the line's category. Receipt text is rendered
 * as text only.
 */
@Component({
  selector: 'app-receipt-line-item',
  imports: [AmountDisplayComponent, IconComponent, TranslocoPipe],
  template: `
    <button
      type="button"
      class="flex min-h-14 w-full items-center gap-3 py-2 pr-4 text-left active:bg-surface-2"
      data-testid="scan.line"
      [attr.data-id]="line().id"
      (click)="opened.emit()"
    >
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-body text-ink-1" data-testid="scan.line.description">{{
          line().description
        }}</span>
        <span class="flex min-w-0 items-center gap-1.5 text-caption text-ink-3">
          <app-icon [name]="line().categoryIcon" [size]="16" class="shrink-0 text-ink-2" />
          <span class="truncate" data-testid="scan.line.category">{{ line().categoryName }}</span>
          @if (line().quantity !== null && line().quantity !== 1) {
            <span class="shrink-0"
              >· {{ 'scan.review.quantity' | transloco: { quantity: line().quantity } }}</span
            >
          }
        </span>
      </span>
      <span class="flex shrink-0 flex-col items-end">
        <app-amount-display
          data-testid="scan.line.amount"
          kind="expense"
          [cents]="line().amountCents"
        />
        @if (line().adjusted) {
          <span class="text-caption text-ink-3" data-testid="scan.line.adjusted">{{
            'scan.review.adjusted' | transloco
          }}</span>
        }
      </span>
    </button>
  `,
  host: { class: 'block' },
})
export class ReceiptLineItemComponent {
  readonly line = input.required<ReceiptLineView>()
  readonly opened = output<void>()
}
