import { Component, input } from '@angular/core'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'

/**
 * One 56px row of a settings card (DESIGN mock `settings`): the label left,
 * an optional value in ink-2 and a trailing icon (chevron for navigation,
 * download for an action) right. On a native <a> or <button>; rows after
 * the first get a hairline on top.
 */
@Component({
  selector: 'a[appSettingsRow], button[appSettingsRow], div[appSettingsRow]',
  imports: [IconComponent],
  template: `
    <span class="min-w-0 flex-1 truncate text-left text-body text-ink-1"><ng-content /></span>
    @if (value()) {
      <span class="max-w-[50%] truncate text-body text-ink-2">{{ value() }}</span>
    }
    @if (trailing(); as icon) {
      <app-icon [name]="icon" class="text-ink-2" />
    }
  `,
  host: {
    class:
      'flex h-14 w-full items-center gap-3 px-4 text-ink-1 transition-colors active:bg-surface-2 ' +
      '[&:not(:first-child)]:border-t [&:not(:first-child)]:border-line',
  },
})
export class SettingsRowComponent {
  readonly value = input('')
  readonly trailing = input<IconName | null>('chevron-right')
}
