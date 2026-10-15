import { TuyauHTTPError, TuyauNetworkError } from '@tuyau/core/client'
import { errorPayload, toApiError } from './http-errors'

/** Builds the error Tuyau throws for a non-2xx response (it wraps a Ky HTTPError). */
function httpError(status: number, body: unknown, headers: Record<string, string> = {}) {
  const kyError = {
    response: { status, headers: new Headers(headers) },
    request: { url: 'http://localhost/api/v1/thing', method: 'POST' },
    options: { prefixUrl: 'http://localhost' },
  }
  return new TuyauHTTPError(kyError as never, body)
}

describe('toApiError', () => {
  it('test_422_maps_to_validation_with_the_first_message_per_field', () => {
    const error = httpError(422, {
      errors: [
        { field: 'email', rule: 'email', message: 'Enter a valid email' },
        { field: 'email', rule: 'required', message: 'Second message' },
        { field: 'password', rule: 'minLength', message: 'Too short' },
      ],
    })

    expect(toApiError(error)).toEqual({
      kind: 'validation',
      status: 422,
      fields: { email: 'Enter a valid email', password: 'Too short' },
    })
  })

  it('test_422_without_a_known_body_still_maps_to_validation', () => {
    expect(toApiError(httpError(422, { message: 'nope' }))).toEqual({
      kind: 'validation',
      status: 422,
      fields: {},
    })
  })

  it('test_401_maps_to_unauthorized', () => {
    expect(toApiError(httpError(401, {}))).toEqual({ kind: 'unauthorized', status: 401 })
  })

  it('test_403_maps_to_forbidden_with_the_api_code', () => {
    expect(toApiError(httpError(403, {}))).toEqual({ kind: 'forbidden', status: 403, code: null })
    expect(
      toApiError(httpError(403, { message: 'Closed', code: 'E_REGISTRATION_CLOSED' }))
    ).toEqual({ kind: 'forbidden', status: 403, code: 'E_REGISTRATION_CLOSED' })
  })

  it('test_429_maps_to_throttled_with_the_retry_after_seconds', () => {
    expect(toApiError(httpError(429, {}, { 'Retry-After': '1200' }))).toEqual({
      kind: 'throttled',
      status: 429,
      retryAfterSeconds: 1200,
    })
    expect(toApiError(httpError(429, {}))).toEqual({
      kind: 'throttled',
      status: 429,
      retryAfterSeconds: null,
    })
  })

  it('test_other_client_errors_map_to_http_with_the_api_code', () => {
    expect(toApiError(httpError(404, { message: 'Not found', code: 'E_ROW_NOT_FOUND' }))).toEqual({
      kind: 'http',
      status: 404,
      code: 'E_ROW_NOT_FOUND',
    })
    expect(toApiError(httpError(410, { code: 'E_INVITATION_EXPIRED' }))).toEqual({
      kind: 'http',
      status: 410,
      code: 'E_INVITATION_EXPIRED',
    })
    expect(toApiError(httpError(400, { errors: [{ message: 'Invalid credentials' }] }))).toEqual({
      kind: 'http',
      status: 400,
      code: null,
    })
  })

  it('test_server_errors_map_to_server', () => {
    expect(toApiError(httpError(500, {}))).toEqual({ kind: 'server', status: 500 })
    expect(toApiError(httpError(503, {}))).toEqual({ kind: 'server', status: 503 })
  })

  it('test_network_failures_map_to_offline', () => {
    const error = new TuyauNetworkError(new TypeError('Failed to fetch'))

    expect(toApiError(error)).toEqual({ kind: 'offline' })
  })

  it('test_a_fetch_type_error_maps_to_offline', () => {
    expect(toApiError(new TypeError('Failed to fetch'))).toEqual({ kind: 'offline' })
  })

  it('test_anything_else_maps_to_server', () => {
    expect(toApiError(new Error('boom'))).toEqual({ kind: 'server' })
    expect(toApiError('weird')).toEqual({ kind: 'server' })
  })
})

describe('errorPayload', () => {
  it('test_reads_the_extras_the_api_sends_next_to_message_and_code', () => {
    const error = httpError(422, {
      message: 'Some rows still need a decision',
      code: 'E_IMPORT_ROWS_UNDECIDED',
      rowIds: [4, 9],
    })

    expect(errorPayload(error)).toEqual({
      message: 'Some rows still need a decision',
      code: 'E_IMPORT_ROWS_UNDECIDED',
      rowIds: [4, 9],
    })
  })

  it('test_is_empty_for_network_failures_and_unknown_errors', () => {
    expect(errorPayload(new TuyauNetworkError(new TypeError('Failed to fetch')))).toEqual({})
    expect(errorPayload(httpError(500, 'Internal'))).toEqual({})
    expect(errorPayload(new Error('boom'))).toEqual({})
  })
})
