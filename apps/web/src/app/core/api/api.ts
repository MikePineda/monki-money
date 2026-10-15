import { DOCUMENT, inject, InjectionToken } from '@angular/core'
import type { ApiClient } from './api-client'
import { SessionExpiry } from './session-expiry'

export type { ApiClient } from './api-client'

/**
 * The typed API client generated from the API's Tuyau registry, behind a
 * lazy getter: the first call loads the client chunk, later calls reuse it.
 * The API serves this SPA, so requests always go to the current origin
 * (Tuyau needs an absolute base URL, hence `location.origin`). Every 401 is
 * reported to {@link SessionExpiry}; the session store decides what it means.
 *
 * Usage in data-access classes: `const api = await this.api()`.
 */
export const API = new InjectionToken<() => Promise<ApiClient>>('TuyauClient', {
  providedIn: 'root',
  factory: () => {
    const origin = inject(DOCUMENT).location.origin
    const expiry = inject(SessionExpiry)
    let client: Promise<ApiClient> | undefined
    return () =>
      (client ??= import('./api-client').then(({ createApiClient }) =>
        createApiClient(origin, expiry)
      ))
  },
})
