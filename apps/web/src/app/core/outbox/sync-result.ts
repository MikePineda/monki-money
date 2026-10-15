import type { OutboxError } from '../../domain/outbox'
import { apiErrorMessage, toApiError } from '../api/http-errors'

/**
 * What one attempt to create an outbox entry on the API came to:
 * - `synced`: the API has the row (a 409 counts: it already exists);
 * - `retry`: worth trying again later with the same client id (no network,
 *   5xx, throttled, the session ended, the CSRF token went stale);
 * - `failed`: the API refused the body and would refuse it again (a 422 or
 *   another 4xx), so the entry waits for the person, with the API's message.
 */
export type SyncResult =
  | { outcome: 'synced' }
  | { outcome: 'retry'; error: OutboxError }
  | { outcome: 'failed'; error: OutboxError }

const STALE_CSRF = 'E_BAD_CSRF_TOKEN'

function retry(code: string): SyncResult {
  return { outcome: 'retry', error: { code, message: '' } }
}

function failed(code: string, message: string | null): SyncResult {
  return { outcome: 'failed', error: { code, message: message ?? '' } }
}

/** Classifies whatever a create call threw (see {@link SyncResult}). */
export function syncResult(error: unknown): SyncResult {
  const failure = toApiError(error)
  switch (failure.kind) {
    case 'offline':
      return retry('E_OFFLINE')
    case 'server':
      return retry('E_SERVER')
    case 'throttled':
      return retry('E_THROTTLED')
    case 'unauthorized':
      return retry('E_UNAUTHORIZED')
    case 'validation':
      return failed('E_VALIDATION', [...new Set(Object.values(failure.fields))].join(' '))
    case 'forbidden':
      return failure.code === STALE_CSRF
        ? retry(STALE_CSRF)
        : failed(failure.code ?? 'E_FORBIDDEN', apiErrorMessage(error))
    case 'http':
      return failure.status === 409
        ? { outcome: 'synced' }
        : failed(failure.code ?? `E_HTTP_${failure.status}`, apiErrorMessage(error))
  }
}
