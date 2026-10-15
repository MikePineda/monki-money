import {
  MAX_CSV_BYTES,
  checkCsvFile,
  maskAccountNumber,
  stagedOutcome,
  uploadOutcome,
} from './import-upload'

describe('csv file check', () => {
  it('test_a_csv_under_two_megabytes_passes', () => {
    expect(checkCsvFile({ name: 'export.csv', size: 1200, type: 'text/csv' })).toBeNull()
    expect(checkCsvFile({ name: 'EXPORT.CSV', size: 1200, type: '' })).toBeNull()
    expect(
      checkCsvFile({ name: 'export.csv', size: 1200, type: 'application/vnd.ms-excel' })
    ).toBeNull()
  })

  it('test_a_file_over_two_megabytes_is_refused_before_uploading', () => {
    expect(checkCsvFile({ name: 'big.csv', size: MAX_CSV_BYTES + 1, type: 'text/csv' })).toBe(
      'tooLarge'
    )
    expect(checkCsvFile({ name: 'ok.csv', size: MAX_CSV_BYTES, type: 'text/csv' })).toBeNull()
  })

  it('test_an_empty_file_or_another_format_is_refused', () => {
    expect(checkCsvFile({ name: 'empty.csv', size: 0, type: 'text/csv' })).toBe('empty')
    expect(checkCsvFile({ name: 'statement.pdf', size: 10, type: 'application/pdf' })).toBe(
      'notCsv'
    )
  })
})

describe('upload outcome', () => {
  it('test_201_lists_the_staged_batches', () => {
    expect(uploadOutcome(201, { data: [{ id: 5 }] })).toEqual({
      kind: 'staged',
      batches: [{ id: 5 }],
    })
  })

  it('test_unknown_account_numbers_ask_for_a_mapping', () => {
    expect(
      uploadOutcome(422, {
        code: 'E_IMPORT_UNKNOWN_ACCOUNTS',
        message: 'Map these',
        accountNumbers: ['123456789'],
      })
    ).toEqual({ kind: 'unknownAccounts', accountNumbers: ['123456789'] })
  })

  it('test_an_open_batch_points_at_its_review', () => {
    expect(
      uploadOutcome(409, { code: 'E_IMPORT_BATCH_OPEN', message: 'x', batchId: 7, accountId: 2 })
    ).toEqual({ kind: 'batchOpen', batchId: 7, accountId: 2 })
  })

  it('test_a_csv_error_keeps_its_code_line_and_column', () => {
    expect(
      uploadOutcome(422, {
        code: 'E_CSV_INVALID_VALUE',
        message: 'Bad amount',
        line: 4,
        column: 'Amount',
      })
    ).toEqual({
      kind: 'csvError',
      code: 'E_CSV_INVALID_VALUE',
      message: 'Bad amount',
      line: 4,
      column: 'Amount',
    })
    expect(uploadOutcome(422, { code: 'E_CSV_EMPTY', message: 'Empty' })).toMatchObject({
      kind: 'csvError',
      line: null,
      column: null,
    })
  })

  it('test_field_errors_and_plan_limits_are_told_apart', () => {
    expect(
      uploadOutcome(422, {
        errors: [{ field: 'accountId', rule: 'oneAccountOnly', message: 'One account only' }],
      })
    ).toEqual({ kind: 'invalid', fields: { accountId: 'One account only' } })
    expect(uploadOutcome(402, { code: 'E_IMPORT_LIMIT_REACHED', message: 'x' })).toEqual({
      kind: 'limitReached',
    })
  })

  it('test_session_throttle_and_server_failures_are_their_own_outcomes', () => {
    expect(uploadOutcome(401, {})).toEqual({ kind: 'unauthorized' })
    expect(uploadOutcome(429, {})).toEqual({ kind: 'throttled' })
    expect(uploadOutcome(500, null)).toEqual({ kind: 'failed', status: 500 })
    expect(uploadOutcome(404, { code: 'E_ROW_NOT_FOUND' })).toEqual({ kind: 'failed', status: 404 })
  })
})

describe('staged outcome', () => {
  const batch = (id: number, status: string, accountId = 1) => ({ id, status, accountId })

  it('test_one_staged_batch_opens_its_review', () => {
    expect(stagedOutcome([batch(5, 'staged')])).toEqual({ next: 'review', batchId: 5 })
  })

  it('test_several_staged_batches_are_offered_one_by_one', () => {
    expect(stagedOutcome([batch(5, 'staged'), batch(6, 'completed'), batch(7, 'staged')])).toEqual({
      next: 'choose',
      batchIds: [5, 7],
    })
  })

  it('test_a_file_with_nothing_new_says_so', () => {
    expect(stagedOutcome([batch(5, 'completed')])).toEqual({ next: 'nothingNew' })
    expect(stagedOutcome([])).toEqual({ next: 'nothingNew' })
  })
})

describe('account numbers', () => {
  it('test_only_the_last_four_digits_are_shown', () => {
    expect(maskAccountNumber('123456789')).toBe('•••• 6789')
    expect(maskAccountNumber('12')).toBe('•••• 12')
  })
})
