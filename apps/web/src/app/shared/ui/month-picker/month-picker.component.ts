import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core'
import {
  addMonths,
  compareYearMonth,
  label as monthLabel,
  monthRange,
  yearOf,
  type YearMonth,
} from '../../../domain/month'
import { APP_LOCALE } from '../app-locale.token'

/**
 * Horizontal month strip (DESIGN.md, Month picker), swipeable with native
 * scrolling. The selected month wears the accent wash and is kept centred
 * (or at the right edge when it is the latest); the year shows when it is
 * not the current year. Future months are visible but not selectable.
 * Tapping the selected month again asks for the year grid (`yearGrid`).
 */
@Component({
  selector: 'app-month-picker',
  template: `
    <nav [attr.aria-label]="label()">
      <div
        #strip
        class="flex h-11 snap-x items-center gap-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] motion-safe:scroll-smooth"
      >
        @for (month of months(); track month) {
          <button
            type="button"
            class="h-9 min-w-11 shrink-0 snap-center rounded-md px-2.5 text-label whitespace-nowrap transition-colors"
            [class]="classesFor(month)"
            [attr.data-month]="month"
            [attr.aria-current]="month === selected() ? 'date' : null"
            [disabled]="isFuture(month)"
            (click)="pick(month)"
          >
            {{ textFor(month) }}
          </button>
        }
      </div>
    </nav>
  `,
  host: { class: 'block min-w-0' },
})
export class MonthPickerComponent {
  private readonly locale = inject(APP_LOCALE)

  readonly selected = model.required<YearMonth>()
  /** The current month in the household time zone; later months are future. */
  readonly current = input.required<YearMonth>()
  readonly label = input.required<string>()
  /** How many months before the current one the strip offers. */
  readonly past = input(12)
  /** Future months shown (disabled) after the current one. */
  readonly future = input(2)
  readonly yearGrid = output<void>()

  private readonly strip = viewChild.required<ElementRef<HTMLElement>>('strip')

  protected readonly months = computed(() =>
    monthRange(addMonths(this.current(), -this.past()), addMonths(this.current(), this.future()))
  )

  constructor() {
    // Keep the selected month in view whenever it (or the strip) changes.
    afterRenderEffect(() => {
      const selected = this.selected()
      const strip = this.strip().nativeElement
      const button = strip.querySelector<HTMLElement>(`[data-month="${selected}"]`)
      if (button) {
        strip.scrollLeft = button.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2
      }
    })
  }

  protected isFuture(month: YearMonth): boolean {
    return compareYearMonth(month, this.current()) > 0
  }

  protected textFor(month: YearMonth): string {
    const withYear = month === this.selected() && yearOf(month) !== yearOf(this.current())
    return monthLabel(month, this.locale(), { withYear })
  }

  protected classesFor(month: YearMonth): string {
    if (month === this.selected()) {
      return 'bg-accent-soft font-semibold text-accent'
    }
    return this.isFuture(month) ? 'text-ink-3' : 'text-ink-2 active:bg-surface-2'
  }

  protected pick(month: YearMonth): void {
    if (month === this.selected()) {
      this.yearGrid.emit()
      return
    }
    this.selected.set(month)
  }
}
