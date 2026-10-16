/**
 * What a browser's push subscription may look like before the API stores
 * it and, later, posts to its endpoint from the scheduler. Pure.
 */

/**
 * The push services the API sends to: an exact host, or a suffix starting
 * with a dot (any subdomain). Endpoints elsewhere are refused at the door
 * (422) and never contacted, so a subscription can neither point the server
 * at an internal address nor at a slow host of someone's choosing. To
 * support another push service, add its host here (and to the runbook).
 */
export const PUSH_SERVICE_HOSTS = [
  // Chrome, Edge on Android, every Chromium browser
  'fcm.googleapis.com',
  // Firefox
  '.push.services.mozilla.com',
  // Safari on macOS, iOS and iPadOS (web.push.apple.com)
  '.push.apple.com',
  // Edge on Windows (Windows Push Notification Services)
  '.notify.windows.com',
] as const

/** Bytes of an uncompressed P-256 public key (`keys.p256dh`), which starts with 0x04. */
export const P256DH_BYTES = 65

/** Bytes of the authentication secret (`keys.auth`). */
export const AUTH_SECRET_BYTES = 16

function isAllowedHost(host: string): boolean {
  return PUSH_SERVICE_HOSTS.some((allowed) =>
    allowed.startsWith('.')
      ? host.endsWith(allowed) && host.length > allowed.length
      : host === allowed
  )
}

/** An IPv4 or IPv6 literal (URL hostnames keep IPv6 in brackets). */
function isIpLiteral(host: string): boolean {
  return host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)
}

/**
 * An https URL on an allowed push service host, on the default port, with no
 * credentials and no IP literal.
 */
export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return !isIpLiteral(host) && isAllowedHost(host)
}

/** Bytes of URL-safe base64 (padding allowed), or null when it is not base64url. */
function base64UrlBytes(value: string): Buffer | null {
  if (!/^[\w-]+={0,2}$/.test(value)) return null
  return Buffer.from(value.replace(/=+$/, ''), 'base64url')
}

/** `keys.p256dh`: an uncompressed P-256 point, 65 bytes starting with 0x04. */
export function isP256dhKey(value: string): boolean {
  const bytes = base64UrlBytes(value)
  return bytes !== null && bytes.length === P256DH_BYTES && bytes[0] === 0x04
}

/** `keys.auth`: a 16-byte secret. */
export function isAuthSecret(value: string): boolean {
  const bytes = base64UrlBytes(value)
  return bytes !== null && bytes.length === AUTH_SECRET_BYTES
}
