import { Component, computed, input, model } from '@angular/core'

export interface SegmentOption<T> {
  value: T
  label: string
}

/**
 * Two to four equal options on a sunken track (DESIGN.md, Segmented control).
 * The selected option sits on a raised thumb that slides 150 ms, in accent
 * text at weight 600. A radio group: arrow keys move the selection, only the
 * selected option is in the tab order.
 */
@Component({
  selector: 'app-segmented-control',
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="label()"
      class="relative grid h-11 grid-flow-col auto-cols-fr gap-1 rounded-md bg-surface-2 p-1"
    >
      @if (selectedIndex() >= 0) {
        <span aria-hidden="true" class="thumb rounded-sm border border-line bg-surface-1"></span>
      }
      @for (option of options(); track $index; let i = $index) {
        <button
          type="button"
          role="radio"
          class="relative z-10 truncate rounded-sm px-2 text-label"
          [class]="i === selectedIndex() ? 'font-semibold text-accent' : 'text-ink-2'"
          [attr.aria-checked]="i === selectedIndex()"
          [attr.tabindex]="i === focusIndex() ? 0 : -1"
          [attr.data-index]="i"
          (click)="select(i)"
          (keydown)="onKeydown($event)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styleUrl: './segmented-control.component.scss',
  host: {
    'class': 'block',
    '[style.--seg-count]': 'options().length',
    '[style.--seg-index]': 'selectedIndex()',
  },
})
export class SegmentedControlComponent<T> {
  readonly options = input.required<readonly SegmentOption<T>[]>()
  readonly value = model.required<T>()
  /** Accessible name of the group, for example "Transaction type". */
  readonly label = input.required<string>()

  protected readonly selectedIndex = computed(() =>
    this.options().findIndex((option) => Object.is(option.value, this.value()))
  )
  protected readonly focusIndex = computed(() => Math.max(this.selectedIndex(), 0))

  protected select(index: number): void {
    const option = this.options()[index]
    if (option) {
      this.value.set(option.value)
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    }
    const step = steps[event.key]
    if (step === undefined || count === 0) {
      return
    }
    event.preventDefault()
    const next = (this.focusIndex() + step + count) % count
    this.select(next)
    const group = (event.currentTarget as HTMLElement).parentElement
    group?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus()
  }
}
