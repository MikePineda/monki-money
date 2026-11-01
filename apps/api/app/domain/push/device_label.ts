/**
 * A push device's name in Settings ("Safari on iPhone"), read from the user
 * agent it subscribed with. Product names only (never translated); the web
 * puts them in a sentence of the reader's language. Pure, best effort: what
 * it cannot tell is null.
 */
export interface DeviceLabel {
  browser: string | null
  platform: string | null
}

/** First match wins: browsers built on Chrome say "Chrome" too, so they go first. */
const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(OPR|OPT|Opera)\//, 'Opera'],
  [/\b(Firefox|FxiOS)\//, 'Firefox'],
  [/\b(Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
  // The installed app on iPhone and iPad (Home Screen) drops the Safari token.
  [/\b(iPhone|iPad)\b.*\bAppleWebKit\//, 'Safari'],
]

/** iPhone and iPad before macOS ("like Mac OS X"), Android before Linux, ChromeOS before Linux. */
const PLATFORMS: readonly [RegExp, string][] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

function firstMatch(userAgent: string, table: readonly [RegExp, string][]): string | null {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
}

export function deviceLabel(userAgent: string | null): DeviceLabel {
  if (!userAgent) return { browser: null, platform: null }
  return { browser: firstMatch(userAgent, BROWSERS), platform: firstMatch(userAgent, PLATFORMS) }
}
