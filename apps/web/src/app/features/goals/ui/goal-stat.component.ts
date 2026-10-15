import { Component, input } from '@angular/core'

/**
 * A stat tile with a value already worded (DESIGN.md, Stat tile): "8 months",
 * "June 2027", "$500". Caption label, the value in `title` with proportional
 * figures, and an optional
 * caption under it ("From your last 3 months"). In a two-column grid the
 * second tile of a row gets the hairline between them, never boxes.
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
  host: {
    class: 'flex min-w-0 flex-col gap-1 odd:pr-3 even:border-l even:border-line even:pl-3',
  },
})
export class GoalStatComponent {
  readonly label = input.required<string>()
  readonly value = input.required<string>()
  readonly detail = input('')
}
