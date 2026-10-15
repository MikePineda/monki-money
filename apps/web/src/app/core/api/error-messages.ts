import { marker } from '@jsverse/transloco-keys-manager/marker'
import type { ApiError } from './http-errors'

/** A translatable message: a global catalogue key and its ICU parameters. */
export interface Message {
  key: string
  params?: Record<string, string | number>
}

/** Minutes to show for a throttle (Retry-After rounded up; one minute when unknown). */
export function retryMinutes(retryAfterSeconds: number | null): number {
  return Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60))
}

/**
 * The generic wording for a failure that has no screen-specific message:
 * no connection, too many attempts, or "something went wrong". Field errors
 * (422) never come here: they go under their inputs.
 */
export function failureMessage(error: ApiError): Message {
  switch (error.kind) {
    case 'offline':
      return { key: marker('errors.offline') }
    case 'throttled':
      return {
        key: marker('errors.throttled'),
        params: { minutes: retryMinutes(error.retryAfterSeconds) },
      }
    default:
      return { key: marker('errors.server') }
  }
}
