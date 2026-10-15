import { request, type FullConfig } from '@playwright/test'

/**
 * One clean slate per run: `POST /api/test/reset` wipes the database, the
 * rate limits and the captured outbox, then seeds the E2E household. Specs
 * create their own users with unique emails, so they never reset again and
 * can run in parallel.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL
  const context = await request.newContext({ baseURL })
  const response = await context.post('/api/test/reset')
  if (!response.ok()) {
    throw new Error(`POST /api/test/reset failed: ${response.status()} ${await response.text()}`)
  }
  await context.dispose()
}
