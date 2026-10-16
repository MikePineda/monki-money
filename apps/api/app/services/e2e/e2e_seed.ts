import Clock from '#services/clock'
import { inject } from '@adonisjs/core'
import Category from '#models/category'
import db from '@adonisjs/lucid/services/db'
import Transaction from '#models/transaction'
import type Household from '#models/household'
import SavingsGoal from '#models/savings_goal'
import { addDays } from '#domain/importing/iso_days'
import limiter from '@adonisjs/limiter/services/main'
import { capturedOutbox } from '#services/e2e/captured_outbox'
import { monthRange, currentMonth, addMonths } from '#domain/calendar/month'
import ProductionBootstrap from '#services/bootstrap/production_bootstrap'

/** The synthetic weekly payee the E2E household pays (recurring payments journey). */
export const E2E_WEEKLY_PAYEE = 'Harbourview Lettings'

/** Synthetic credentials of the E2E household (test databases only). */
export const E2E_PASSWORD = 'e2e-password-123'
export const E2E_OWNER_EMAIL = 'owner@e2e.test'
export const E2E_MEMBER_EMAIL = 'member@e2e.test'

/**
 * Known state for Playwright: wipes every table (except migrations) and
 * seeds household "E2E" with two users, the four starting accounts and the
 * taxonomy, through the same bootstrap production uses, plus one sample
 * savings goal (no account, so its projection needs no ledger) and four
 * weekly rent payments to a synthetic payee, all in the weeks before the
 * current month (its Month view stays empty) so recurring payment detection
 * has something to find. Only reachable in test/E2E mode
 * (start/routes/e2e.ts, commands/seed_e2e.ts).
 */
@inject()
export default class E2eSeed {
  constructor(
    protected bootstrap: ProductionBootstrap,
    protected clock: Clock
  ) {}

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
    await this.weeklyRent(result.household, result.accounts[0].id, result.owner.id)

    return {
      householdId: result.household.id,
      users: [
        { email: E2E_OWNER_EMAIL, password: E2E_PASSWORD, role: 'owner' as const },
        { email: E2E_MEMBER_EMAIL, password: E2E_PASSWORD, role: 'member' as const },
      ],
    }
  }

  /** Four weekly payments ending on the last day of the previous month. */
  protected async weeklyRent(household: Household, accountId: number, ownerId: number) {
    const month = currentMonth(this.clock.now(), household.timezone)
    const last = monthRange(addMonths(month, -1)).to
    const rent = await Category.query()
      .where('household_id', household.id)
      .where('slug', 'rent')
      .first()
    await Transaction.createMany(
      [21, 14, 7, 0].map((daysBefore) => ({
        householdId: household.id,
        accountId,
        kind: 'expense' as const,
        date: addDays(last, -daysBefore),
        amountCents: -45_000,
        payee: E2E_WEEKLY_PAYEE,
        categoryId: rent?.id ?? null,
        paidByUserId: null,
        createdByUserId: ownerId,
        updatedByUserId: ownerId,
      }))
    )
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
