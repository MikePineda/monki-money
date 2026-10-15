import env from '#start/env'
import app from '@adonisjs/core/services/app'

/**
 * Test-support features (`/api/test/*` routes, `seed:e2e`, the captured
 * outbox) exist only under NODE_ENV=test (Japa, the E2E stack) or
 * E2E_MODE=true. Production never enables them.
 */
export function shouldEnableTestSupport(flags: { inTest: boolean; e2eMode?: boolean }) {
  return flags.inTest || flags.e2eMode === true
}

export function testSupportEnabled() {
  return shouldEnableTestSupport({ inTest: app.inTest, e2eMode: env.get('E2E_MODE') })
}
