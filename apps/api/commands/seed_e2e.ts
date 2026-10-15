import env from '#start/env'
import E2eSeed from '#services/e2e/e2e_seed'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { shouldRegisterE2eRoutes } from '#start/routes/e2e'

/**
 * `node ace seed:e2e`: wipes the database and seeds the E2E household.
 * Refuses to run outside NODE_ENV=test / E2E_MODE=true.
 */
export default class SeedE2e extends BaseCommand {
  static override commandName = 'seed:e2e'
  static override description = 'Wipe the database and seed the E2E household (test/E2E mode only)'
  static override options: CommandOptions = { startApp: true }

  override async run() {
    if (!shouldRegisterE2eRoutes({ inTest: this.app.inTest, e2eMode: env.get('E2E_MODE') })) {
      this.logger.error('seed:e2e only runs with NODE_ENV=test or E2E_MODE=true')
      this.exitCode = 1
      return
    }

    const seed = await this.app.container.make(E2eSeed)
    const { householdId, users } = await seed.reset()
    this.logger.success(`E2E household ${householdId} seeded with ${users.length} users`)
  }
}
