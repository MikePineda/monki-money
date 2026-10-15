import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import { dbAssertions } from '@adonisjs/lucid/plugins/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { authApiClient } from '@adonisjs/auth/plugins/api_client'
import { sessionApiClient } from '@adonisjs/session/plugins/api_client'
import type { Registry } from '../.adonisjs/client/registry/schema.d.ts'

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */
declare module '@japa/api-client/types' {
  interface RoutesRegistry extends Registry {}
}

/**
 * Japa plugins. `sessionApiClient` + `authApiClient` give the Laravel-style
 * `client.get(...).loginAs(user)`; `dbAssertions` gives `db.assertHas(...)`.
 */
export const plugins: Config['plugins'] = [
  assert(),
  pluginAdonisJS(app),
  dbAssertions(app),
  apiClient(),
  sessionApiClient(app),
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
