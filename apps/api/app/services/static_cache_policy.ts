/**
 * Cache-Control policy for the files the API serves from `public/` (the
 * Angular build in production).
 *
 * The PWA trap this guards against: if the browser or Cloudflare caches the
 * service worker, its manifest or index.html, installed apps stay pinned to
 * an old build until the user reinstalls. Those files must always revalidate;
 * content-hashed bundles, on the other hand, can be cached forever.
 */

const NO_CACHE = { 'Cache-Control': 'no-cache', 'CDN-Cache-Control': 'no-store' }
const IMMUTABLE = { 'Cache-Control': 'public, max-age=31536000, immutable' }
const SHORT_LIVED = { 'Cache-Control': 'public, max-age=3600' }

/** Files that decide which build a client runs. */
const ALWAYS_REVALIDATE = new Set([
  'index.html',
  'ngsw-worker.js',
  'ngsw.json',
  'manifest.webmanifest',
  'safety-worker.js',
  'worker-basic.min.js',
])

/** Angular's output hashing: `name-XXXXXXXX.ext` with an uppercase base32 hash. */
const CONTENT_HASH = /-[A-Z0-9]{8,}\.[a-z0-9]+$/

/**
 * Returns the caching headers for a file, given its path relative to the
 * public directory.
 */
export function cacheHeadersFor(relativePath: string): Record<string, string> {
  const path = relativePath.replaceAll('\\', '/').replace(/^\/+/, '')
  const fileName = path.split('/').at(-1) ?? path

  if (ALWAYS_REVALIDATE.has(fileName) || path.startsWith('i18n/')) {
    return { ...NO_CACHE }
  }
  if (CONTENT_HASH.test(fileName)) {
    return { ...IMMUTABLE }
  }
  return { ...SHORT_LIVED }
}
