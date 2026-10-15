import { httpError, networkError, validationError } from '../../../testing/session-fixtures'
import { syncResult } from './sync-result'

describe('syncResult', () => {
  it('test_no_network_is_retryable', () => {
    expect(syncResult(networkError())).toEqual({
      outcome: 'retry',
      error: { code: 'E_OFFLINE', message: '' },
    })
  })

  it('test_server_errors_and_throttling_are_retryable', () => {
    expect(syncResult(httpError(503))).toMatchObject({
      outcome: 'retry',
      error: { code: 'E_SERVER' },
    })
    expect(syncResult(httpError(429))).toMatchObject({
      outcome: 'retry',
      error: { code: 'E_THROTTLED' },
    })
  })

  it('test_an_expired_session_or_a_stale_csrf_token_is_retryable_after_login', () => {
    expect(syncResult(httpError(401))).toMatchObject({
      outcome: 'retry',
      error: { code: 'E_UNAUTHORIZED' },
    })
    expect(syncResult(httpError(403, { code: 'E_BAD_CSRF_TOKEN' }))).toMatchObject({
      outcome: 'retry',
      error: { code: 'E_BAD_CSRF_TOKEN' },
    })
  })

  it('test_a_validation_error_fails_with_the_server_messages', () => {
    expect(
      syncResult(
        validationError({
          categoryId: 'The selected category does not exist',
          accountId: 'The selected account does not exist',
        })
      )
    ).toEqual({
      outcome: 'failed',
      error: {
        code: 'E_VALIDATION',
        message: 'The selected category does not exist The selected account does not exist',
      },
    })
  })

  it('test_a_conflict_means_the_api_already_has_the_entry', () => {
    expect(syncResult(httpError(409, { code: 'E_DUPLICATE' }))).toEqual({ outcome: 'synced' })
  })

  it('test_other_client_errors_fail_with_the_api_code_and_message', () => {
    expect(
      syncResult(httpError(403, { message: 'This household is suspended', code: 'E_SUSPENDED' }))
    ).toEqual({
      outcome: 'failed',
      error: { code: 'E_SUSPENDED', message: 'This household is suspended' },
    })
    expect(syncResult(httpError(404, {}))).toEqual({
      outcome: 'failed',
      error: { code: 'E_HTTP_404', message: '' },
    })
  })
})
