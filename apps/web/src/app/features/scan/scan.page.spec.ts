import { TestBed } from '@angular/core/testing'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import {
  aReceipt,
  receiptsApiMock,
  scanTestingProviders,
  type ReceiptsApiMock,
} from '../../../testing/scan-testing'
import { httpError } from '../../../testing/session-fixtures'
import { WINDOW } from '../../core/platform/window.token'
import type { ReceiptDraft } from '../../domain/receipt-draft'
import { BottomSheetService } from '../../shared/ui/bottom-sheet/bottom-sheet.service'
import ScanPage from './scan.page'

function photo(): File {
  return new File(['pixels'], 'receipt.jpg', { type: 'image/jpeg' })
}

describe('ScanPage', () => {
  let api: ReceiptsApiMock

  async function open(receipt: ReceiptDraft = aReceipt()) {
    api = receiptsApiMock(receipt)
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'scan', component: ScanPage },
            { path: 'month', children: [] },
            { path: 'add', children: [] },
          ],
          withComponentInputBinding()
        ),
        ...scanTestingProviders({ api }),
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/scan')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(text(root, 'h1')).toBe('Scan a receipt'))
    await harness.fixture.whenStable()
    const settle = () => harness.fixture.whenStable()
    const pick = async (file: File, input = 'scan.capture.libraryInput') => {
      const element = root.querySelector<HTMLInputElement>(`[data-testid="${input}"]`)
      Object.defineProperty(element, 'files', { value: [file], configurable: true })
      element?.dispatchEvent(new Event('change'))
      await settle()
    }
    return { harness, root, settle, pick }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function el<T extends HTMLElement = HTMLButtonElement>(root: ParentNode, testId: string): T {
    return root.querySelector(`[data-testid="${testId}"]`) as T
  }

  async function reviewOpen(root: HTMLElement): Promise<void> {
    await vi.waitFor(() => {
      expect(text(root, 'h1')).toBe('Review receipt')
      expect(el(root, 'scan.review.save')).not.toBeNull()
    })
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  describe('capture', () => {
    it('test_the_camera_opens_the_back_camera_and_the_library_any_photo', async () => {
      const { root } = await open()

      const camera = el<HTMLInputElement>(root, 'scan.capture.cameraInput')
      const library = el<HTMLInputElement>(root, 'scan.capture.libraryInput')
      expect(camera.getAttribute('accept')).toBe('image/*')
      expect(camera.getAttribute('capture')).toBe('environment')
      expect(library.getAttribute('accept')).toBe('image/*')
      expect(library.hasAttribute('capture')).toBe(false)
      expect(text(root, '[data-testid="scan.capture.camera"]')).toBe('Take a photo')
      expect(text(root, '[data-testid="scan.capture.library"]')).toBe('Choose from library')
    })

    it('test_a_picked_photo_shows_its_preview_and_progress_while_it_is_read', async () => {
      const { root, pick, settle } = await open()
      let release!: (receipt: ReceiptDraft) => void
      api.scan.mockImplementationOnce(() => new Promise((done) => (release = done)))

      await pick(photo())

      await vi.waitFor(() =>
        expect(text(root, '[data-testid="scan.capture.status"]')).toBe('Reading the receipt')
      )
      expect(el<HTMLImageElement>(root, 'scan.capture.preview').getAttribute('src')).toBe(
        'blob:preview'
      )
      expect(el(root, 'scan.capture.camera')).toBeNull()
      expect(el(root, 'scan.capture.cancel')).not.toBeNull()

      release(aReceipt())
      await settle()
      await reviewOpen(root)
    })

    it('test_scanning_unavailable_is_said_with_try_again_and_add_by_hand', async () => {
      const { root, pick } = await open()
      api.scan.mockRejectedValueOnce(httpError(503, { code: 'E_LLM_UNAVAILABLE' }))

      await pick(photo())

      await vi.waitFor(() =>
        expect(text(root, '[data-testid="scan.capture.problem"]')).toBe(
          'Scanning is not available right now.'
        )
      )
      expect(el(root, 'scan.capture.retry')).not.toBeNull()
      expect(el<HTMLAnchorElement>(root, 'scan.capture.manual').getAttribute('href')).toBe('/add')
      expect(text(root, '[data-testid="scan.capture.camera"]')).toBe('Take another photo')
    })

    it('test_the_ai_limit_cannot_be_retried', async () => {
      const { root, pick } = await open()
      api.scan.mockRejectedValueOnce(httpError(402, { code: 'E_LLM_QUOTA_EXCEEDED' }))

      await pick(photo())

      await vi.waitFor(() =>
        expect(text(root, '[data-testid="scan.capture.problem"]')).toBe(
          'AI limit reached for this month. You can still add the expense by hand.'
        )
      )
      expect(el(root, 'scan.capture.retry')).toBeNull()
    })

    it('test_an_unreadable_receipt_asks_for_a_clearer_photo', async () => {
      const { root, pick } = await open()
      api.scan.mockRejectedValueOnce(
        httpError(422, { errors: [{ field: 'key', rule: 'image', message: 'Unreadable' }] })
      )

      await pick(photo())

      await vi.waitFor(() =>
        expect(text(root, '[data-testid="scan.capture.problem"]')).toBe(
          'We could not read this receipt, try a clearer photo.'
        )
      )
    })

    it('test_offline_says_scanning_needs_the_internet', async () => {
      const { root, pick } = await open()
      const view = TestBed.inject(WINDOW)
      const offline = vi.spyOn(view.navigator, 'onLine', 'get').mockReturnValue(false)

      await pick(photo())

      await vi.waitFor(() =>
        expect(text(root, '[data-testid="scan.capture.problem"]')).toBe(
          'No connection. Scanning needs the internet, so try again when you are back online.'
        )
      )
      expect(api.presign).not.toHaveBeenCalled()
      offline.mockRestore()
    })

    it('test_cancel_goes_back_to_the_capture', async () => {
      const { root, pick, settle } = await open()
      api.scan.mockImplementationOnce(() => new Promise(() => undefined))
      await pick(photo())
      await vi.waitFor(() => expect(el(root, 'scan.capture.cancel')).not.toBeNull())

      el(root, 'scan.capture.cancel').click()
      await settle()

      expect(el(root, 'scan.capture.camera')).not.toBeNull()
      expect(el(root, 'scan.capture.preview')).toBeNull()
    })
  })

  describe('review', () => {
    it('test_the_draft_opens_in_the_form_with_a_confidence_hint', async () => {
      const { root, pick } = await open()

      await pick(photo())
      await reviewOpen(root)

      expect(text(root, '[data-testid="transactions.form.amount"]')).toContain('$23.45')
      expect(
        el<HTMLInputElement>(root, 'transactions.form.payee').querySelector('input')?.value
      ).toBe('Corner Grocer')
      expect(text(root, '[data-testid="transactions.form.category"]')).toBe('Groceries')
      expect(text(root, '[data-testid="transactions.form.account"]')).toBe('NAB Everyday')
      expect(text(root, '[data-testid="scan.review.confidence"]')).toBe(
        'Read clearly. Check the details before saving.'
      )
      expect(text(root, '[data-testid="scan.review.save"]')).toBe('Save −$23.45')
    })

    it('test_a_low_confidence_reading_asks_to_check_every_field', async () => {
      const { root, pick } = await open(aReceipt({ confidence: 0.3 }))

      await pick(photo())
      await reviewOpen(root)

      expect(el(root, 'scan.review.confidence').getAttribute('data-level')).toBe('low')
      expect(text(root, '[data-testid="scan.review.confidence"]')).toBe(
        'Hard to read. Check every field before saving.'
      )
    })

    it('test_saving_posts_the_receipt_and_goes_back_with_a_toast', async () => {
      const { root, pick, settle } = await open()
      await pick(photo())
      await reviewOpen(root)

      el(root, 'scan.review.save').click()
      await settle()

      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
      expect(api.save).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'receipt',
          amountCents: 2345,
          categoryId: 20,
          payee: 'Corner Grocer',
        })
      )
    })

    it('test_split_by_lines_lists_each_line_and_saves_one_split_per_line', async () => {
      const { root, pick, settle } = await open(aReceipt({ totalCents: 2340 }))
      await pick(photo())
      await reviewOpen(root)

      el(root, 'scan.review.split').querySelector('input')?.click()
      await settle()

      const lines = [...root.querySelectorAll('[data-testid="scan.line"]')]
      expect(lines.map((line) => text(line, '[data-testid="scan.line.description"]'))).toEqual([
        'Bananas 1kg',
        'Coffee beans 500g',
        'Sourdough loaf',
      ])
      expect(lines.map((line) => text(line, '[data-testid="scan.line.amount"]'))).toEqual([
        '−$3.90',
        '−$16.55',
        '−$2.95',
      ])
      expect(text(root, '[data-testid="scan.review.difference"]')).toBe(
        'The last line takes −$0.05 so the lines match the total.'
      )
      expect(text(root, '[data-testid="transactions.form.category"]')).toBe('Split · 3 categories')

      el(root, 'scan.review.save').click()
      await settle()

      await vi.waitFor(() => expect(api.save).toHaveBeenCalled())
      expect(api.save.mock.calls[0]?.[0]).toMatchObject({
        splits: [
          { categoryId: 20, amountCents: 390, memo: 'Bananas 1kg' },
          { categoryId: 20, amountCents: 1655, memo: 'Coffee beans 500g' },
          { categoryId: 20, amountCents: 295, memo: 'Sourdough loaf' },
        ],
      })
    })

    it('test_selected_lines_merge_from_the_bulk_bar', async () => {
      const { root, pick, settle } = await open()
      await pick(photo())
      await reviewOpen(root)
      el(root, 'scan.review.split').querySelector('input')?.click()
      await settle()

      const checks = root.querySelectorAll<HTMLInputElement>('[data-testid="review.check"]')
      checks[0]?.click()
      checks[2]?.click()
      await settle()
      expect(text(root, '[data-testid="scan.review.bulk"]')).toContain('2 lines selected')

      el(root, 'scan.review.bulk.merge').click()
      await settle()

      expect(
        [...root.querySelectorAll('[data-testid="scan.line.description"]')].map(
          (line) => line.textContent?.trim() ?? ''
        )
      ).toEqual(['Bananas 1kg + Sourdough loaf', 'Coffee beans 500g'])
      expect(el(root, 'scan.review.bulk')).toBeNull()
    })

    it('test_a_line_takes_another_category_from_the_select_sheet', async () => {
      const { root, pick, settle } = await open()
      await pick(photo())
      await reviewOpen(root)
      el(root, 'scan.review.split').querySelector('input')?.click()
      await settle()

      root.querySelector<HTMLButtonElement>('[data-testid="scan.line"][data-id="2"]')?.click()
      await settle()
      await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull())
      const utilities = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (option) => option.textContent?.includes('Utilities')
      )
      utilities?.click()
      await settle()

      await vi.waitFor(() =>
        expect(
          text(root, '[data-testid="scan.line"][data-id="2"] [data-testid="scan.line.category"]')
        ).toBe('Utilities')
      )
    })

    it('test_discarding_asks_first_then_returns_to_the_capture', async () => {
      const { root, pick, settle } = await open()
      await pick(photo())
      await reviewOpen(root)

      el(root, 'scan.review.discard').click()
      await settle()
      await vi.waitFor(() =>
        expect(document.querySelector('[data-testid="confirm.yes"]')).not.toBeNull()
      )
      document.querySelector<HTMLButtonElement>('[data-testid="confirm.yes"]')?.click()
      await settle()

      await vi.waitFor(() => expect(text(root, 'h1')).toBe('Scan a receipt'))
      expect(api.save).not.toHaveBeenCalled()
    })
  })
})
