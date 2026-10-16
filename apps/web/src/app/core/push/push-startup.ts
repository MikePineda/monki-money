import type { Router } from '@angular/router'
import type { SwPush } from '@angular/service-worker'
import { notificationUrl } from '../../domain/push'
import type { SessionStore } from '../auth/session.store'
import { currentSubscription } from './push-device'

/** The app's own services, resolved by app.config (they are in the initial bundle anyway). */
export interface PushStartup {
  sw: SwPush
  router: Router
  session: SessionStore
}

/** How long a logout waits for the service worker to say whether this browser is subscribed. */
const LOGOUT_WAIT_MS = 2_000

/**
 * Web Push wiring at app start, loaded through a dynamic import. It imports
 * types only (plus the pure domain/push): a value import of an Angular
 * package or of an app service would make this chunk share part of the
 * initial vendor chunk and split it (about 2 kB more to load at start).
 *
 * - A tapped notification routes the running app to its page (`data.url`,
 *   a path of the app; anything else is ignored). The service worker has
 *   already focused the app, or opened it at that URL when none was open
 *   (ngsw `focusLastFocusedOrOpen`).
 * - An explicit logout unsubscribes this browser first (best effort), so on
 *   a shared phone the next person never gets the previous one's
 *   notifications; the push service then answers 410 and the API deletes
 *   that subscription on its next send.
 */
export function startPush({ sw, router, session }: PushStartup): void {
  if (!sw.isEnabled) {
    return
  }
  sw.notificationClicks.subscribe(({ notification }) => {
    const url = notificationUrl(notification)
    if (url) {
      void router.navigateByUrl(url)
    }
  })
  session.beforeLogout(async () => {
    if ((await currentSubscription(sw, LOGOUT_WAIT_MS)) !== null) {
      await sw.unsubscribe()
    }
  })
}
