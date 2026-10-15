import type User from '#models/user'
import { assert } from '@japa/assert'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import { dbAssertions } from '@adonisjs/lucid/plugins/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { apiClient, ApiRequest } from '@japa/api-client'
import { authApiClient } from '@adonisjs/auth/plugins/api_client'
import { shieldApiClient } from '@adonisjs/shield/plugins/api_client'
import { sessionApiClient } from '@adonisjs/session/plugins/api_client'
import type { Registry } from '../.adonisjs/client/registry/schema.d.ts'

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */
declare module '@japa/api-client/types' {
  interface RoutesRegistry extends Registry {}
}

declare module '@japa/api-client' {
  interface ApiRequest {
    /**
     * Laravel's `actingAs`: a logged-in session exactly like the real login
     * flow leaves it (user id + session_version) plus a valid CSRF token.
     */
    actingAs(user: User): this
  }
}

ApiRequest.macro('actingAs', function (this: ApiRequest, user: User) {
  return this.loginAs(user).withSession({ sv: user.sessionVersion }).withCsrfToken()
})

/**
 * Japa plugins. `sessionApiClient` + `authApiClient` give the Laravel-style
 * `client.get(...).loginAs(user)`; `shieldApiClient` gives `withCsrfToken()`;
 * `dbAssertions` gives `db.assertHas(...)`.
 */
export const plugins: Config['plugins'] = [
  assert(),
  pluginAdonisJS(app),
  dbAssertions(app),
  apiClient(),
  sessionApiClient(app),
  shieldApiClient(),
  authApiClient(app),
]

/**
 * Runner-wide hooks. Kept empty so the unit suite never needs a database.
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [],
  teardown: [],
}

/**
 * Suites that talk to the database get the Laravel `RefreshDatabase`
 * equivalent: migrate the test database once per suite (rolled back at the
 * end) and wrap every test of every group in a global transaction that is
 * rolled back after the test.
 */
export const configureSuite: Config['configureSuite'] = (suite) => {
  if (['browser', 'functional', 'e2e'].includes(suite.name)) {
    suite.setup(() => testUtils.db().migrate())
    suite.onGroup((group) => {
      group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
    })
    return suite.setup(() => testUtils.httpServer().start())
  }
}
