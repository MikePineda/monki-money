import { Component, input } from '@angular/core'

/**
 * A stat tile whose value is not money (DESIGN.md, Stat tile): caption
 * label, the value in `title` with proportional figures, and an optional
 * caption under it ("From your last 3 months"). Tiles in a row get a
 * hairline between them from the row's `divide-x`, never boxes.
 */
@Component({
  selector: 'app-goal-stat',
  template: `
    <span class="text-caption text-ink-2">{{ label() }}</span>
    <span
      class="truncate text-title pnum tracking-[-0.02em] text-ink-1"
      data-testid="goals.stat.value"
      >{{ value() }}</span
    >
    @if (detail()) {
      <span class="text-caption text-ink-3">{{ detail() }}</span>
    }
  `,
  host: { class: 'flex min-w-0 flex-col gap-1 px-3 first:pl-0 last:pr-0' },
})
export class GoalStatComponent {
  readonly label = input.required<string>()
  readonly value = input.required<string>()
  readonly detail = input('')
}
