/**
 * Web Push helpers with no browser API in them: comparing a subscription's
 * application server key with the one the API serves (a rotated key means
 * subscribing again) and reading where a tapped notification leads.
 */

/** Bytes of a URL-safe base64 string (with or without padding). */
export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/** Whether a subscription's `options.applicationServerKey` is the served VAPID key. */
export function sameServerKey(applicationServerKey: ArrayBuffer | null, served: string): boolean {
  if (!applicationServerKey) {
    return false
  }
  const actual = new Uint8Array(applicationServerKey)
  const expected = base64UrlToBytes(served)
  return (
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  )
}

/** A path of this app ('/x'), never another origin ('//host', 'https://...', '/\host'). */
export function isAppPath(url: string): boolean {
  return /^\/(?![/\\])/.test(url)
}

/** Where a tapped notification leads (`data.url`, set by the API), or null. */
export function notificationUrl(notification: { data?: unknown }): string | null {
  const data = notification.data
  if (typeof data !== 'object' || data === null || !('url' in data)) {
    return null
  }
  const { url } = data as { url: unknown }
  return typeof url === 'string' && isAppPath(url) ? url : null
}
