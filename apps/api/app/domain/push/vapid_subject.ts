/**
 * The VAPID `sub` claim: how a push service reaches the sender. Push
 * services take an https: URL or a mailto: address only (Apple rejects
 * anything else), so with no VAPID_SUBJECT the app's own https URL is used,
 * and a plain-http development URL becomes a mailto on its host.
 */
export function vapidSubject(configured: string | undefined, appUrl: string): string {
  if (configured) return configured
  const url = new URL(appUrl)
  if (url.protocol === 'https:') return url.origin
  return `mailto:webpush@${url.hostname}`
}
