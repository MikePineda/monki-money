import { Component, Injector, computed, inject } from '@angular/core'
import { translateSignal } from '@jsverse/transloco'
import { provideOutboxI18n } from '../../core/outbox/outbox-i18n'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { IconComponent } from '../../shared/icons/icon.component'
import { BottomSheetService } from '../../shared/ui/bottom-sheet/bottom-sheet.service'
import { OutboxSheetComponent } from './outbox-sheet.component'

/** Relative to the scope this component provides: t(outbox.pill.pending, outbox.pill.failed) */
const PENDING_KEY = 'pill.pending'
const FAILED_KEY = 'pill.failed'

const CHIP =
  'pointer-events-auto relative inline-flex h-9 items-center gap-1.5 rounded-md border bg-surface-1 ' +
  'px-3 text-label whitespace-nowrap text-ink-1 transition-colors active:bg-surface-2 ' +
  "before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"

/**
 * The sync pill (shell, above the tab bar): what is saved on this phone but
 * not on the server yet, the single place that tells. Hidden when the
 * outbox is empty; "2 pending" (spinning while a sync runs, a no-signal
 * glyph while offline) and "1 failed" with the warning icon and border.
 * A tap opens the sheet to retry, edit or discard entries.
 *
 * The label is computed here (translateSignal), which also loads the
 * `outbox` scope as soon as the shell shows, while the app is still online.
 */
@Component({
  selector: 'app-outbox-pill',
  imports: [IconComponent],
  providers: [provideOutboxI18n()],
  template: `
    @if (visible()) {
      <div class="mx-auto flex w-full max-w-app justify-end px-4">
        <button
          type="button"
          data-testid="outbox.pill"
          aria-haspopup="dialog"
          [class]="classes()"
          (click)="open()"
        >
          @if (outbox.isSyncing()) {
            <app-icon name="loader-circle" class="animate-spin text-ink-2" [size]="16" />
          } @else if (outbox.failedCount() > 0) {
            <app-icon name="triangle-alert" class="text-status-warning" [size]="16" />
          } @else if (!outbox.isOnline()) {
            <app-icon name="wifi-off" class="text-ink-2" [size]="16" />
          } @else {
            <app-icon name="refresh-cw" class="text-ink-2" [size]="16" />
          }
          <span>{{ label() }}</span>
        </button>
      </div>
    }
  `,
  host: { class: 'pointer-events-none block' },
})
export class OutboxPillComponent {
  protected readonly outbox = inject(OutboxStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly injector = inject(Injector)

  readonly visible = computed(() => this.outbox.pendingCount() + this.outbox.failedCount() > 0)

  private readonly pendingText = translateSignal(
    PENDING_KEY,
    computed(() => ({ count: this.outbox.pendingCount() }))
  )
  private readonly failedText = translateSignal(
    FAILED_KEY,
    computed(() => ({ count: this.outbox.failedCount() }))
  )

  protected readonly label = computed(() => {
    const parts: string[] = []
    if (this.outbox.pendingCount() > 0) {
      parts.push(this.pendingText())
    }
    if (this.outbox.failedCount() > 0) {
      parts.push(this.failedText())
    }
    return parts.join(' · ')
  })

  protected readonly classes = computed(
    () =>
      `${CHIP} ${this.outbox.failedCount() > 0 ? 'border-status-warning' : 'border-line-strong'}`
  )

  protected open(): void {
    // The sheet resolves the `outbox` scope through this component's injector.
    this.sheets.open(OutboxSheetComponent, { injector: this.injector })
  }
}
