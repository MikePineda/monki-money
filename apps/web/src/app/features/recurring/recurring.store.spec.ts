import { ApplicationRef, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { Mock } from 'vitest'
import { aRecurringItem } from '../../../testing/recurring-fixtures'
import { httpError, validationError } from '../../../testing/session-fixtures'
import type { RecurringItem } from '../../core/api/api-types'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { RecurringApi } from '../../core/ledger/recurring.api'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { RecurringStore } from './recurring.store'

const PHONE = aRecurringItem({
  id: 2,
  payee: 'Telco One',
  cadence: 'monthly',
  amountCents: 6_500,
  nextExpectedDate: '2026-10-28',
})
const GYM = aRecurringItem({ id: 3, payee: 'Pulse Gym', status: 'paused' })

describe('RecurringStore', () => {
  let api: Record<'list' | 'create' | 'update' | 'remove' | 'detect' | 'merchants', Mock>
  let months: { invalidate: Mock; current: () => string }

  async function setup(items: RecurringItem[] = [aRecurringItem(), PHONE, GYM]) {
    api = {
      list: vi.fn(async () => items),
      create: vi.fn(async (body) => aRecurringItem({ id: 9, ...body, source: 'manual' })),
      update: vi.fn(async (id: number, body) => ({
        ...items.find((item) => item.id === id)!,
        ...body,
      })),
      remove: vi.fn(async () => undefined),
      detect: vi.fn(async () => ({ created: 2, updated: 1 })),
      merchants: vi.fn(async () => []),
    }
    months = { invalidate: vi.fn(), current: signal('2026-10') }
    TestBed.configureTestingModule({
      providers: [
        RecurringStore,
        { provide: RecurringApi, useValue: api },
        { provide: MonthStore, useValue: months },
        { provide: HouseholdDirectory, useValue: { load: vi.fn(async () => undefined) } },
      ],
    })
    const store = TestBed.inject(RecurringStore)
    await TestBed.inject(ApplicationRef).whenStable()
    return store
  }

  const toast = () => TestBed.inject(ToastStore).current()
  const settled = () => TestBed.inject(ApplicationRef).whenStable()

  it('test_items_are_grouped_by_status', async () => {
    const store = await setup()

    expect(store.sections().active.map((item) => item.id)).toEqual([1, 2])
    expect(store.sections().paused.map((item) => item.id)).toEqual([3])
    expect(store.isEmpty()).toBe(false)
  })

  it('test_detecting_says_what_it_found_and_refreshes_the_month', async () => {
    const store = await setup()

    await store.detect()
    await settled()

    expect(api.detect).toHaveBeenCalledTimes(1)
    expect(toast()).toMatchObject({ messageKey: 'recurring.toast.found', params: { count: 2 } })
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(months.invalidate).toHaveBeenCalledWith('2026-10')
    expect(store.detecting()).toBe(false)
  })

  it('test_pausing_moves_the_item_at_once_and_says_why', async () => {
    const store = await setup()

    await store.act(PHONE, 'pause')

    expect(api.update).toHaveBeenCalledWith(2, { status: 'paused' })
    expect(store.sections().paused.map((item) => item.id)).toEqual([2, 3])
    expect(toast()).toMatchObject({
      messageKey: 'recurring.toast.paused',
      params: { payee: 'Telco One' },
    })
    expect(months.invalidate).toHaveBeenCalledWith('2026-10')
  })

  it('test_a_refused_status_change_puts_the_item_back', async () => {
    const store = await setup()
    api.update.mockRejectedValueOnce(httpError(500))

    await store.act(aRecurringItem(), 'dismiss')

    expect(store.sections().active.map((item) => item.id)).toEqual([1, 2])
    expect(store.sections().dismissed).toEqual([])
    expect(toast()?.messageKey).toBe('errors.server')
    expect(months.invalidate).not.toHaveBeenCalled()
  })

  it('test_an_edit_sends_only_what_changed_and_reloads_the_list', async () => {
    const store = await setup()

    const errors = await store.save(aRecurringItem(), {
      payee: 'Harbour Lettings',
      cadence: 'weekly',
      amountCents: 52_000,
      nextExpectedDate: '2026-10-20',
      categoryId: 10,
      paidByUserId: 2,
      merchantKey: null,
    })
    await settled()

    expect(errors).toBeNull()
    expect(api.update).toHaveBeenCalledWith(1, { amountCents: 52_000, paidByUserId: 2 })
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(toast()).toMatchObject({ messageKey: 'recurring.toast.saved' })
  })

  it('test_a_new_item_is_created_and_its_field_errors_come_back_to_the_sheet', async () => {
    const store = await setup([])
    const draft = {
      payee: ' Telco One ',
      cadence: 'monthly' as const,
      amountCents: 6_500,
      nextExpectedDate: '2026-10-28',
      categoryId: null,
      paidByUserId: null,
      merchantKey: null,
    }

    await expect(store.save(undefined, draft)).resolves.toBeNull()
    expect(api.create).toHaveBeenCalledWith({
      payee: 'Telco One',
      cadence: 'monthly',
      amountCents: 6_500,
      nextExpectedDate: '2026-10-28',
      categoryId: null,
      paidByUserId: null,
    })

    api.create.mockRejectedValueOnce(
      validationError({ payee: 'This merchant already has a recurring payment' })
    )
    await expect(store.save(undefined, draft)).resolves.toEqual({
      payee: 'This merchant already has a recurring payment',
    })
  })

  it('test_nothing_changed_sends_nothing', async () => {
    const store = await setup()
    const item = aRecurringItem()

    await expect(store.save(item, { ...item, merchantKey: null })).resolves.toBeNull()

    expect(api.update).not.toHaveBeenCalled()
  })

  it('test_merchants_to_offer_load_on_demand_and_never_fail_the_sheet', async () => {
    const store = await setup()
    const merchant = {
      merchantKey: 'telco one',
      payee: 'Telco One',
      amountCents: 6_500,
      lastPaidDate: '2026-10-03',
      count: 3,
    }
    api.merchants.mockResolvedValueOnce([merchant])

    await store.loadMerchants()
    expect(store.merchants()).toEqual([merchant])

    api.merchants.mockRejectedValueOnce(httpError(500))
    await store.loadMerchants()
    expect(store.merchants()).toEqual([])
  })
})
