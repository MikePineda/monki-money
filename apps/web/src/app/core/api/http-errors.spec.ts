import { TuyauHTTPError, TuyauNetworkError } from '@tuyau/core/client'
import { toApiError } from './http-errors'

/** Builds the error Tuyau throws for a non-2xx response (it wraps a Ky HTTPError). */
function httpError(status: number, body: unknown): TuyauHTTPError {
  const kyError = {
    response: { status },
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

  it('test_403_maps_to_forbidden', () => {
    expect(toApiError(httpError(403, {}))).toEqual({ kind: 'forbidden', status: 403 })
  })

  it('test_other_statuses_map_to_server', () => {
    expect(toApiError(httpError(500, {}))).toEqual({ kind: 'server', status: 500 })
    expect(toApiError(httpError(404, {}))).toEqual({ kind: 'server', status: 404 })
    expect(toApiError(httpError(429, {}))).toEqual({ kind: 'server', status: 429 })
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
