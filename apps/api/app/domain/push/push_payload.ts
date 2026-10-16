/**
 * What a push notification says and where a tap leads. Payloads carry no
 * amounts, merchants or names: a lock screen is public.
 */
export interface PushPayload {
  title: string
  body: string
  /** A path inside the app ('/month/2026-09'); a tap opens it. */
  url: string
  /** Same tag = the newer notification replaces the older one on the device. */
  tag: string
}

/** App icons served from the SPA's `public/icons`. */
const ICON = '/icons/icon-192.png'
const BADGE = '/icons/icon-maskable-192.png'

/** A path of this app ('/x'), never another origin ('//host', 'https://...', '/\host'). */
export function isAppPath(url: string): boolean {
  return /^\/(?![/\\])/.test(url)
}

/**
 * The JSON the Angular service worker (ngsw) turns into a notification: it
 * only shows messages with a `notification` object. On a tap it focuses the
 * open app, which routes to `data.url` itself (SwPush.notificationClicks),
 * or opens the app at `url` when none is open.
 */
export function angularPushMessage(payload: PushPayload) {
  if (!isAppPath(payload.url)) throw new RangeError(`Not a path of the app: ${payload.url}`)
  return {
    notification: {
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      icon: ICON,
      badge: BADGE,
      data: {
        url: payload.url,
        onActionClick: {
          default: { operation: 'focusLastFocusedOrOpen', url: payload.url },
        },
      },
    },
  }
}
