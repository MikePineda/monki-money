import type { Router } from '@adonisjs/core/http'
import { controllers } from '#generated/controllers'

/**
 * Test-only routes exist when running the test suite (NODE_ENV=test) or the
 * E2E stack (E2E_MODE=true). Production never registers them.
 */
export function shouldRegisterE2eRoutes(flags: { inTest: boolean; e2eMode?: boolean }) {
  return flags.inTest || flags.e2eMode === true
}

export function registerE2eRoutes(router: Router) {
  // CSRF-exempt (config/shield.ts) and excluded from the Tuyau registry.
  router.post('/api/test/reset', [controllers.TestSupport, 'reset']).as('e2e.reset')
}
