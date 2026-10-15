import { DestroyRef, ElementRef, afterNextRender, inject, signal, type Signal } from '@angular/core'

/** Width used before the first measurement and where layout is unavailable (tests). */
export const FALLBACK_CHART_WIDTH = 320

/**
 * The rendered width of the host element in whole pixels, kept current
 * with a ResizeObserver, so SVG charts draw at their real size (text is
 * never scaled by a viewBox). Without ResizeObserver or layout (jsdom) it
 * stays at the fallback, which keeps component specs deterministic.
 */
export function injectHostWidth(fallback = FALLBACK_CHART_WIDTH): Signal<number> {
  const host = inject<ElementRef<HTMLElement>>(ElementRef)
  const destroyRef = inject(DestroyRef)
  const width = signal(fallback)

  afterNextRender(() => {
    const element = host.nativeElement
    const read = () => {
      const measured = Math.round(element.clientWidth)
      if (measured > 0) {
        width.set(measured)
      }
    }
    read()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(read)
    observer.observe(element)
    destroyRef.onDestroy(() => observer.disconnect())
  })

  return width.asReadonly()
}
