import { Component, input } from '@angular/core'

/**
 * Card (DESIGN.md, Card): surface-1, hairline border, radius 12, 16px
 * padding, no shadow. Never nested in another card. Used for insight cards,
 * the install card and settings groups.
 */
@Component({
  selector: 'app-card',
  template: `
    @if (eyebrow()) {
      <p class="text-eyebrow uppercase text-ink-2">{{ eyebrow() }}</p>
    }
    <ng-content />
  `,
  host: { class: 'flex flex-col gap-2 rounded-lg border border-line bg-surface-1 p-4 text-ink-1' },
})
export class CardComponent {
  readonly eyebrow = input('')
}
