import { Component, computed, input, output } from '@angular/core'
import { IconComponent } from '../../icons/icon.component'
import { IconButtonComponent } from '../icon-button/icon-button.component'
import { STATUS_ICON, STATUS_TEXT_CLASS, type FeedbackStatus } from '../status-icon'

/**
 * One toast (DESIGN.md, Toast): raised surface, level-2 elevation, radius 12,
 * message in body ink, optional status icon, optional accent action
 * ("Undo", "Update"), and a close button when it does not go away by itself.
 * Presentational: a layout renders the current toast from the ToastStore
 * inside an aria-live region.
 */
@Component({
  selector: 'app-toast',
  imports: [IconComponent, IconButtonComponent],
  template: `
    @if (status()) {
      <app-icon [name]="statusIcon()" [class]="statusClass()" />
    }
    <p class="min-w-0 flex-1 text-body text-ink-1">{{ message() }}</p>
    @if (actionLabel()) {
      <button
        type="button"
        class="h-11 shrink-0 rounded-md px-3 text-body-strong text-accent active:bg-surface-2"
        (click)="action.emit()"
      >
        {{ actionLabel() }}
      </button>
    }
    @if (dismissLabel()) {
      <button
        appIconButton
        type="button"
        icon="x"
        [label]="dismissLabel()"
        (click)="dismissed.emit()"
      ></button>
    }
  `,
  host: {
    class:
      'flex min-h-12 animate-toast-in items-center gap-3 rounded-lg border border-line bg-surface-1 py-1 pr-1 pl-4 shadow-2',
  },
})
export class ToastComponent {
  readonly message = input.required<string>()
  readonly status = input<FeedbackStatus | null>(null)
  readonly actionLabel = input('')
  /** Accessible name of the close button; the button only shows when set. */
  readonly dismissLabel = input('')
  readonly action = output<void>()
  readonly dismissed = output<void>()

  protected readonly statusIcon = computed(() => STATUS_ICON[this.status() ?? 'good'])
  protected readonly statusClass = computed(() => STATUS_TEXT_CLASS[this.status() ?? 'good'])
}
