import type { BrowserContext } from '@playwright/test'

/**
 * Cloudflare Turnstile in E2E. `e2e.env` sets a site key, so every login,
 * sign-up and forgot-password form renders the widget and waits for its
 * token; the API secret stays empty, so the API never asks Cloudflare.
 *
 * The real script cannot load here: every browser request carries the
 * per-test `CF-Connecting-IP` header (rate-limit isolation, see
 * fixtures.ts) and Cloudflare's edge answers 403 to any request that sends
 * it (Chromium then blocks the script as ORB). Stripping the header works
 * in Chromium only (WebKit re-adds it on the script's redirect). So the
 * suite serves this stand-in for `api.js`: the same explicit-render API the
 * app uses, behaving like Cloudflare's always-pass test key (a dummy token
 * shortly after rendering, a fresh one after `reset`). No network, no
 * flakiness from a third party in CI.
 */
export const TURNSTILE_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

const STAND_IN = `(() => {
  const widgets = new Map()
  let count = 0
  const solve = (id) =>
    setTimeout(() => {
      const widget = widgets.get(id)
      if (widget) widget.callback(${JSON.stringify(TURNSTILE_DUMMY_TOKEN)})
    }, 100)
  window.turnstile = {
    render(host, options) {
      count += 1
      const id = 'e2e-widget-' + count
      host.dataset.turnstile = 'e2e'
      widgets.set(id, options)
      solve(id)
      return id
    },
    reset(id) {
      solve(id)
    },
    remove(id) {
      widgets.delete(id)
    },
  }
})()`

/** Serves the stand-in for Cloudflare's script and refuses anything else from Cloudflare. */
export async function stubTurnstile(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/challenges\.cloudflare\.com\//, (route) => {
    if (new URL(route.request().url()).pathname === '/turnstile/v0/api.js') {
      return route.fulfill({ contentType: 'application/javascript', body: STAND_IN })
    }
    return route.abort()
  })
}
