import type { Page } from '@playwright/test'

interface InFlight {
  __e2eApiInFlight?: number
}

/**
 * Counts, inside the page, the app's API calls still waiting for their
 * answer. The app talks to the API with fetch, so wrapping it sees every
 * call, whether or not the service worker answers it. Install it before the
 * first navigation: it runs ahead of the app on every document of the page.
 */
export async function countApiRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = window as InFlight
    state.__e2eApiInFlight = 0
    const send = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!new URL(target, window.location.href).pathname.startsWith('/api/')) {
        return send(input, init)
      }
      state.__e2eApiInFlight = (state.__e2eApiInFlight ?? 0) + 1
      try {
        return await send(input, init)
      } finally {
        state.__e2eApiInFlight = (state.__e2eApiInFlight ?? 1) - 1
      }
    }
  })
}

/**
 * Resolves once every API call the page has started is answered (fetch
 * settles after the response headers, so their cookies are stored by then).
 * Needs {@link countApiRequests}.
 */
export async function apiRequestsSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as InFlight).__e2eApiInFlight === 0)
}
