import { Component, input } from '@angular/core'
import { IconComponent } from '../../icons/icon.component'
import type { IconName } from '../../icons/icon-names'

/**
 * Empty state (DESIGN.md, Empty state): a 48px sunken square with a 24px
 * icon, the fact as a heading, the next step in one sentence, and one action
 * (projected). Honest copy, no illustrations.
 */
@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  template: `
    <span class="grid size-12 place-items-center rounded-lg bg-surface-2 text-ink-3">
      <app-icon [name]="icon()" [size]="24" />
    </span>
    <h2 class="text-heading text-ink-1">{{ title() }}</h2>
    @if (body()) {
      <p class="max-w-[32ch] text-body text-ink-2">{{ body() }}</p>
    }
    <div class="mt-1 empty:hidden"><ng-content /></div>
  `,
  host: { class: 'flex flex-col items-center gap-3 px-6 py-8 text-center' },
})
export class EmptyStateComponent {
  readonly icon = input.required<IconName>()
  readonly title = input.required<string>()
  readonly body = input('')
}
