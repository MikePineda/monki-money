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
import { ImportResults } from '../data-access/import-results'
import ImportResultPage from './result.page'

describe('ImportResultPage', () => {
  let api: ImportsApiMock
  let months: Record<'invalidate' | 'select', Mock>

  async function open(prepare: () => void = () => undefined) {
    api = importsApiMock()
    months = { invalidate: vi.fn(), select: vi.fn() }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'import', children: [] },
            { path: 'import/:id', children: [] },
            { path: 'import/:id/result', component: ImportResultPage },
            { path: 'month/:ym', children: [] },
          ],
          withComponentInputBinding()
        ),
        ...importTestingProviders({ api, months }),
      ],
    })
    prepare()
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/import/7/result')
    const root = harness.fixture.nativeElement as HTMLElement
    await harness.fixture.whenStable()
    return { harness, root }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  it('test_shows_what_confirm_did_and_that_the_ledger_matches_the_bank', async () => {
    const { root } = await open(() =>
      TestBed.inject(ImportResults).remember(
        {
          batchId: 7,
          status: 'completed',
          created: 29,
          matched: 2,
          ignored: 2,
          transfers: 2,
          remaining: 0,
          reconciliation: anImportBatch().reconciliation,
        },
        anImportBatch({ status: 'completed' })
      )
    )
    await vi.waitFor(() => expect(text(root, 'h1')).toBe('Import confirmed'))

    expect(api.show).not.toHaveBeenCalled()
    expect(text(root, '[data-testid="import.result.headline"]')).toBe('29')
    expect(text(root, '[data-testid="import.result.count.matched"]')).toBe('Matched 2')
    expect(text(root, '[data-testid="import.result.reconciliation"]')).toBe(
      'Balanced with the bank: $7,642.75 on 27 Sept 2026.'
    )
  })

  it('test_after_a_reload_the_counts_come_from_the_batch_and_missing_movements_are_named', async () => {
    const { root } = await open(() => {
      api.batch.mockResolvedValue(
        anImportBatch({
          status: 'completed',
          counts: { ...anImportBatch().counts, new: 4, autoMatched: 1 },
          reconciliation: {
            asOf: '2026-09-27',
            expectedBalanceCents: 764275,
            computedBalanceCents: 700000,
            differenceCents: 64275,
            balanced: false,
            openingBalanceCents: null,
            missingBefore: '2026-09-01',
          },
        })
      )
    })
    await vi.waitFor(() => expect(text(root, '[data-testid="import.result.headline"]')).toBe('4'))
    expect(api.batch).toHaveBeenCalledWith(7)
    expect(api.show).not.toHaveBeenCalled()

    expect(text(root, '[data-testid="import.result.reconciliation"]')).toBe(
      '$642.75 away from the bank’s balance. Movements before 1 Sept 2026 are missing: ' +
        'import an older export to fill the gap.'
    )
  })

  it('test_a_batch_still_staged_goes_back_to_its_review', async () => {
    await open(() => api.batch.mockResolvedValue(anImportBatch()))

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/import/7'))
  })

  it('test_view_month_reloads_and_opens_the_month_the_file_ends_in', async () => {
    const { root } = await open(() =>
      api.batch.mockResolvedValue(anImportBatch({ status: 'completed' }))
    )
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="import.result.month"]')).not.toBeNull()
    )

    root.querySelector<HTMLButtonElement>('[data-testid="import.result.month"]')?.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month/2026-09'))
    expect(months.invalidate).toHaveBeenCalledWith('2026-09')
    expect(months.select).toHaveBeenCalledWith('2026-09')
  })
})
