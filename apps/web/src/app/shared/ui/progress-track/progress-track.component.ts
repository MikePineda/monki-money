import { Component, computed, input } from '@angular/core'

export type ProgressVariant = 'task' | 'meter'

/**
 * Progress (DESIGN.md, Progress):
 * - task (CSV upload): ink fill on a 4px sunken track; `value = null` is
 *   indeterminate (a sliding segment, static under reduced motion);
 * - meter (budgets, later): mark-neutral fill, status-serious past 90% and
 *   status-critical past 100% (the caller adds the icon and the words);
 * - steps (onboarding): `steps` segments with the first `current` filled.
 */
@Component({
  selector: 'app-progress-track',
  template: `
    @if (steps() > 0) {
      <div class="grid gap-1" [class]="stepGridClass()">
        @for (step of stepList(); track step) {
          <span
            class="h-1 rounded-full"
            [class]="step < current() ? 'bg-ink-1' : 'bg-surface-2'"
            [attr.data-done]="step < current()"
          ></span>
        }
      </div>
    } @else {
      <div class="relative h-1 overflow-hidden rounded-full bg-surface-2">
        @if (value() === null) {
          <span
            class="absolute inset-y-0 left-0 w-[30%] animate-indeterminate rounded-full bg-ink-1"
          ></span>
        } @else {
          <span
            class="block h-full rounded-full"
            [class]="fillClass()"
            [style.width.%]="percent()"
          ></span>
        }
      </div>
    }
  `,
  host: {
    'class': 'block',
    'role': 'progressbar',
    '[attr.aria-label]': 'label()',
    'aria-valuemin': '0',
    '[attr.aria-valuemax]': 'steps() > 0 ? steps() : 100',
    '[attr.aria-valuenow]': 'valueNow()',
  },
})
export class ProgressTrackComponent {
  /** 0..1 (a meter may pass 1); null = indeterminate. */
  readonly value = input<number | null>(0)
  readonly variant = input<ProgressVariant>('task')
  readonly label = input.required<string>()
  readonly steps = input(0)
  readonly current = input(0)

  protected readonly percent = computed(() => Math.min(Math.max(this.value() ?? 0, 0), 1) * 100)

  protected readonly valueNow = computed(() => {
    if (this.steps() > 0) {
      return this.current()
    }
    const value = this.value()
    return value === null ? null : Math.round(value * 100)
  })

  protected readonly fillClass = computed(() => {
    if (this.variant() === 'task') {
      return 'bg-ink-1'
    }
    const value = this.value() ?? 0
    if (value > 1) {
      return 'bg-status-critical'
    }
    return value > 0.9 ? 'bg-status-serious' : 'bg-mark-neutral'
  })

  protected readonly stepList = computed(() => Array.from({ length: this.steps() }, (_, i) => i))

  protected readonly stepGridClass = computed(() => {
    const columns: Record<number, string> = {
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
      5: 'grid-cols-5',
      6: 'grid-cols-6',
    }
    return columns[this.steps()] ?? 'grid-flow-col auto-cols-fr'
  })
}
