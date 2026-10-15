import { TuyauHTTPError, TuyauNetworkError } from '@tuyau/core/client'
import { validationRules } from './validation-rules'

function httpError(status: number, body: unknown) {
  const kyError = {
    response: { status, headers: new Headers() },
    request: { url: 'http://localhost/api/v1/thing', method: 'POST' },
    options: { prefixUrl: 'http://localhost' },
  }
  return new TuyauHTTPError(kyError as never, body)
}

describe('validationRules', () => {
  it('test_a_422_gives_the_first_rule_per_field', () => {
    const error = httpError(422, {
      errors: [
        { field: 'month', rule: 'noActivity', message: 'Nothing happened this month' },
        { field: 'month', rule: 'future', message: 'Second' },
      ],
    })

    expect(validationRules(error)).toEqual({ month: 'noActivity' })
  })

  it('test_anything_but_a_422_with_rules_gives_no_rules', () => {
    expect(validationRules(httpError(422, { message: 'Bad output', code: 'E_LLM' }))).toEqual({})
    expect(validationRules(httpError(402, { code: 'E_LLM_QUOTA_EXCEEDED' }))).toEqual({})
    expect(validationRules(new TuyauNetworkError(new TypeError('Failed to fetch')))).toEqual({})
    expect(validationRules('weird')).toEqual({})
  })
})
