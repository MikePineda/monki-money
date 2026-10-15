import { TestBed } from '@angular/core/testing'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import {
  aMatchCandidate,
  aTentativeSuggestion,
  aTrustedSuggestion,
  anImportRow,
} from '../../../../testing/import-fixtures'
import {
  importTestingProviders,
  importsApiMock,
  type ImportsApiMock,
} from '../../../../testing/import-testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import type { ImportRow } from '../../../core/api/api-types'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import ImportReviewPage from './review.page'

const rows = (): ImportRow[] => [
  anImportRow({ id: 1, nabMerchant: 'Corner Grocer', suggestion: aTrustedSuggestion(20) }),
  anImportRow({ id: 2, nabMerchant: 'Sample Fest', suggestion: aTentativeSuggestion(10, 0.61) }),
  anImportRow({ id: 3, nabMerchant: 'Riverside Deli', amountCents: -3254 }),
  anImportRow({ id: 4, nabMerchant: 'Translink', amountCents: 0, resolution: 'ignored' }),
]

describe('ImportReviewPage', () => {
  let api: ImportsApiMock

  async function open(initial: ImportRow[] = rows()) {
    api = importsApiMock(initial)
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'import', children: [] },
            { path: 'import/:id', component: ImportReviewPage },
            { path: 'import/:id/result', children: [] },
          ],
          withComponentInputBinding()
        ),
        ...importTestingProviders({ api }),
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/import/7')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => {
      expect(text(root, 'h1')).toBe('Review import')
      expect(root.querySelectorAll('[data-testid="import.row"]').length).toBeGreaterThan(0)
      expect(text(root, '[data-testid="import.row.meta"]')).not.toMatch(/import\./)
    })
    await harness.fixture.whenStable()
    const settle = () => harness.fixture.whenStable()
    return { harness, root, settle }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function row(root: ParentNode, id: number): HTMLElement {
    return root.querySelector(`[data-testid="import.row"][data-id="${id}"]`) as HTMLElement
  }

  function button(root: ParentNode, testId: string): HTMLButtonElement {
    return root.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_the_header_summarises_the_batch_and_its_rows_by_state', async () => {
    const { root } = await open()

    expect(text(root, '[data-testid="import.review.subtitle"]')).toBe(
      'NAB Everyday · 1–27 Sept · 5 rows'
    )
    expect(text(root, '[data-testid="import.review.summary"]')).toBe(
      '1 auto 1 to review 1 new 1 duplicate 1 ignored'
    )
  })

  it('test_rows_show_the_three_states_with_their_category_source_and_word', async () => {
    const { root } = await open()

    expect(row(root, 1).dataset['tone']).toBe('auto')
    expect(text(row(root, 1), '[data-testid="import.row.meta"]')).toBe(
      'Sun 27 Sept · Groceries · Bank'
    )
    expect(text(row(root, 1), '[data-testid="import.row.status"]')).toBe('Auto')

    expect(row(root, 2).dataset['tone']).toBe('doubtful')
    expect(text(row(root, 2), '[data-testid="import.row.meta"]')).toBe('Sun 27 Sept · AI 61%')
    expect(text(row(root, 2), '[data-testid="import.row.status"]')).toBe('Review')
    expect(text(root, '[data-testid="import.row.suggestion"]')).toBe('Rent ?')

    expect(row(root, 3).dataset['tone']).toBe('new')
    expect(text(row(root, 3), '[data-testid="import.row.meta"]')).toBe(
      'Sun 27 Sept · Uncategorised'
    )
    expect(text(row(root, 3), '[data-testid="import.row.status"]')).toBe('New')
    expect(text(row(root, 4), '[data-testid="import.row.status"]')).toBe('Ignored')
  })

  it('test_accepting_a_suggestion_inline_saves_it_and_settles_the_row', async () => {
    const { root, settle } = await open()

    button(root, 'import.row.accept').click()
    await settle()

    expect(api.decide).toHaveBeenCalledWith(7, 2, { categoryId: 10 })
    await vi.waitFor(() => expect(row(root, 2).dataset['tone']).toBe('auto'))
    expect(text(row(root, 2), '[data-testid="import.row.status"]')).toBe('Ready')
  })

  it('test_the_filter_shows_only_the_rows_to_review', async () => {
    const { root, settle } = await open()

    ;[...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((item) => item.textContent?.trim() === 'To review')
      ?.click()
    await settle()

    expect(
      [...root.querySelectorAll<HTMLElement>('[data-testid="import.row"]')].map(
        (item) => item.dataset['id']
      )
    ).toEqual(['2'])
  })

  it('test_ticking_rows_brings_the_bulk_bar_whose_ignore_applies_to_them', async () => {
    const { root, settle } = await open()

    root.querySelector<HTMLInputElement>('input[aria-label^="Select Riverside Deli"]')?.click()
    await settle()

    expect(text(root, '[data-testid="import.review.bulk"] [aria-live]')).toBe('1 selected')
    expect(root.querySelector('[data-testid="import.review.footer"]')).toBeNull()
    button(root, 'import.review.bulk.ignore').click()
    await vi.waitFor(() => expect(api.decide).toHaveBeenCalledWith(7, 3, { resolution: 'ignored' }))
    await settle()
    expect(root.querySelector('[data-testid="import.review.bulk"]')).toBeNull()
  })

  it('test_accept_suggested_takes_every_suggestion_waiting', async () => {
    const { root, settle } = await open()

    expect(text(root, '[data-testid="import.review.acceptAll"]')).toBe('Accept suggested (1)')
    button(root, 'import.review.acceptAll').click()
    await settle()

    await vi.waitFor(() => expect(api.decide).toHaveBeenCalledWith(7, 2, { categoryId: 10 }))
  })

  it('test_confirm_waits_while_a_row_needs_a_decision', async () => {
    const { root } = await open([
      anImportRow({ id: 1, resolution: 'needs_confirmation', match: aMatchCandidate() }),
    ])

    expect(button(root, 'import.review.confirm').disabled).toBe(true)
    expect(text(root, '[data-testid="import.review.blocking"]')).toContain(
      '1 movement needs a decision before you confirm.'
    )
  })

  it('test_confirm_sends_the_decisions_and_opens_the_result', async () => {
    const { root, settle } = await open()

    button(root, 'import.review.confirm').click()
    await settle()

    expect(api.confirm).toHaveBeenCalledWith(7, [])
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/import/7/result'))
  })

  it('test_a_row_opens_its_triage_sheet_where_ignore_is_saved', async () => {
    const { root, settle } = await open()

    row(root, 3).click()
    await settle()
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="import.triage.ignore"]')).not.toBeNull()
    )
    expect(text(document, '[data-testid="import.triage.bank"]')).toBe(
      'V1111 27/09 TICKETS*SAMPLE FEST SYDNEY'
    )
    document.querySelector<HTMLButtonElement>('[data-testid="import.triage.ignore"]')?.click()
    await settle()

    expect(api.decide).toHaveBeenCalledWith(7, 3, { resolution: 'ignored' })
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="import.triage.restore"]')).not.toBeNull()
    )
  })

  it('test_cancel_asks_first_then_drops_the_import', async () => {
    const { root, settle } = await open()

    button(root, 'import.review.cancel').click()
    await settle()
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="confirm.yes"]')).not.toBeNull()
    )
    document.querySelector<HTMLButtonElement>('[data-testid="confirm.yes"]')?.click()

    await vi.waitFor(() => expect(api.cancel).toHaveBeenCalledWith(7))
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/import'))
  })
})
