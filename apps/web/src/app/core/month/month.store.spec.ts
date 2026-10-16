import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { aMonthReport, aTransaction, aTrendReport } from '../../../testing/ledger-fixtures'
import { networkError } from '../../../testing/session-fixtures'
import { currentMonthIn, type YearMonth } from '../../domain/month'
import { SessionStore } from '../auth/session.store'
import { ReportsApi } from '../ledger/reports.api'
import { TransactionsApi } from '../ledger/transactions.api'
import { HOUSEHOLD_TIME_ZONE } from '../platform/time-zone.token'
import { MONTH_CACHE_SIZE, MonthStore, coversMonth } from './month.store'

const OCT = '2026-10' as YearMonth
const SEP = '2026-09' as YearMonth
const AUG = '2026-08' as YearMonth

describe('coversMonth', () => {
  it('test_a_month_covers_itself_and_the_five_before_it', () => {
    expect(coversMonth(OCT, OCT)).toBe(true)
    expect(coversMonth(OCT, '2026-05' as YearMonth)).toBe(true)
    expect(coversMonth(OCT, '2026-04' as YearMonth)).toBe(false)
    expect(coversMonth(SEP, OCT)).toBe(false)
  })
})

describe('MonthStore', () => {
  let reports: { month: ReturnType<typeof vi.fn>; trend: ReturnType<typeof vi.fn> }
  let transactions: { list: ReturnType<typeof vi.fn> }
  let clearHooks: (() => void)[]

  function setup() {
    reports = {
      month: vi.fn(async (month: YearMonth) =>
        aMonthReport(month, { expenseCents: Number(month.slice(5)) * 100 })
      ),
      trend: vi.fn(async (month: YearMonth) => aTrendReport(month)),
    }
    transactions = { list: vi.fn(async () => [aTransaction()]) }
    clearHooks = []
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ReportsApi, useValue: reports },
        { provide: TransactionsApi, useValue: transactions },
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
        {
          provide: SessionStore,
          useValue: { onClear: (hook: () => void) => clearHooks.push(hook) },
        },
      ],
    })
    const store = TestBed.inject(MonthStore)
    store.select(OCT)
    return store
  }

  /** Runs the resource's effect, then waits for its load to finish. */
  async function settle(): Promise<void> {
    TestBed.tick()
    await TestBed.inject(ApplicationRef).whenStable()
  }

  it('test_loads_the_selected_month_with_its_trend_and_top_expenses', async () => {
    const store = setup()

    await settle()

    expect(store.status()).toBe('ready')
    expect(store.frame()?.month).toBe(OCT)
    expect(store.frame()?.report.expenseCents).toBe(1000)
    expect(reports.trend).toHaveBeenCalledWith(OCT, 6)
    expect(transactions.list).toHaveBeenCalledWith({
      month: OCT,
      kind: 'expense',
      sort: 'amount',
      perPage: 5,
    })
  })

  it('test_a_cached_month_is_served_without_another_request', async () => {
    const store = setup()
    await settle()
    store.select(SEP)
    await settle()

    store.select(OCT)
    await settle()

    expect(reports.month).toHaveBeenCalledTimes(2)
    expect(store.frame()?.month).toBe(OCT)
  })

  it('test_invalidate_reloads_the_selected_month', async () => {
    const store = setup()
    await settle()

    store.invalidate(OCT)
    await settle()

    expect(reports.month).toHaveBeenCalledTimes(2)
    expect(store.status()).toBe('ready')
  })

  it('test_invalidate_drops_every_cached_month_whose_trend_covers_it', async () => {
    const store = setup()
    await settle()
    store.select(SEP)
    await settle()
    store.select(AUG)
    await settle()

    store.invalidate(SEP)
    await settle()
    store.select(OCT)
    await settle()
    store.select(AUG)
    await settle()

    // Aug (before Sep) stays cached; Oct (its trend includes Sep) is fetched again.
    expect(reports.month.mock.calls.map(([month]) => month)).toEqual([OCT, SEP, AUG, OCT])
  })

  it('test_reloading_keeps_the_previous_frame', async () => {
    const store = setup()
    await settle()
    let release: () => void = () => undefined
    reports.month.mockImplementationOnce(
      (month: YearMonth) =>
        new Promise((resolve) => {
          release = () => resolve(aMonthReport(month))
        })
    )

    store.select(SEP)
    TestBed.tick()

    expect(store.status()).toBe('reloading')
    expect(store.frame()?.month).toBe(OCT)
    release()
    await settle()
    expect(store.frame()?.month).toBe(SEP)
  })

  it('test_first_load_has_no_frame', () => {
    const store = setup()
    TestBed.tick()

    expect(store.status()).toBe('loading')
    expect(store.frame()).toBeUndefined()
  })

  it('test_a_failure_is_an_error_state_that_can_be_retried', async () => {
    const store = setup()
    reports.month.mockRejectedValueOnce(networkError())
    await settle()

    expect(store.status()).toBe('error')

    store.retry()
    await settle()
    expect(store.status()).toBe('ready')
  })

  it('test_keeps_at_most_six_months_in_memory', async () => {
    const store = setup()
    const months = ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']
    for (const month of months) {
      store.select(month as YearMonth)
      await settle()
    }

    store.select(OCT)
    await settle()

    expect(MONTH_CACHE_SIZE).toBe(6)
    expect(reports.month).toHaveBeenCalledTimes(8)
  })

  it('test_starts_on_the_current_month_of_the_household', () => {
    const store = setup()
    const now = currentMonthIn('Australia/Brisbane')

    expect(store.current()).toBe(now)
    expect(store.selectedMonth()).toBe(OCT)
  })

  it('test_invalidating_a_month_bumps_only_that_month_revision', () => {
    const store = setup()
    const october = store.revision(OCT)
    const september = store.revision(SEP)

    store.invalidate(OCT)

    expect(october()).toBe(1)
    expect(september()).toBe(0)
  })

  it('test_the_ledger_revision_moves_with_a_change_in_any_month', () => {
    const store = setup()
    expect(store.ledgerRevision()).toBe(0)

    store.invalidate(OCT)
    store.invalidate(AUG)
    store.invalidate(OCT)

    expect(store.ledgerRevision()).toBe(3)
  })

  it('test_invalidate_of_a_date_reaches_its_month', () => {
    const store = setup()
    const revision = store.revision(SEP)

    store.invalidateDate('2026-09-30')

    expect(revision()).toBe(1)
  })

  it('test_logout_returns_to_the_current_month', () => {
    const store = setup()
    store.selectedMonth.set(AUG)

    for (const hook of clearHooks) hook()

    expect(store.selectedMonth()).toBe(currentMonthIn('Australia/Brisbane'))
  })

  it('test_logout_forgets_every_month', async () => {
    const store = setup()
    await settle()

    for (const hook of clearHooks) hook()
    store.select(OCT)
    store.retry()
    await settle()

    expect(reports.month).toHaveBeenCalledTimes(2)
  })
})
