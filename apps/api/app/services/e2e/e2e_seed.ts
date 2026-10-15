import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { capturedOutbox } from '#services/e2e/captured_outbox'
import SavingsGoal from '#models/savings_goal'
import ProductionBootstrap from '#services/bootstrap/production_bootstrap'

/** Synthetic credentials of the E2E household (test databases only). */
export const E2E_PASSWORD = 'e2e-password-123'
export const E2E_OWNER_EMAIL = 'owner@e2e.test'
export const E2E_MEMBER_EMAIL = 'member@e2e.test'

/**
 * Known state for Playwright: wipes every table (except migrations) and
 * seeds household "E2E" with two users, the four starting accounts and the
 * taxonomy, through the same bootstrap production uses, plus one sample
 * savings goal (no account, so its projection needs no ledger). Only
 * reachable in test/E2E mode (start/routes/e2e.ts, commands/seed_e2e.ts).
 */
@inject()
export default class E2eSeed {
  constructor(protected bootstrap: ProductionBootstrap) {}

  async reset() {
    await this.truncate()
    await limiter.clear()
    capturedOutbox.clear()
    return this.seed()
  }

  async seed() {
    const result = await this.bootstrap.run({
      householdName: 'E2E',
      locale: 'en',
      owner: {
        email: E2E_OWNER_EMAIL,
        fullName: 'Owner E2E',
        password: E2E_PASSWORD,
        cardSuffix: '0001',
      },
      member: {
        email: E2E_MEMBER_EMAIL,
        fullName: 'Member E2E',
        password: E2E_PASSWORD,
        cardSuffix: '0002',
      },
      jointAccountNumber: '000000001',
    })
    await SavingsGoal.create({
      householdId: result.household.id,
      name: 'Emergency fund',
      targetCents: 500_000,
      sortOrder: 0,
    })

    return {
      householdId: result.household.id,
      users: [
        { email: E2E_OWNER_EMAIL, password: E2E_PASSWORD, role: 'owner' as const },
        { email: E2E_MEMBER_EMAIL, password: E2E_PASSWORD, role: 'member' as const },
      ],
    }
  }

  protected async truncate() {
    const result = await db.rawQuery(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = current_schema() AND tablename NOT LIKE 'adonis_schema%'`
    )
    const tables: string[] = result.rows.map((row: { tablename: string }) => row.tablename)
    if (tables.length === 0) return
    await db.rawQuery(
      `TRUNCATE TABLE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`
    )
  }
}
