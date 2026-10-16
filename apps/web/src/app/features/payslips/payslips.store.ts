import { Injectable, computed, inject, linkedSignal, resource, signal } from '@angular/core'
import type { Payslip } from '../../core/api/api-types'
import { failureMessage } from '../../core/api/error-messages'
import { toApiError } from '../../core/api/http-errors'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { PayslipsApi } from './data-access/payslips.api'

export type PayslipsStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * The payslips of one account (newest first) and their deletion. Deleting
 * drops the payslip from the list at once, says so in a toast and marks
 * its month as changed so the Month view reloads; a refusal keeps it and
 * says why. Provided by the list page, so every visit reads fresh data.
 */
@Injectable()
export class PayslipsStore {
  private readonly api = inject(PayslipsApi)
  private readonly toasts = inject(ToastStore)
  private readonly month = inject(MonthStore)

  /** The account whose payslips are listed (from the route). */
  readonly accountId = signal<number | null>(null)
  private readonly attempt = signal(0)
  private readonly deleting = signal<number | null>(null)

  private readonly list = resource({
    params: () => {
      const accountId = this.accountId()
      return accountId === null ? undefined : { accountId, attempt: this.attempt() }
    },
    loader: ({ params }) => this.api.list(params.accountId),
  })

  readonly payslips = linkedSignal<Payslip[]>(() => (this.list.hasValue() ? this.list.value() : []))

  readonly status = computed<PayslipsStatus>(() => {
    if (this.accountId() === null) {
      return 'idle'
    }
    if (this.list.isLoading()) {
      return 'loading'
    }
    return this.list.status() === 'error' ? 'error' : 'ready'
  })

  /** True while a delete is on its way (buttons wait). */
  readonly busy = computed(() => this.deleting() !== null)

  retry(): void {
    this.attempt.update((value) => value + 1)
  }

  /** Deletes the payslip; resolves true once the API agreed. */
  async remove(payslip: Payslip): Promise<boolean> {
    if (this.deleting() !== null) {
      return false
    }
    this.deleting.set(payslip.id)
    try {
      await this.api.remove(payslip.id)
      this.payslips.update((list) => list.filter((item) => item.id !== payslip.id))
      this.month.invalidateDate(payslip.date)
      this.toasts.show({ messageKey: 'payslips.deleted', status: 'good' })
      return true
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind !== 'unauthorized') {
        const message = failureMessage(failure)
        this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
      }
      return false
    } finally {
      this.deleting.set(null)
    }
  }
}
