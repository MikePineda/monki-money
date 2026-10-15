/**
 * Every API route lives under this prefix. Anything else is a client-side
 * route of the SPA and must fall back to `index.html`.
 */
export const API_PREFIX = '/api'

/**
 * Tells whether a request path belongs to the API (and therefore must never
 * be answered with the SPA shell).
 */
export function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)
}
