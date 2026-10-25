import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { SessionStore } from '../../core/auth/session.store'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { BottomSheetService } from '../../shared/ui/bottom-sheet/bottom-sheet.service'
import { LogoutWarningSheetComponent, type LogoutChoice } from './logout-warning-sheet.component'

/**
 * Every explicit logout of the app (More's "Log out", the invitation's
 * "wrong account", the deleted-household and create-household screens):
 * straight away when nothing waits in the offline outbox, otherwise only
 * after the warning sheet (an explicit logout deletes the outbox from this
 * device, so its entries would be lost). It guards `SessionStore.logout()`
 * itself (`guardLogouts`, called once at start by `outbox-startup.ts`), so
 * screens keep calling the session's logout.
 */
@Injectable({ providedIn: 'root' })
export class SafeLogout {
  private readonly outbox = inject(OutboxStore)
  private readonly session = inject(SessionStore)
  private readonly sheets = inject(BottomSheetService)
  private guarding = false

  /** From now on every `SessionStore.logout()` asks first while entries wait. */
  guardLogouts(): void {
    if (this.guarding) {
      return
    }
    this.guarding = true
    this.session.confirmLogout(() => this.confirm())
  }

  /** Logs out, guarded; resolves with whether the session ended. */
  logout(): Promise<boolean> {
    this.guardLogouts()
    return this.session.logout()
  }

  /** Nothing would be lost, or the person chose to log out (after "Sync now" or anyway). */
  async confirm(): Promise<boolean> {
    if (this.outbox.entries().length === 0) {
      return true
    }
    const sheet = this.sheets.open<LogoutChoice>(LogoutWarningSheetComponent)
    return (await firstValueFrom(sheet.closed)) === 'logout'
  }
}
