import { InjectionToken } from '@angular/core'

/**
 * The household's IANA time zone, which decides what "today" and "this
 * month" mean. Until the session package provides the household's setting,
 * it falls back to the device's zone.
 */
export const HOUSEHOLD_TIME_ZONE = new InjectionToken<() => string>('HOUSEHOLD_TIME_ZONE', {
  providedIn: 'root',
  factory: () => () => Intl.DateTimeFormat().resolvedOptions().timeZone,
})
