import { DOCUMENT, inject, InjectionToken } from '@angular/core'
import { createTuyau } from '@tuyau/core/client'
import { registry } from '@monkimoney/api/registry'

/**
 * Typed API client generated from the API's Tuyau registry. The API serves
 * this SPA, so requests always go to the current origin (Tuyau needs an
 * absolute base URL, hence `location.origin` instead of an empty string).
 */
export const API = new InjectionToken('TuyauClient', {
  providedIn: 'root',
  factory: () =>
    createTuyau({
      baseUrl: inject(DOCUMENT).location.origin,
      registry,
      headers: { Accept: 'application/json' },
    }),
})
