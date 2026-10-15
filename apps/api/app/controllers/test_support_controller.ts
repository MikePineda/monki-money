import { inject } from '@adonisjs/core'
import E2eSeed from '#services/e2e/e2e_seed'

/** POST /api/test/reset (test/E2E mode only): wipe and reseed the database. */
@inject()
export default class TestSupportController {
  constructor(protected seed: E2eSeed) {}

  async reset() {
    return { data: await this.seed.reset() }
  }
}
