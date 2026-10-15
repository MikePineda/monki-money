import type { Router } from '@adonisjs/core/http'
import { controllers } from '#generated/controllers'

/**
 * Test-support routes, registered by start/routes.ts only when
 * `testSupportEnabled()` (NODE_ENV=test or E2E_MODE=true). CSRF-exempt
 * (config/shield.ts) and excluded from the Tuyau registry (adonisrc.ts).
 */
export function registerE2eRoutes(router: Router) {
  router.post('/api/test/reset', [controllers.TestSupport, 'reset']).as('e2e.reset')
  router.get('/api/test/outbox', [controllers.TestSupport, 'outbox']).as('e2e.outbox')
}
