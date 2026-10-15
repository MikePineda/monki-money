import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { Mock } from 'vitest'
import { aRule } from '../../../testing/import-fixtures'
import { httpError } from '../../../testing/session-fixtures'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { RulesApi } from './data-access/rules.api'
import { RulesStore } from './rules.store'

describe('RulesStore', () => {
  let api: Record<'list' | 'remove' | 'apply', Mock>
  let months: { invalidate: Mock; selectedMonth: () => string }

  async function setup() {
    api = {
      list: vi.fn(async () => [aRule({ id: 1 }), aRule({ id: 2, pattern: 'bean there cafe' })]),
      remove: vi.fn(async () => undefined),
      apply: vi.fn(async () => 3),
    }
    months = { invalidate: vi.fn(), selectedMonth: () => '2026-10' }
    TestBed.configureTestingModule({
      providers: [
        RulesStore,
        { provide: RulesApi, useValue: api },
        { provide: MonthStore, useValue: months },
        { provide: HouseholdDirectory, useValue: { load: vi.fn(async () => undefined) } },
      ],
    })
    const store = TestBed.inject(RulesStore)
    await TestBed.inject(ApplicationRef).whenStable()
    return store
  }

  it('test_loads_the_household_rules', async () => {
    const store = await setup()

    expect(store.rules().map((rule) => rule.id)).toEqual([1, 2])
    expect(store.firstLoad()).toBe(false)
  })

  it('test_a_deleted_rule_leaves_the_list_and_says_so', async () => {
    const store = await setup()

    await expect(store.remove(aRule({ id: 1 }))).resolves.toBe(true)

    expect(api.remove).toHaveBeenCalledWith(1)
    expect(store.rules().map((rule) => rule.id)).toEqual([2])
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('rules.toast.deleted')
  })

  it('test_a_refused_delete_puts_the_rule_back', async () => {
    const store = await setup()
    api.remove.mockRejectedValueOnce(httpError(500))

    await expect(store.remove(aRule({ id: 1 }))).resolves.toBe(false)

    expect(store.rules().map((rule) => rule.id)).toEqual([1, 2])
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('errors.server')
  })

  it('test_applying_a_rule_reports_how_many_movements_it_categorised', async () => {
    const store = await setup()

    await expect(store.apply(aRule({ id: 2 }))).resolves.toBe(3)

    expect(api.apply).toHaveBeenCalledWith(2)
    expect(TestBed.inject(ToastStore).current()).toMatchObject({
      messageKey: 'rules.toast.applied',
      params: { count: 3 },
    })
    expect(months.invalidate).toHaveBeenCalledWith('2026-10')
    expect(store.applying()).toBeNull()
  })

  it('test_a_rule_that_matched_nothing_leaves_the_months_alone', async () => {
    const store = await setup()
    api.apply.mockResolvedValueOnce(0)

    await store.apply(aRule({ id: 2 }))

    expect(months.invalidate).not.toHaveBeenCalled()
  })
})
