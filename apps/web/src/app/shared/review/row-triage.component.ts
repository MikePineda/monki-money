import { Component, computed, input } from '@angular/core'
import type { TransactionKind } from '../../domain/money'
import { IconComponent } from '../icons/icon.component'
import type { IconName } from '../icons/icon-names'
import { AmountDisplayComponent } from '../ui/amount-display/amount-display.component'
import { BottomSheetComponent } from '../ui/bottom-sheet/bottom-sheet.component'
import { STATUS_TEXT_CLASS, type FeedbackStatus } from '../ui/status-icon'

/** The status line under the row summary: an icon (in its status colour) plus words. */
export interface TriageStatus {
  icon: IconName
  label: string
  /** Colours the icon; the words stay in ink. Null keeps the icon in ink-2. */
  tone: FeedbackStatus | null
}

/**
 * The shell of a review row's triage sheet, shared by the bank import and
 * the receipt scanner: the sheet frame (title, close), a summary of the row
 * (what it is, its facts, the amount and its status), then the consumer's
 * content:
 *
 * - `[triageSummary]`: extra lines under the summary (the bank text, a hint);
 * - default content: the decisions (category, transfer, payer, ignore...);
 * - `[triageFooter]`: the primary action, fixed at the bottom of the sheet.
 *
 * Open the consumer's sheet component with BottomSheetService.
 */
@Component({
  selector: 'app-row-triage',
  imports: [AmountDisplayComponent, BottomSheetComponent, IconComponent],
  template: `
    <app-bottom-sheet [title]="title()" [closeLabel]="closeLabel()">
      <section
        class="flex flex-col gap-1 border-b border-line px-4 pb-4"
        data-testid="triage.summary"
      >
        <div class="flex items-start justify-between gap-3">
          <p class="min-w-0 text-body-strong break-words text-ink-1" data-testid="triage.heading">
            {{ heading() }}
          </p>
          <app-amount-display class="shrink-0" [cents]="amountCents()" [kind]="kind()" />
        </div>
        @if (metaText()) {
          <p class="text-caption text-ink-3">{{ metaText() }}</p>
        }
        @if (status(); as current) {
          <p class="flex items-center gap-1.5 text-label text-ink-1" data-testid="triage.status">
            <app-icon [name]="current.icon" [size]="16" [class]="statusClass()" />
            {{ current.label }}
          </p>
        }
        <ng-content select="[triageSummary]" />
      </section>
      <div class="flex flex-col py-2">
        <ng-content />
      </div>
      <div sheetFooter class="flex flex-col gap-2 empty:hidden">
        <ng-content select="[triageFooter]" />
      </div>
    </app-bottom-sheet>
  `,
  host: { class: 'block' },
})
export class RowTriageComponent {
  /** The sheet title ("Review row"). */
  readonly title = input.required<string>()
  /** What the row is (a merchant, a receipt line). */
  readonly heading = input.required<string>()
  /** Facts under the heading, joined with " · " (date, account, card). */
  readonly meta = input<readonly string[]>([])
  readonly amountCents = input.required<number>()
  readonly kind = input<TransactionKind>('expense')
  readonly status = input<TriageStatus | null>(null)
  /** Accessible name of the close button. */
  readonly closeLabel = input.required<string>()

  protected readonly metaText = computed(() => this.meta().filter(Boolean).join(' · '))
  protected readonly statusClass = computed(() => {
    const tone = this.status()?.tone ?? null
    return tone ? STATUS_TEXT_CLASS[tone] : 'text-ink-2'
  })
}
