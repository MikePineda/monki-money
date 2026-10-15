import { Component, computed, input } from '@angular/core'
import { ICON_SPRITE_URL, type IconName } from './icon-names'

export type IconSize = 16 | 20 | 24

/**
 * A Lucide icon from the sprite: 20px by default (24 in empty states and the
 * add button, 16 inline with captions), 1.75 stroke, round caps, coloured
 * with currentColor. Decorative: give the meaning to the surrounding control
 * (an aria-label or visible text).
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.data-icon]="name()"
    >
      <use [attr.href]="href()" />
    </svg>
  `,
  host: {
    'class': 'inline-flex shrink-0',
    'aria-hidden': 'true',
  },
})
export class IconComponent {
  readonly name = input.required<IconName>()
  readonly size = input<IconSize>(20)

  protected readonly href = computed(() => `${ICON_SPRITE_URL}#${this.name()}`)
}
