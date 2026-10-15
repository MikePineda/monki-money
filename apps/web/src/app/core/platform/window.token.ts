import { DOCUMENT, InjectionToken, inject } from '@angular/core'

/**
 * The browser window, injected so stores and services can be tested with a
 * fake (matchMedia, localStorage, navigator and events are all reached
 * through it).
 */
export const WINDOW = new InjectionToken<Window>('WINDOW', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView
    if (!view) {
      throw new Error('monkimoney runs in a browser window only')
    }
    return view
  },
})

/** Reloads the page. A token so tests can observe it (jsdom cannot reload). */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const view = inject(WINDOW)
    return () => view.location.reload()
  },
})
