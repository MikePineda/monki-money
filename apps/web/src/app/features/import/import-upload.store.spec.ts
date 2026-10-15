import { TestBed } from '@angular/core/testing'
import { TuyauHTTPError } from '@tuyau/core/client'
import { anImportBatch } from '../../../testing/import-fixtures'
import { UploadAbortedError, UploadNetworkError } from '../../core/api/upload.service'
import { AccountsApi } from '../../core/household/accounts.api'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { MAX_CSV_BYTES, type UploadOutcome } from '../../domain/import-upload'
import { ImportsApi, type UploadRequest } from './data-access/imports.api'
import { ImportUploadStore } from './import-upload.store'

function csv(name = 'export.csv', size = 1024, type = 'text/csv'): File {
  const file = new File(['Date,Amount'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('ImportUploadStore', () => {
  let api: { upload: ReturnType<typeof vi.fn>; staged: ReturnType<typeof vi.fn> }
  let accounts: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let directory: { load: ReturnType<typeof vi.fn> }

  function setup(...outcomes: (UploadOutcome | Error)[]) {
    api = {
      upload: vi.fn(async () => {
        const next = outcomes.shift() ?? { kind: 'staged', batches: [anImportBatch()] }
        if (next instanceof Error) {
          throw next
        }
        return next
      }),
      staged: vi.fn(async () => []),
    }
    accounts = { create: vi.fn(async () => ({ id: 40 })), update: vi.fn(async () => ({ id: 1 })) }
    directory = { load: vi.fn(async () => undefined) }
    TestBed.configureTestingModule({
      providers: [
        ImportUploadStore,
        { provide: ImportsApi, useValue: api },
        { provide: AccountsApi, useValue: accounts },
        { provide: HouseholdDirectory, useValue: directory },
      ],
    })
    return TestBed.inject(ImportUploadStore)
  }

  it('test_a_file_that_is_not_a_csv_never_uploads', async () => {
    const store = setup()

    await expect(store.pick(csv('statement.pdf', 10, 'application/pdf'))).resolves.toBeNull()

    expect(api.upload).not.toHaveBeenCalled()
    expect(store.problem()).toEqual({ kind: 'file', problem: 'notCsv' })
  })

  it('test_a_file_over_two_megabytes_never_uploads', async () => {
    const store = setup()

    await store.pick(csv('big.csv', MAX_CSV_BYTES + 1))

    expect(api.upload).not.toHaveBeenCalled()
    expect(store.problem()).toEqual({ kind: 'file', problem: 'tooLarge' })
  })

  it('test_upload_reports_progress_and_opens_the_single_staged_batch', async () => {
    const store = setup()
    let release!: () => void
    api.upload.mockImplementationOnce(async (request: UploadRequest) => {
      request.onProgress?.(0.5)
      await new Promise<void>((done) => (release = done))
      return { kind: 'staged', batches: [anImportBatch({ id: 9 })] }
    })
    store.accountId.set(3)

    const uploading = store.pick(csv())
    await Promise.resolve()

    expect(store.step()).toEqual({
      step: 'uploading',
      fileName: 'export.csv',
      sizeBytes: 1024,
      progress: 0.5,
    })
    expect(api.upload).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 3, signal: expect.any(AbortSignal) })
    )
    release()
    await expect(uploading).resolves.toEqual({ next: 'review', batchId: 9 })
    expect(store.step()).toEqual({ step: 'pick' })
  })

  it('test_several_staged_batches_are_offered_and_a_re_upload_says_nothing_is_new', async () => {
    const store = setup(
      {
        kind: 'staged',
        batches: [anImportBatch({ id: 9 }), anImportBatch({ id: 10, accountId: 2 })],
      },
      { kind: 'staged', batches: [anImportBatch({ id: 11, status: 'completed' })] }
    )

    await expect(store.pick(csv())).resolves.toEqual({ next: 'choose', batchIds: [9, 10] })
    expect(store.step()).toMatchObject({ step: 'choose' })

    await expect(store.pick(csv())).resolves.toEqual({ next: 'nothingNew' })
    expect(store.step()).toEqual({ step: 'nothingNew' })
  })

  it('test_unknown_account_numbers_open_the_mapping_step', async () => {
    const store = setup({ kind: 'unknownAccounts', accountNumbers: ['123456789', '987654321'] })

    await store.pick(csv())

    expect(store.step()).toEqual({ step: 'mapping', accountNumbers: ['123456789', '987654321'] })
    expect(store.mapping()).toEqual({ '123456789': null, '987654321': null })
    expect(store.mappingComplete()).toBe(false)
  })

  it('test_the_mapping_saves_the_numbers_creates_accounts_and_uploads_again', async () => {
    const store = setup({ kind: 'unknownAccounts', accountNumbers: ['123456789', '987654321'] })
    await store.pick(csv())

    store.choose('123456789', 1)
    store.choose('987654321', 'new')
    const next = await store.applyMapping((number) => `NAB ${number.slice(-4)}`)

    expect(accounts.update).toHaveBeenCalledWith(1, { externalAccountNumber: '123456789' })
    expect(accounts.create).toHaveBeenCalledWith({
      name: 'NAB 4321',
      kind: 'transaction',
      institution: 'NAB',
      externalAccountNumber: '987654321',
    })
    expect(directory.load).toHaveBeenCalledWith(true)
    expect(api.upload).toHaveBeenCalledTimes(2)
    expect(next).toEqual({ next: 'review', batchId: 7 })
  })

  it('test_a_mapping_the_api_refuses_shows_its_message', async () => {
    const store = setup({ kind: 'unknownAccounts', accountNumbers: ['123456789'] })
    await store.pick(csv())
    const kyError = {
      response: { status: 422, headers: new Headers() },
      request: { url: 'http://localhost/api/v1/accounts/1', method: 'PATCH' },
      options: { prefixUrl: 'http://localhost' },
    }
    accounts.update.mockRejectedValueOnce(
      new TuyauHTTPError(kyError as never, {
        errors: [{ field: 'externalAccountNumber', rule: 'taken', message: 'Already used' }],
      })
    )

    store.choose('123456789', 1)
    await expect(store.applyMapping(() => 'x')).resolves.toBeNull()

    expect(store.problem()).toEqual({ kind: 'invalid', message: 'Already used' })
    expect(api.upload).toHaveBeenCalledTimes(1)
  })

  it('test_an_open_batch_for_the_account_points_at_its_review', async () => {
    const store = setup({ kind: 'batchOpen', batchId: 5, accountId: 1 })

    await store.pick(csv())

    expect(store.problem()).toEqual({ kind: 'batchOpen', batchId: 5, accountId: 1 })
    expect(store.step()).toEqual({ step: 'pick' })
  })

  it('test_a_malformed_file_keeps_its_line_and_column', async () => {
    const store = setup({
      kind: 'csvError',
      code: 'E_CSV_INVALID_VALUE',
      message: 'Bad amount',
      line: 4,
      column: 'Amount',
    })

    await store.pick(csv())

    expect(store.problem()).toEqual({
      kind: 'csv',
      code: 'E_CSV_INVALID_VALUE',
      message: 'Bad amount',
      line: 4,
      column: 'Amount',
    })
  })

  it('test_the_plan_limit_is_its_own_problem', async () => {
    const store = setup({ kind: 'limitReached' })

    await store.pick(csv())

    expect(store.problem()).toEqual({ kind: 'limit' })
  })

  it('test_cancelling_goes_back_to_the_picker_without_an_error', async () => {
    const store = setup()
    api.upload.mockImplementationOnce(
      (request: UploadRequest) =>
        new Promise((_resolve, reject) =>
          request.signal?.addEventListener('abort', () => reject(new UploadAbortedError()))
        )
    )

    const uploading = store.pick(csv())
    await Promise.resolve()
    store.cancel()

    await expect(uploading).resolves.toBeNull()
    expect(store.step()).toEqual({ step: 'pick' })
    expect(store.problem()).toBeNull()
  })

  it('test_no_connection_says_so', async () => {
    const store = setup(new UploadNetworkError())

    await store.pick(csv())

    expect(store.problem()).toEqual({ kind: 'failure', message: { key: 'errors.offline' } })
  })
})
