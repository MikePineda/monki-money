import { Injectable } from '@angular/core'

/**
 * Bridge between the API client and the session: the client reports every
 * 401 here, and the session store (which owns what "logged in" means)
 * listens. Kept separate so the client does not depend on the store, which
 * itself depends on the client.
 */
@Injectable({ providedIn: 'root' })
export class SessionExpiry {
  private listener: (() => void) | null = null

  /** The session store registers itself once, at boot. */
  listen(listener: () => void): void {
    this.listener = listener
  }

  /** Called by the API client on any 401 answer. */
  notify(): void {
    this.listener?.()
  }
}
