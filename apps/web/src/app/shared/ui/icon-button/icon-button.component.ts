import { Component, input } from '@angular/core'
import { IconComponent } from '../../icons/icon.component'
import type { IconName } from '../../icons/icon-names'

/**
 * 44 x 44 icon-only button with a required accessible name. No fill; the
 * pressed state (or `pressed` for toggles) uses surface-2.
 */
@Component({
  selector: 'button[appIconButton], a[appIconButton]',
  imports: [IconComponent],
  template: `<app-icon [name]="icon()" />`,
  host: {
    'class':
      'inline-grid size-11 shrink-0 place-items-center rounded-md text-ink-1 transition-colors ' +
      'active:bg-surface-2 disabled:text-ink-3 disabled:cursor-default',
    '[class.bg-surface-2]': 'pressed() === true',
    '[attr.aria-label]': 'label()',
    '[attr.aria-pressed]': 'pressed()',
  },
})
export class IconButtonComponent {
  readonly icon = input.required<IconName>()
  readonly label = input.required<string>()
  /** Only for toggle buttons; leave null for plain actions. */
  readonly pressed = input<boolean | null>(null)
}
