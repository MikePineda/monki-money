import type { Injector } from '@angular/core'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { SafeLogout } from './safe-logout'

/**
 * Loaded beside the first route (app.config.ts, dynamic import): the
 * offline outbox follows the session and syncs, and every explicit logout
 * of the app warns first while entries wait (SafeLogout).
 */
export function startOutbox(injector: Injector): void {
  injector.get(OutboxStore).start()
  injector.get(SafeLogout).guardLogouts()
}
