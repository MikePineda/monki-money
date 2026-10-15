import type { Mock } from 'vitest'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { anImportBatch } from '../../../../testing/import-fixtures'
import {
  importTestingProviders,
  importsApiMock,
  type ImportsApiMock,
} from '../../../../testing/import-testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { UploadAbortedError } from '../../../core/api/upload.service'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import ImportUploadPage from './upload.page'

function csv(name = 'export.csv', size = 2048, type = 'text/csv'): File {
  const file = new File(['Date,Amount'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('ImportUploadPage', () => {
  let api: ImportsApiMock
  let accounts: Record<'update' | 'create', Mock>

  async function open(configure: (mock: ImportsApiMock) => void = () => undefined) {
    api = importsApiMock()
    configure(api)
    accounts = { update: vi.fn(async () => ({})), create: vi.fn(async () => ({})) }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'import', component: ImportUploadPage },
            { path: 'import/:id', children: [] },
            { path: 'month', children: [] },
          ],
          withComponentInputBinding()
        ),
        ...importTestingProviders({ api, accounts }),
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/import')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(text(root, 'h1')).toBe('Import bank CSV'))
    await harness.fixture.whenStable()
    const settle = () => harness.fixture.whenStable()
    const pick = async (file: File) => {
      const input = root.querySelector<HTMLInputElement>('[data-testid="import.upload.file"]')
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input?.dispatchEvent(new Event('change'))
      await settle()
    }
    return { harness, root, settle, pick }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_the_picker_accepts_csv_and_reads_the_account_from_the_file_by_default', async () => {
    const { root } = await open()

    expect(root.querySelector('[data-testid="import.upload.file"]')?.getAttribute('accept')).toBe(
      '.csv,text/csv'
    )
    expect(text(root, '[data-testid="import.upload.account"]')).toBe('Read it from the file')
    expect(text(root, '[data-testid="import.upload.choose"]')).toBe('Choose CSV file')
  })

  it('test_a_file_that_is_not_csv_is_refused_before_it_leaves', async () => {
    const { root, pick } = await open()

    await pick(csv('statement.pdf', 10, 'application/pdf'))

    expect(api.upload).not.toHaveBeenCalled()
    expect(text(root, '[data-testid="import.upload.problem"]')).toBe(
      'This is not a CSV file. Export the transactions as CSV from your bank.'
    )
  })

  it('test_a_file_over_two_megabytes_is_refused_with_a_localized_message', async () => {
    const { root, pick } = await open()

    await pick(csv('big.csv', 3 * 1024 * 1024))

    expect(api.upload).not.toHaveBeenCalled()
    expect(text(root, '[data-testid="import.upload.problem"]')).toBe(
      'This file is over 2 MB. Export a shorter period.'
    )
  })

  it('test_the_upload_shows_its_progress_and_can_be_cancelled', async () => {
    let progress!: (value: number) => void
    const { root, settle, pick } = await open((mock) =>
      mock.upload.mockImplementation(
        (request: { onProgress: (value: number) => void; signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            progress = request.onProgress
            request.signal.addEventListener('abort', () => reject(new UploadAbortedError()))
          })
      )
    )

    await pick(csv('export.csv', 1024 * 1024))
    progress(0.4)
    await settle()

    expect(text(root, '[data-testid="import.upload.progress"]')).toContain('40% of 1 MB')
    root.querySelector<HTMLButtonElement>('[data-testid="import.upload.cancel"]')?.click()
    await settle()
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="import.upload.progress"]')).toBeNull()
    )
    expect(root.querySelector('[data-testid="import.upload.problem"]')).toBeNull()
    expect(root.querySelector('[data-testid="import.upload.choose"]')).not.toBeNull()
  })

  it('test_a_staged_file_opens_its_review', async () => {
    const { pick } = await open((mock) =>
      mock.upload.mockResolvedValue({ kind: 'staged', batches: [anImportBatch({ id: 9 })] })
    )

    await pick(csv())

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/import/9'))
  })

  it('test_a_malformed_file_says_where', async () => {
    const { root, pick } = await open((mock) =>
      mock.upload.mockResolvedValue({
        kind: 'csvError',
        code: 'E_CSV_INVALID_VALUE',
        message: 'x',
        line: 4,
        column: 'Amount',
      })
    )

    await pick(csv())

    expect(text(root, '[data-testid="import.upload.problem"]')).toBe(
      'A value in this file cannot be read. Line 4, column Amount.'
    )
  })

  it('test_an_account_with_an_import_waiting_links_to_that_review', async () => {
    const { root, settle, pick } = await open((mock) =>
      mock.upload.mockResolvedValue({ kind: 'batchOpen', batchId: 5, accountId: 1 })
    )

    await pick(csv())
    const banner = root.querySelector('[data-testid="import.upload.problem"]') as HTMLElement
    expect(banner.textContent).toContain('This account already has an import waiting for review.')
    ;[...banner.querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Continue that review'))
      ?.click()
    await settle()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/import/5'))
  })

  it('test_unknown_account_numbers_are_mapped_then_the_file_goes_again', async () => {
    const { root, settle, pick } = await open((mock) =>
      mock.upload
        .mockResolvedValueOnce({ kind: 'unknownAccounts', accountNumbers: ['987654321'] })
        .mockResolvedValueOnce({ kind: 'staged', batches: [anImportBatch({ id: 11 })] })
    )

    await pick(csv())
    expect(text(root, '[data-testid="import.mapping"] li')).toContain('Account •••• 4321')
    const next = root.querySelector<HTMLButtonElement>('[data-testid="import.mapping.continue"]')
    expect(next?.disabled).toBe(true)

    root.querySelector<HTMLButtonElement>('[data-testid="import.mapping.choose.0"]')?.click()
    await settle()
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull())
    ;[...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((item) => item.textContent?.includes('NAB Savings'))
      ?.click()
    await settle()
    expect(next?.disabled).toBe(false)
    next?.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/import/11'))
    expect(accounts.update).toHaveBeenCalledWith(2, { externalAccountNumber: '987654321' })
  })

  it('test_imports_waiting_for_review_are_offered_first', async () => {
    const { root } = await open((mock) =>
      mock.staged.mockResolvedValue([anImportBatch({ id: 5, counts: anImportBatch().counts })])
    )

    await vi.waitFor(() =>
      expect(text(root, '[data-testid="import.upload.waiting"]')).toContain('NAB Everyday')
    )
    expect(text(root, '[data-testid="import.upload.waiting"]')).toContain('1–27 Sept · 5 rows')
  })
})
