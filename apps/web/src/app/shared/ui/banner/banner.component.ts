import { Component, computed, input, output } from '@angular/core'
import { IconComponent } from '../../icons/icon.component'
import type { IconName } from '../../icons/icon-names'
import { IconButtonComponent } from '../icon-button/icon-button.component'
import { STATUS_ICON, STATUS_TEXT_CLASS, type FeedbackStatus } from '../status-icon'

/**
 * Inline banner (DESIGN.md, Banner) at the top of the content it concerns:
 * sunken surface, radius 12, no border or stripe. A 20px icon (`info` in
 * ink-2, or a status icon in its colour), the message, an optional accent
 * action ("Update", "Reload") and an optional close button.
 * Used for: new version, offline, import warnings, budget past 90%.
 */
@Component({
  selector: 'app-banner',
  imports: [IconComponent, IconButtonComponent],
  template: `
    <app-icon [name]="iconName()" [class]="iconClass()" class="mt-0.5" />
    <div class="flex min-w-0 flex-1 flex-col items-start gap-0.5">
      <p class="text-body text-ink-1">{{ message() }}</p>
      @if (actionLabel()) {
        <button
          type="button"
          class="-ml-3 h-11 rounded-md px-3 text-body-strong text-accent active:bg-surface-1"
          (click)="action.emit()"
        >
          {{ actionLabel() }}
        </button>
      }
    </div>
    @if (dismissLabel()) {
      <button
        appIconButton
        type="button"
        icon="x"
        class="-my-2.5"
        [label]="dismissLabel()"
        (click)="dismissed.emit()"
      ></button>
    }
  `,
  host: {
    'class': 'flex items-start gap-3 rounded-lg bg-surface-2 py-3 pr-1 pl-4',
    '[attr.role]': "status() === 'critical' || status() === 'serious' ? 'alert' : 'status'",
  },
})
export class BannerComponent {
  readonly message = input.required<string>()
  readonly status = input<FeedbackStatus | null>(null)
  /** Overrides the icon of a neutral banner (for example `wifi-off`). */
  readonly icon = input<IconName>('info')
  readonly actionLabel = input('')
  /** Accessible name of the close button; the button only shows when set. */
  readonly dismissLabel = input('')
  readonly action = output<void>()
  readonly dismissed = output<void>()

  protected readonly iconName = computed(() => {
    const status = this.status()
    return status ? STATUS_ICON[status] : this.icon()
  })

  protected readonly iconClass = computed(() => {
    const status = this.status()
    return status ? STATUS_TEXT_CLASS[status] : 'text-ink-2'
  })
}
