/**
 * Wire shapes of the operational endpoints. The API controllers return these
 * shapes, so the Tuyau registry and these types never drift apart.
 */

export type HealthStatus = 'ok' | 'warning' | 'error'

/** Public probes expose statuses only; details go to the logs. */
export interface HealthCheckResult {
  status: HealthStatus
}

/** Body of `GET /api/health` (readiness probe). */
export interface HealthReport {
  status: HealthStatus
  version: string
  sha: string
  checks: Record<string, HealthCheckResult>
}

/** `data` of `GET /api/v1/config`: public, unauthenticated runtime config for the SPA. */
export interface PublicConfig {
  registrationOpen: boolean
  version: string
  turnstileSiteKey: string | null
  sentryDsnWeb: string | null
  /** Locale used when neither the user nor the browser picks a supported one. */
  defaultLocale: string
  /**
   * VAPID public key (URL-safe base64) the browser subscribes to Web Push
   * with; null while push is unavailable on the server.
   */
  vapidPublicKey: string | null
}
