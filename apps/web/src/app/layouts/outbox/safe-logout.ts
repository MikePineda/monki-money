import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { SessionStore } from '../../core/auth/session.store'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { BottomSheetService } from '../../shared/ui/bottom-sheet/bottom-sheet.service'
import { LogoutWarningSheetComponent, type LogoutChoice } from './logout-warning-sheet.component'

/**
 * The explicit "Log out": straight away when nothing waits in the offline
 * outbox, otherwise only after the warning sheet (an explicit logout
 * deletes the outbox from this device, so its entries would be lost).
 * Resolves once the session ended or the person chose to stay.
 */
@Injectable({ providedIn: 'root' })
export class SafeLogout {
  private readonly outbox = inject(OutboxStore)
  private readonly session = inject(SessionStore)
  private readonly sheets = inject(BottomSheetService)

  async logout(): Promise<void> {
    if (this.outbox.entries().length > 0) {
      const sheet = this.sheets.open<LogoutChoice>(LogoutWarningSheetComponent)
      if ((await firstValueFrom(sheet.closed)) !== 'logout') {
        return
      }
    }
    await this.session.logout()
  }
}
