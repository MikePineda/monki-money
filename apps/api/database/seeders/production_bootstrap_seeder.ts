import env from '#start/env'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import ProductionBootstrap from '#services/bootstrap/production_bootstrap'
import { readBootstrapInput } from '#services/bootstrap/bootstrap_env'

/**
 * First-deploy bootstrap, run by docker/entrypoint.mjs when SEED_USERS=true
 * (`node ace db:seed --files=./database/seeders/production_bootstrap_seeder.js`).
 * Driven only by the flat SEED_* env vars; idempotent, so leaving
 * SEED_USERS on for a redeploy is harmless. Logs ids, never emails.
 */
export default class ProductionBootstrapSeeder extends BaseSeeder {
  async run() {
    if (!env.get('SEED_USERS')) {
      logger.info('production bootstrap skipped (SEED_USERS is off)')
      return
    }

    const values: Record<string, string | undefined> = {
      SEED_HOUSEHOLD_NAME: env.get('SEED_HOUSEHOLD_NAME'),
      SEED_LOCALE: env.get('SEED_LOCALE'),
      SEED_USER1_EMAIL: env.get('SEED_USER1_EMAIL'),
      SEED_USER1_NAME: env.get('SEED_USER1_NAME'),
      SEED_USER1_PASSWORD: env.get('SEED_USER1_PASSWORD')?.release(),
      SEED_USER1_CARD_SUFFIX: env.get('SEED_USER1_CARD_SUFFIX'),
      SEED_USER2_EMAIL: env.get('SEED_USER2_EMAIL'),
      SEED_USER2_NAME: env.get('SEED_USER2_NAME'),
      SEED_USER2_PASSWORD: env.get('SEED_USER2_PASSWORD')?.release(),
      SEED_USER2_CARD_SUFFIX: env.get('SEED_USER2_CARD_SUFFIX'),
      SEED_JOINT_ACCOUNT_NUMBER: env.get('SEED_JOINT_ACCOUNT_NUMBER'),
    }
    const input = await readBootstrapInput((key) => values[key])

    const bootstrap = await app.container.make(ProductionBootstrap)
    const result = await bootstrap.run(input)

    logger.info(
      {
        householdId: result.household.id,
        users: result.member ? 2 : 1,
        accounts: result.accounts.length,
      },
      'production bootstrap done'
    )
  }
}
