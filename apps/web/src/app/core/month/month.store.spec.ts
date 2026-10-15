import { TestBed } from '@angular/core/testing'
import type { YearMonth } from '../../domain/month'
import { SessionStore } from '../auth/session.store'
import { HOUSEHOLD_TIME_ZONE } from '../platform/time-zone.token'
import { MonthStore } from './month.store'

const ym = (value: string) => value as YearMonth

describe('MonthStore', () => {
  let clearHooks: (() => void)[]

  function createStore(): MonthStore {
    clearHooks = []
    TestBed.configureTestingModule({
      providers: [
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
        {
          provide: SessionStore,
          useValue: { onClear: (hook: () => void) => clearHooks.push(hook) },
        },
      ],
    })
    return TestBed.inject(MonthStore)
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-15T02:00:00.000Z') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('test_starts_on_the_current_month_of_the_household', () => {
    const store = createStore()

    expect(store.current()).toBe('2026-10')
    expect(store.selectedMonth()).toBe('2026-10')
  })

  it('test_invalidating_a_month_bumps_only_that_month_revision', () => {
    const store = createStore()
    const october = store.revision(ym('2026-10'))
    const september = store.revision(ym('2026-09'))

    store.invalidate(ym('2026-10'))

    expect(october()).toBe(1)
    expect(september()).toBe(0)
  })

  it('test_invalidate_of_a_date_reaches_its_month', () => {
    const store = createStore()
    const revision = store.revision(ym('2026-09'))

    store.invalidateDate('2026-09-30')

    expect(revision()).toBe(1)
  })

  it('test_logout_returns_to_the_current_month', () => {
    const store = createStore()
    store.selectedMonth.set(ym('2026-08'))

    clearHooks.forEach((hook) => hook())

    expect(store.selectedMonth()).toBe('2026-10')
  })
})
