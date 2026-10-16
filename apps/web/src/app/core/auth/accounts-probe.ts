import { Injectable, inject } from '@angular/core'
import { API } from '../api/api'

/**
 * The one accounts read the route guards need (`GET /accounts`: has the
 * owner set the household up yet?). Screens use AccountsApi; this keeps the
 * rest of that data access out of the initial bundle, where the guards run.
 */
@Injectable({ providedIn: 'root' })
export class AccountsProbe {
  private readonly api = inject(API)

  async list() {
    const { data } = await (await this.api()).request('accounts.index', {})
    return data
  }
}
