import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { i18nTesting, i18nTestingProviders } from '../../../../../testing/i18n-testing'
import { aGeneratedInsight, anInsight } from '../../../../../testing/insight-fixtures'
import { aUser, httpError } from '../../../../../testing/session-fixtures'
import { SessionStore } from '../../../../core/auth/session.store'
import { LangStore } from '../../../../core/i18n/lang.store'
import { MonthStore } from '../../../../core/month/month.store'
import type { YearMonth } from '../../../../domain/month'
import { APP_LOCALE } from '../../../../shared/ui/app-locale.token'
import { SelectSheetHarness } from '../../../../shared/ui/select-sheet/select-sheet.harness'
import { InsightsApi } from '../../data-access/insights.api'
import { InsightSummaryCardComponent } from './insight-summary-card.component'
import insightsEn from './i18n/en.json'
import insightsEs from './i18n/es.json'

const OCT = '2026-10' as YearMonth
const HOUR = 3_600_000
/** Any state the card rests in (not loading, not writing). */
const SETTLED_STATES = ['missing', 'headline', 'quiet', 'error']
  .map((state) => `[data-testid="month.summary.${state}"]`)
  .join(', ')
/**
 * The card's own scope catalogues, served by the testing loader. Preloaded
 * before the first render, so the component's lazy `import()` of its
 * catalogue never runs: copy is there from the first frame in every language.
 */
const INSIGHTS_SCOPES = { 'insights/en': insightsEn, 'insights/es': insightsEs }

describe('InsightSummaryCardComponent', () => {
  let api: { show: ReturnType<typeof vi.fn>; generate: ReturnType<typeof vi.fn> }

  async function render(options: { stored?: boolean; lang?: 'en' | 'es' } = {}) {
    const lang = options.lang ?? 'en'
    api = {
      show: vi.fn(async (month: string) =>
        options.stored
          ? anInsight({ month, generatedAt: new Date(Date.now() - 2.5 * HOUR).toISOString() })
          : null
      ),
      generate: vi.fn(async (month: string) =>
        aGeneratedInsight({ month, generatedAt: new Date().toISOString() })
      ),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang, scopes: INSIGHTS_SCOPES })],
      providers: [
        i18nTestingProviders(),
        { provide: InsightsApi, useValue: api },
        {
          provide: MonthStore,
          useValue: { revisionOf: () => 0, cached: () => undefined, current: signal(OCT) },
        },
        {
          provide: SessionStore,
          useValue: { user: signal(aUser({ locale: lang })), onClear: () => undefined },
        },
        { provide: LangStore, useValue: { lang: signal(lang) } },
        { provide: APP_LOCALE, useValue: signal(lang === 'es' ? 'es-MX' : 'en-AU') },
      ],
    })
    const fixture = TestBed.createComponent(InsightSummaryCardComponent)
    fixture.componentRef.setInput('month', OCT)
    const root = fixture.nativeElement as HTMLElement
    await settle(fixture, root)
    return { fixture, root }
  }

  /**
   * Waits for the store's first answer. The copy is translated from the
   * first frame (INSIGHTS_SCOPES): the eyebrow must read as text, never as
   * an empty string (a catalogue still loading) or a raw key (a missing one).
   */
  async function settle(
    fixture: { whenStable(): Promise<unknown> },
    root: HTMLElement
  ): Promise<void> {
    await vi.waitFor(() => {
      expect(text(root, '[data-testid="month.summary"] p')).not.toBe('')
      expect(root.textContent).not.toMatch(/insights\./)
      expect(root.querySelector(SETTLED_STATES)).not.toBeNull()
    })
    await fixture.whenStable()
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function generateButton(root: HTMLElement): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>('[data-testid="month.summary.generate"]')
    if (!button) {
      throw new Error('No generate button')
    }
    return button
  }

  it('test_without_a_summary_it_offers_to_generate_one_for_the_month', async () => {
    const { root } = await render()

    expect(text(root, '[data-testid="month.summary.missing"]')).toContain(
      'Get your summary for October'
    )
    expect(generateButton(root).textContent).toContain('Generate summary')
    expect(api.show).toHaveBeenCalledWith(OCT)
  })

  it('test_generate_shows_a_skeleton_then_the_headline_body_and_highlights', async () => {
    const { fixture, root } = await render()
    let finish: () => void = () => undefined
    api.generate.mockImplementationOnce(
      (month: string) =>
        new Promise((resolve) => {
          finish = () => resolve(aGeneratedInsight({ month }))
        })
    )

    generateButton(root).click()
    await fixture.whenStable()
    expect(root.querySelector('[data-testid="month.summary.generating"]')).not.toBeNull()
    expect(text(root, '[data-testid="month.summary.generating"]')).toContain('Writing your summary')

    finish()
    await settle(fixture, root)

    expect(api.generate).toHaveBeenCalledWith(OCT, false)
    expect(text(root, '[data-testid="month.summary.headline"]')).toBe(
      'You kept more than a third of your income this month'
    )
    expect(text(root, '[data-testid="month.summary.body"]')).toBe(
      'Spending stayed below income. Groceries were the biggest category.'
    )
    expect(root.querySelector('[data-testid="month.summary.body"] strong')?.textContent).toBe(
      'below income'
    )
  })

  it('test_highlights_carry_an_icon_and_a_tone_word_never_colour_alone', async () => {
    const { root } = await render({ stored: true })

    const items = [...root.querySelectorAll('[data-testid="month.summary.highlight"]')]
    expect(items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Good news: Net savings were positive',
      'Note: Groceries were the largest expense',
      'Worth a look: Transport spending went up',
    ])
    expect(items.map((item) => item.getAttribute('data-tone'))).toEqual([
      'positive',
      'neutral',
      'warning',
    ])
    expect(items[0]?.querySelector('app-icon')?.className).toContain('text-status-good')
    expect(items[2]?.querySelector('app-icon')?.className).toContain('text-status-warning')
  })

  it('test_a_stored_summary_says_it_was_written_by_ai_and_when', async () => {
    const { root } = await render({ stored: true })

    expect(text(root, '[data-testid="month.summary.updated"]')).toBe(
      'Written by AI · Updated 2 hours ago'
    )
  })

  it('test_regenerate_from_the_overflow_menu_forces_a_new_summary', async () => {
    const { fixture, root } = await render({ stored: true })
    api.generate.mockResolvedValueOnce(aGeneratedInsight({ headline: 'A fresh look at October' }))

    root.querySelector<HTMLButtonElement>('[data-testid="month.summary.menu"]')?.click()
    const sheet =
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(SelectSheetHarness)
    await sheet.choose('Regenerate summary')
    await settle(fixture, root)

    expect(api.generate).toHaveBeenCalledWith(OCT, true)
    expect(text(root, '[data-testid="month.summary.headline"]')).toBe('A fresh look at October')
  })

  it('test_refusals_show_quiet_messages', async () => {
    const cases: [unknown, string][] = [
      [
        httpError(422, { errors: [{ field: 'month', rule: 'noActivity', message: 'x' }] }),
        'Nothing to summarise for October yet. Add or import transactions first.',
      ],
      [httpError(402, { code: 'E_LLM_QUOTA_EXCEEDED' }), 'AI limit reached for this month'],
      [httpError(503, { code: 'E_INSIGHTS_UNAVAILABLE' }), 'Summaries are not available right now'],
    ]
    for (const [error, message] of cases) {
      TestBed.resetTestingModule()
      const { fixture, root } = await render()
      api.generate.mockRejectedValueOnce(error)

      generateButton(root).click()
      await settle(fixture, root)

      expect(text(root, '[data-testid="month.summary.quiet"]')).toBe(message)
      expect(root.querySelector('[data-testid="month.summary.generate"]')).toBeNull()
    }
  })

  it('test_a_failed_regenerate_keeps_the_summary_and_says_why', async () => {
    const { fixture, root } = await render({ stored: true })
    api.generate.mockRejectedValueOnce(httpError(402, { code: 'E_LLM_QUOTA_EXCEEDED' }))

    root.querySelector<HTMLButtonElement>('[data-testid="month.summary.menu"]')?.click()
    const sheet =
      await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(SelectSheetHarness)
    await sheet.choose('Regenerate summary')
    await settle(fixture, root)

    expect(text(root, '[data-testid="month.summary.headline"]')).toBe(
      'You kept more than a third of your income this month'
    )
    expect(text(root, '[data-testid="month.summary.notice"]')).toBe(
      'AI limit reached for this month. This is the last summary.'
    )
  })

  it('test_copy_follows_the_spanish_catalogue', async () => {
    const { root } = await render({ lang: 'es' })

    expect(text(root, '[data-testid="month.summary.missing"]')).toContain(
      'Obtén el resumen de octubre'
    )
    expect(generateButton(root).textContent).toContain('Generar resumen')
  })
})
