import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aPayslip } from '../../../testing/payslip-fixtures'
import { httpError, networkError } from '../../../testing/session-fixtures'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { PayslipsApi } from './data-access/payslips.api'
import { PayslipsStore } from './payslips.store'

describe('PayslipsStore', () => {
  let api: { list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
  let toasts: { show: ReturnType<typeof vi.fn> }
  let month: { invalidateDate: ReturnType<typeof vi.fn> }

  function setup() {
    api = {
      list: vi.fn(async () => [
        aPayslip({ id: 2, date: '2026-09-30' }),
        aPayslip({ id: 1, date: '2026-08-31' }),
      ]),
      remove: vi.fn(async () => undefined),
    }
    toasts = { show: vi.fn() }
    month = { invalidateDate: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        PayslipsStore,
        { provide: PayslipsApi, useValue: api },
        { provide: ToastStore, useValue: toasts },
        { provide: MonthStore, useValue: month },
      ],
    })
    return TestBed.inject(PayslipsStore)
  }

  async function settle(): Promise<void> {
    TestBed.tick()
    await TestBed.inject(ApplicationRef).whenStable()
  }

  it('test_waits_for_the_account_then_loads_its_payslips', async () => {
    const store = setup()
    expect(store.status()).toBe('idle')

    store.accountId.set(3)
    await settle()

    expect(api.list).toHaveBeenCalledWith(3)
    expect(store.status()).toBe('ready')
    expect(store.payslips().map((payslip) => payslip.id)).toEqual([2, 1])
  })

  it('test_a_failed_load_is_an_error_and_retry_reads_again', async () => {
    const store = setup()
    api.list.mockRejectedValueOnce(networkError())
    store.accountId.set(3)
    await settle()
    expect(store.status()).toBe('error')

    store.retry()
    await settle()

    expect(store.status()).toBe('ready')
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('test_deleting_drops_the_payslip_refreshes_its_month_and_says_so', async () => {
    const store = setup()
    store.accountId.set(3)
    await settle()

    const removed = await store.remove(store.payslips()[1]!)

    expect(removed).toBe(true)
    expect(api.remove).toHaveBeenCalledWith(1)
    expect(store.payslips().map((payslip) => payslip.id)).toEqual([2])
    expect(month.invalidateDate).toHaveBeenCalledWith('2026-08-31')
    expect(toasts.show).toHaveBeenCalledWith({ messageKey: 'payslips.deleted', status: 'good' })
  })

  it('test_a_refused_delete_keeps_the_payslip_and_shows_why', async () => {
    const store = setup()
    store.accountId.set(3)
    await settle()
    api.remove.mockRejectedValueOnce(httpError(500))

    const removed = await store.remove(store.payslips()[0]!)

    expect(removed).toBe(false)
    expect(store.payslips()).toHaveLength(2)
    expect(month.invalidateDate).not.toHaveBeenCalled()
    expect(toasts.show).toHaveBeenCalledWith(expect.objectContaining({ status: 'critical' }))
  })
})
