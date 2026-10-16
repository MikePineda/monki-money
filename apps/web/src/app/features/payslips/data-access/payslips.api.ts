import { Injectable, inject } from '@angular/core'
import { API } from '../../../core/api/api'
import type { Payslip } from '../../../core/api/api-types'
import type { PayoutCandidate, PayslipBody } from '../../../domain/payslip-draft'

/**
 * Data access for payslips: payouts recorded in the account they arrived
 * in (an umbrella service's wallet). There is no update: a payslip is
 * deleted and recorded again. Another household's id is a 404.
 */
@Injectable({ providedIn: 'root' })
export class PayslipsApi {
  private readonly api = inject(API)

  /** `GET /payslips?accountId=`: newest first, with their rows and transfer. */
  async list(accountId: number): Promise<Payslip[]> {
    const { data } = await (await this.api()).request('payslips.index', { query: { accountId } })
    return data
  }

  /** Transfers leaving the account that no payslip explains yet, newest first. */
  async candidates(accountId: number): Promise<PayoutCandidate[]> {
    const { data } = await (
      await this.api()
    ).request('payslips.candidates', { query: { accountId } })
    return data
  }

  async create(body: PayslipBody): Promise<Payslip> {
    const { data } = await (await this.api()).request('payslips.store', { body })
    return data
  }

  /** Its rows go; the transfer stays and can be linked again. */
  async remove(id: number): Promise<void> {
    await (await this.api()).request('payslips.destroy', { params: { id } })
  }
}
