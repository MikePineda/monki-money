import Account from '#models/account'
import Category from '#models/category'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { NAB_SYSTEM_RULES, resolveSystemRules } from '#importers/nab/system_rules'

/**
 * Seeds the bank's default rules (`origin = 'system'`, see
 * app/importers/nab/system_rules.ts) into a household, resolved against its
 * own categories and accounts. Insert-only and idempotent: an existing
 * (match_type, pattern) is never touched, and a definition whose category
 * or account the household lacks is skipped (transfer rules arrive once the
 * accounts exist: bootstrap and first import call this again).
 */
export default class SystemRulesSeeder {
  async seed(householdId: number, client: QueryClientContract = db): Promise<number> {
    const [categories, accounts] = await Promise.all([
      Category.query({ client }).where('household_id', householdId).select('id', 'slug'),
      Account.query({ client })
        .where('household_id', householdId)
        .where('is_active', true)
        .select('id', 'institution', 'kind'),
    ])

    const seeds = resolveSystemRules(NAB_SYSTEM_RULES, {
      categoryIdBySlug: new Map(categories.map((category) => [category.slug, category.id])),
      accounts: accounts.map((account) => ({
        id: account.id,
        institution: account.institution ?? '',
        kind: account.kind,
      })),
    })
    if (seeds.length === 0) return 0

    const now = new Date()
    const inserted: Array<{ id: number }> = await client
      .knexQuery()
      .table('merchant_rules')
      .insert(
        seeds.map((seed) => ({
          household_id: householdId,
          match_type: seed.matchType,
          pattern: seed.pattern,
          category_id: seed.categoryId,
          transfer_account_id: seed.transferAccountId,
          paid_by_user_id: seed.paidByUserId,
          payee_override: seed.payeeOverride,
          priority: seed.priority,
          origin: 'system',
          created_at: now,
          updated_at: now,
        }))
      )
      .onConflict(['household_id', 'match_type', 'pattern'])
      .ignore()
      .returning('id')
    return inserted.length
  }
}
