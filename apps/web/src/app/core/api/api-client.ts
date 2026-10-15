import { createTuyau } from '@tuyau/core/client'
import { registry } from '@monkimoney/api/registry'
import type { SessionExpiry } from './session-expiry'

/**
 * Builds the typed Tuyau client from the API's registry. Loaded lazily (see
 * api.ts) so the client, ky and the route registry stay out of the initial
 * bundle.
 */
export function createApiClient(baseUrl: string, expiry: SessionExpiry) {
  return createTuyau({
    baseUrl,
    registry,
    headers: { Accept: 'application/json' },
    // Never retry on our own: a throttled call (429) would otherwise wait for
    // Retry-After, and screens offer an explicit "Try again" instead.
    retry: 0,
    hooks: {
      afterResponse: [
        (_request, _options, response) => {
          if (response.status === 401) {
            expiry.notify()
          }
        },
      ],
    },
  })
}

export type ApiClient = ReturnType<typeof createApiClient>
