import type { SwPush } from '@angular/service-worker'

/**
 * This browser's push subscription as SwPush sees it, or null; also null
 * when the service worker does not answer within `waitMs` (not registered
 * yet). Type-only imports: the dynamic chunk started at app start must not
 * reach the initial bundle's modules (that would split its vendor chunk).
 */
export function currentSubscription(sw: SwPush, waitMs: number): Promise<PushSubscription | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      watch.unsubscribe()
      resolve(null)
    }, waitMs)
    const watch = sw.subscription.subscribe((subscription) => {
      clearTimeout(timer)
      resolve(subscription)
      queueMicrotask(() => watch.unsubscribe())
    })
  })
}
