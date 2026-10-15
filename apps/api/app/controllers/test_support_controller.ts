import { inject } from '@adonisjs/core'
import E2eSeed from '#services/e2e/e2e_seed'
import { capturedOutbox } from '#services/e2e/captured_outbox'

/** Test-support endpoints (test/E2E mode only, see start/routes/e2e.ts). */
@inject()
export default class TestSupportController {
  constructor(protected seed: E2eSeed) {}

  /** POST /api/test/reset: wipe the database, the throttles and the outbox; reseed. */
  async reset() {
    return { data: await this.seed.reset() }
  }

  /** GET /api/test/outbox: mails "sent" since the last reset (log transport). */
  async outbox() {
    return { data: capturedOutbox.list() }
  }
}
