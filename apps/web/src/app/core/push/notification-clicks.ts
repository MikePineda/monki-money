import type { Router } from '@angular/router'
import type { SwPush } from '@angular/service-worker'
import { notificationUrl } from '../../domain/push'

/**
 * Routes a tapped notification to its page (`data.url`, a path of the app)
 * in the running app. The service worker has already focused the app, or
 * opened it at that URL when none was open (ngsw `focusLastFocusedOrOpen`);
 * any other URL is ignored. Started once from app start through a dynamic
 * import, with the app's own SwPush and Router: it imports neither, so the
 * initial bundle does not change shape for it.
 */
export function followNotificationClicks(sw: SwPush, router: Router): void {
  if (!sw.isEnabled) {
    return
  }
  sw.notificationClicks.subscribe(({ notification }) => {
    const url = notificationUrl(notification)
    if (url) {
      void router.navigateByUrl(url)
    }
  })
}
