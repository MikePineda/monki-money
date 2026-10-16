import { isTuyauError, type TuyauLikeError } from './tuyau-error'

export { isTuyauError, type TuyauLikeError } from './tuyau-error'

/**
 * What the UI needs to know about a failed API call. Screens switch on
 * `kind`: field errors under inputs, a redirect to login, a "no connection"
 * banner with retry, a throttle message, or a generic message. `code` is the
 * API's error code (`E_INVITATION_EXPIRED`, `E_ALREADY_IN_HOUSEHOLD`...) when
 * the body carries one.
 */
export type ApiError =
  | { kind: 'validation'; status: 422; fields: Record<string, string> }
  | { kind: 'unauthorized'; status: 401 }
  | { kind: 'forbidden'; status: 403; code: string | null }
  | { kind: 'throttled'; status: 429; retryAfterSeconds: number | null }
  | { kind: 'http'; status: number; code: string | null }
  | { kind: 'offline' }
  | { kind: 'server'; status?: number }

/** The API's 422 body: `{ errors: [{ field, rule, message }] }` (localized messages). */
interface ValidationBody {
  errors: { field: string; message: string }[]
}

function isValidationBody(body: unknown): body is ValidationBody {
  if (typeof body !== 'object' || body === null || !('errors' in body)) {
    return false
  }
  const { errors } = body as { errors: unknown }
  return (
    Array.isArray(errors) &&
    errors.every(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { field?: unknown }).field === 'string' &&
        typeof (item as { message?: unknown }).message === 'string'
    )
  )
}

function fieldMessages(body: unknown): Record<string, string> {
  if (!isValidationBody(body)) {
    return {}
  }
  const fields: Record<string, string> = {}
  for (const { field, message } of body.errors) {
    fields[field] ??= message
  }
  return fields
}

/** `{ message, code }` bodies carry the API's error code. */
function errorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('code' in body)) {
    return null
  }
  const { code } = body as { code: unknown }
  return typeof code === 'string' ? code : null
}

function retryAfterSeconds(error: TuyauLikeError): number | null {
  const header = error.rawResponse?.headers?.get('Retry-After')
  if (!header) {
    return null
  }
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

/** Maps anything a Tuyau call can throw (or return from `.safe()`) to an {@link ApiError}. */
export function toApiError(error: unknown): ApiError {
  if (isTuyauError(error)) {
    if (error.kind === 'network') {
      return { kind: 'offline' }
    }
    const status = error.status
    if (status === 422) {
      return { kind: 'validation', status: 422, fields: fieldMessages(error.response) }
    }
    if (status === 401) {
      return { kind: 'unauthorized', status: 401 }
    }
    if (status === 403) {
      return { kind: 'forbidden', status: 403, code: errorCode(error.response) }
    }
    if (status === 429) {
      return { kind: 'throttled', status: 429, retryAfterSeconds: retryAfterSeconds(error) }
    }
    if (status !== undefined && status >= 400 && status < 500) {
      return { kind: 'http', status, code: errorCode(error.response) }
    }
    return { kind: 'server', status }
  }
  // fetch rejects with a TypeError when there is no network at all.
  if (error instanceof TypeError) {
    return { kind: 'offline' }
  }
  return { kind: 'server' }
}

/** The `message` of an API error body (`{ message, code }`), when the call got an answer with one. */
export function apiErrorMessage(error: unknown): string | null {
  if (!isTuyauError(error) || error.kind !== 'http') {
    return null
  }
  const body = error.response
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return null
  }
  const { message } = body as { message: unknown }
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : null
}

/** True for a non-2xx answer with this status (a 404 for an unknown invitation, a 409...). */
export function hasStatus(error: ApiError, status: number): boolean {
  return 'status' in error && error.status === status
}

/**
 * The JSON body of a failed call, for the extras some errors carry next to
 * `message` and `code` (`rowIds`, `accountNumbers`, `batchId`...). Empty
 * when there is no body (network failures) or it is not an object.
 */
export function errorPayload(error: unknown): Record<string, unknown> {
  if (!isTuyauError(error) || typeof error.response !== 'object' || error.response === null) {
    return {}
  }
  return error.response as Record<string, unknown>
}
