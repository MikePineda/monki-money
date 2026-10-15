import env from '#start/env'

/**
 * Absolute URL of a SPA route, built from APP_URL (domains never live in
 * code). Used for the links inside emails.
 */
export function appUrl(path: string, query: Record<string, string> = {}): string {
  const url = new URL(path, env.get('APP_URL'))
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return url.toString()
}
