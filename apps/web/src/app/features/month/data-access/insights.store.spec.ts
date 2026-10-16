import { ApplicationRef, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aGeneratedInsight, anInsight } from '../../../../testing/insight-fixtures'
import { aUser, httpError, networkError } from '../../../../testing/session-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { LangStore } from '../../../core/i18n/lang.store'
import type { MonthReport } from '../../../core/ledger/reports.api'
import { MonthStore } from '../../../core/month/month.store'
import type { YearMonth } from '../../../domain/month'
import { InsightsApi } from './insights.api'
import { InsightsStore } from './insights.store'

const OCT = '2026-10' as YearMonth
const SEP = '2026-09' as YearMonth

describe('InsightsStore', () => {
  let api: { show: ReturnType<typeof vi.fn>; generate: ReturnType<typeof vi.fn> }
  let revisions: ReturnType<typeof signal<ReadonlyMap<string, number>>>
  let user: ReturnType<typeof signal<ReturnType<typeof aUser>>>
  let clearHooks: (() => void)[]

  /** `flags`: what the month report (in the MonthStore's memory) says about each month's summary. */
  function setup(
    options: { stored?: boolean; flags?: Record<string, MonthReport['insight']> } = {}
  ) {
    api = {
      show: vi.fn(async (month: string) =>
        options.stored === false ? null : anInsight({ month, headline: `Summary of ${month}` })
      ),
      generate: vi.fn(async (month: string) =>
        aGeneratedInsight({ month, headline: `Fresh summary of ${month}` })
      ),
    }
    revisions = signal<ReadonlyMap<string, number>>(new Map())
    user = signal(aUser({ locale: 'en' }))
    clearHooks = []
    TestBed.configureTestingModule({
      providers: [
        { provide: InsightsApi, useValue: api },
        {
          provide: MonthStore,
          useValue: {
            revisionOf: (month: string) => revisions().get(month) ?? 0,
            cached: (month: string) => {
              const insight = options.flags?.[month]
              return insight ? { month, report: { insight } } : undefined
            },
          },
        },
        {
          provide: SessionStore,
          useValue: { user, onClear: (hook: () => void) => clearHooks.push(hook) },
        },
        { provide: LangStore, useValue: { lang: signal('en') } },
      ],
    })
    const store = TestBed.inject(InsightsStore)
    store.show(OCT)
    return store
  }

  async function settle(): Promise<void> {
    TestBed.tick()
    await TestBed.inject(ApplicationRef).whenStable()
  }

  function headline(store: InsightsStore): string | null {
    const view = store.view()
    return view.status === 'ready' ? view.insight.headline : null
  }

  it('test_a_stored_summary_is_shown_for_the_month', async () => {
    const store = setup()
    expect(store.view().status).toBe('loading')

    await settle()

    expect(headline(store)).toBe('Summary of 2026-10')
    expect(api.show).toHaveBeenCalledWith(OCT)
  })

  it('test_a_month_without_a_summary_offers_to_generate_it', async () => {
    const store = setup({ stored: false })

    await settle()

    expect(store.view()).toEqual({ status: 'missing' })
  })

  it('test_a_month_the_report_says_has_no_summary_skips_the_request', async () => {
    const store = setup({ flags: { [OCT]: { available: false, generatedAt: null, locale: 'en' } } })

    await settle()

    expect(store.view()).toEqual({ status: 'missing' })
    expect(api.show).not.toHaveBeenCalled()
  })

  it('test_a_month_the_report_says_has_a_summary_reads_it', async () => {
    const store = setup({
      flags: { [OCT]: { available: true, generatedAt: '2026-11-01T08:00:00.000Z', locale: 'en' } },
    })

    await settle()

    expect(api.show).toHaveBeenCalledExactlyOnceWith(OCT)
    expect(headline(store)).toBe('Summary of 2026-10')
  })

  it('test_a_report_flag_about_another_language_still_asks_the_api', async () => {
    const store = setup({ flags: { [OCT]: { available: false, generatedAt: null, locale: 'es' } } })

    await settle()

    expect(api.show).toHaveBeenCalledExactlyOnceWith(OCT)
    expect(headline(store)).toBe('Summary of 2026-10')
  })

  it('test_generating_shows_progress_then_the_new_summary', async () => {
    const store = setup({ stored: false })
    await settle()
    let finish: () => void = () => undefined
    api.generate.mockImplementationOnce(
      (month: string) =>
        new Promise((resolve) => {
          finish = () => resolve(aGeneratedInsight({ month, headline: 'Written now' }))
        })
    )

    const running = store.generate()
    expect(store.view()).toEqual({ status: 'generating' })
    finish()
    await running

    expect(api.generate).toHaveBeenCalledWith(OCT, false)
    expect(headline(store)).toBe('Written now')
  })

  it('test_regenerate_forces_a_new_summary', async () => {
    const store = setup()
    await settle()

    await store.generate(true)

    expect(api.generate).toHaveBeenCalledWith(OCT, true)
    expect(headline(store)).toBe('Fresh summary of 2026-10')
  })

  it('test_refusals_become_quiet_states', async () => {
    const store = setup({ stored: false })
    await settle()
    const cases = [
      {
        error: httpError(422, {
          errors: [{ field: 'month', rule: 'noActivity', message: 'No activity' }],
        }),
        status: 'noActivity',
      },
      {
        error: httpError(422, { errors: [{ field: 'month', rule: 'future', message: 'Future' }] }),
        status: 'future',
      },
      { error: httpError(402, { code: 'E_LLM_QUOTA_EXCEEDED' }), status: 'quota' },
      { error: httpError(503, { code: 'E_INSIGHTS_UNAVAILABLE' }), status: 'unavailable' },
    ]

    for (const { error, status } of cases) {
      api.generate.mockRejectedValueOnce(error)
      await store.generate()
      expect(store.view()).toEqual({ status })
    }
  })

  it('test_a_failed_first_generation_offers_to_try_again', async () => {
    const store = setup({ stored: false })
    await settle()
    api.generate.mockRejectedValueOnce(networkError())

    await store.generate(true)
    expect(store.view()).toEqual({ status: 'error', retry: 'generate' })

    await store.retry()
    await settle()
    expect(api.generate).toHaveBeenLastCalledWith(OCT, true)
    expect(headline(store)).toBe('Fresh summary of 2026-10')
  })

  it('test_a_failed_regenerate_keeps_the_summary_with_a_notice', async () => {
    const store = setup()
    await settle()
    api.generate.mockRejectedValueOnce(httpError(402, { code: 'E_LLM_QUOTA_EXCEEDED' }))

    await store.generate(true)

    expect(store.view()).toMatchObject({ status: 'ready', notice: 'quota' })
    expect(headline(store)).toBe('Summary of 2026-10')
  })

  it('test_switching_months_loads_the_matching_summary_and_reuses_the_cache', async () => {
    const store = setup()
    await settle()
    store.show(SEP)
    await settle()
    expect(headline(store)).toBe('Summary of 2026-09')

    store.show(OCT)
    await settle()

    expect(headline(store)).toBe('Summary of 2026-10')
    expect(api.show).toHaveBeenCalledTimes(2)
  })

  it('test_a_generated_summary_survives_a_month_switch', async () => {
    const store = setup({ stored: false })
    await settle()
    await store.generate()
    store.show(SEP)
    await settle()

    store.show(OCT)
    await settle()

    expect(headline(store)).toBe('Fresh summary of 2026-10')
    expect(api.show).toHaveBeenCalledTimes(2)
  })

  it('test_a_ledger_change_in_the_month_drops_its_cached_summary', async () => {
    const store = setup({ stored: false })
    await settle()
    api.generate.mockRejectedValueOnce(
      httpError(422, { errors: [{ field: 'month', rule: 'noActivity', message: 'None' }] })
    )
    await store.generate()
    expect(store.view()).toEqual({ status: 'noActivity' })

    revisions.set(new Map([[OCT, 1]]))
    await settle()

    expect(api.show).toHaveBeenCalledTimes(2)
    expect(store.view()).toEqual({ status: 'missing' })
  })

  it('test_a_language_change_refetches_in_the_new_language', async () => {
    const store = setup()
    await settle()
    api.show.mockImplementationOnce(async (month: string) =>
      anInsight({ month, locale: 'es', headline: 'Resumen' })
    )

    user.set(aUser({ locale: 'es' }))
    await settle()

    expect(api.show).toHaveBeenCalledTimes(2)
    expect(headline(store)).toBe('Resumen')
  })

  it('test_a_failed_load_offers_a_retry', async () => {
    const store = setup()
    api.show.mockRejectedValueOnce(networkError())
    await settle()
    expect(store.view()).toEqual({ status: 'error', retry: 'load' })

    await store.retry()
    await settle()

    expect(headline(store)).toBe('Summary of 2026-10')
  })

  it('test_logout_forgets_every_summary', async () => {
    const store = setup()
    await settle()

    clearHooks.forEach((hook) => hook())
    store.show(OCT)
    await settle()

    expect(api.show).toHaveBeenCalledTimes(2)
  })
})
