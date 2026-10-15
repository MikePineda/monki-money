/**
 * IANA time zones for the household settings. Pure: no Angular (Intl is
 * part of the language).
 */

/** The API's default for a new household. */
export const DEFAULT_TIME_ZONE = 'Australia/Brisbane'

/** Every zone this runtime knows (the API accepts the same IANA names). */
export function supportedTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

/** The device's zone when it is a known one, else the fallback. */
export function deviceTimeZone(fallback: string = DEFAULT_TIME_ZONE): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return supportedTimeZones().includes(zone) ? zone : fallback
}
