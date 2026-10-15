import { DestroyRef, Directive, ElementRef, inject, output } from '@angular/core'

/** How long a finger must rest on the element. */
export const LONG_PRESS_MS = 500
/** Moving further than this (px) means scrolling, not holding. */
const MOVE_TOLERANCE = 10

/**
 * Long-press on touch and mouse (DESIGN.md, List row: long-press opens the
 * action sheet). The click that ends a long press is swallowed so the row
 * does not also open. The context-menu gesture (right click, the keyboard's
 * menu key, Android's own long-press) fires it too, which keeps the actions
 * reachable without a pointer.
 */
@Directive({
  selector: '[appLongPress]',
  host: {
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'cancel()',
    '(pointerleave)': 'cancel()',
    '(pointercancel)': 'cancel()',
    '(contextmenu)': 'onContextMenu($event)',
    'style': '-webkit-touch-callout: none',
  },
})
export class LongPressDirective {
  readonly appLongPress = output<void>()

  private timer: ReturnType<typeof setTimeout> | undefined
  private origin: { x: number; y: number } | null = null
  private suppressClick = false

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
    // Capture phase: runs before any (click) bound on the same element.
    element.addEventListener(
      'click',
      (event) => {
        if (this.suppressClick) {
          this.suppressClick = false
          event.preventDefault()
          event.stopImmediatePropagation()
        }
      },
      { capture: true }
    )
    inject(DestroyRef).onDestroy(() => this.cancel())
  }

  protected start(event: MouseEvent): void {
    this.cancel()
    this.suppressClick = false
    this.origin = { x: event.clientX, y: event.clientY }
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.suppressClick = true
      this.appLongPress.emit()
    }, LONG_PRESS_MS)
  }

  protected move(event: MouseEvent): void {
    if (!this.origin || this.timer === undefined) {
      return
    }
    const distance = Math.hypot(event.clientX - this.origin.x, event.clientY - this.origin.y)
    if (distance > MOVE_TOLERANCE) {
      this.cancel()
    }
  }

  protected cancel(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.origin = null
  }

  protected onContextMenu(event: Event): void {
    event.preventDefault()
    // A touch long-press may already have fired through the timer.
    if (this.suppressClick) {
      return
    }
    this.cancel()
    this.appLongPress.emit()
  }
}
