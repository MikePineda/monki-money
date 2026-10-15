import { TuyauError } from '@tuyau/core/client'

/**
 * What the UI needs to know about a failed API call. Screens switch on
 * `kind`: field errors under inputs, a redirect to login, a "no connection"
 * banner with retry, or a generic message.
 */
export type ApiError =
  | { kind: 'validation'; status: 422; fields: Record<string, string> }
  | { kind: 'unauthorized'; status: 401 }
  | { kind: 'forbidden'; status: 403 }
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

/** Maps anything a Tuyau call can throw (or return from `.safe()`) to an {@link ApiError}. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof TuyauError) {
    if (error.kind === 'network') {
      return { kind: 'offline' }
    }
    switch (error.status) {
      case 422:
        return { kind: 'validation', status: 422, fields: fieldMessages(error.response) }
      case 401:
        return { kind: 'unauthorized', status: 401 }
      case 403:
        return { kind: 'forbidden', status: 403 }
      default:
        return { kind: 'server', status: error.status }
    }
  }
  // fetch rejects with a TypeError when there is no network at all.
  if (error instanceof TypeError) {
    return { kind: 'offline' }
  }
  return { kind: 'server' }
}
