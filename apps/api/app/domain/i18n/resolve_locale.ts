export interface LocaleCandidates {
  /** `users.locale` of the logged-in user, if any. */
  userLocale?: string | null
  /** Best supported match of the Accept-Language header, if any. */
  browserLocale?: string | null
  /** `households.locale` of the user's current household, if any. */
  householdLocale?: string | null
  /** APP_DEFAULT_LOCALE (en unless configured). */
  defaultLocale: string
  supported: readonly string[]
}

/**
 * Locale of a request: user preference -> browser -> household -> app
 * default. Unsupported values are skipped.
 */
export function resolveLocale(candidates: LocaleCandidates): string {
  const ordered = [candidates.userLocale, candidates.browserLocale, candidates.householdLocale]
  return (
    ordered.find((locale): locale is string => !!locale && candidates.supported.includes(locale)) ??
    candidates.defaultLocale
  )
}
