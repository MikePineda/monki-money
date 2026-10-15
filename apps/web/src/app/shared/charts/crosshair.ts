import { signal } from '@angular/core'
import { nearestIndex } from '../../domain/charts/line'

/** Pointer and keyboard events after the harness or the browser fills them in. */
type PointerLike = Pick<PointerEvent, 'clientX' | 'pointerType' | 'currentTarget'>
type KeyLike = Pick<KeyboardEvent, 'key' | 'preventDefault'>

const STEPS: Record<string, (index: number, last: number) => number> = {
  ArrowLeft: (index) => index - 1,
  ArrowRight: (index) => index + 1,
  Home: () => 0,
  End: (_, last) => last,
}

/**
 * The line charts' hover layer (dataviz, Interaction): a crosshair that
 * snaps to the nearest x wherever the pointer is in the plot, so readers aim
 * at a month and never at a 2px line. Keyboard focus shows the same readout:
 * it starts on the latest month, arrows walk the months, Escape clears.
 * A touch keeps its readout after the finger lifts (tap to read); a mouse
 * clears it on leaving.
 */
export class Crosshair {
  private readonly _active = signal<number | null>(null)
  readonly active = this._active.asReadonly()

  constructor(private readonly xs: () => readonly number[]) {}

  point(event: PointerLike): void {
    const target = event.currentTarget as Element | null
    const left = target?.getBoundingClientRect().left ?? 0
    const index = nearestIndex(this.xs(), event.clientX - left)
    this._active.set(index < 0 ? null : index)
  }

  leave(event: Pick<PointerEvent, 'pointerType'>): void {
    if (event.pointerType !== 'touch') {
      this._active.set(null)
    }
  }

  focus(): void {
    const count = this.xs().length
    if (this._active() === null && count > 0) {
      this._active.set(count - 1)
    }
  }

  clear(): void {
    this._active.set(null)
  }

  key(event: KeyLike): void {
    const last = this.xs().length - 1
    if (event.key === 'Escape') {
      this.clear()
      return
    }
    const step = STEPS[event.key]
    if (!step || last < 0) {
      return
    }
    event.preventDefault()
    const from = this._active() ?? last
    this._active.set(Math.min(last, Math.max(0, step(from, last))))
  }
}
