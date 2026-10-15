import type User from '#models/user'
import ImportRow from '#models/import_row'
import type Transaction from '#models/transaction'
import MerchantRule from '#models/merchant_rule'
import db from '@adonisjs/lucid/services/db'
import { learnRules, type LearningDecision } from '#domain/importing/learning'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * Turns decisions into `merchant` rules (pattern = full merchant key of the
 * bank row): from confirmed imports (app/domain/importing/learning.ts
 * decides which rows teach) and from "apply to future" edits of an imported
 * transaction. A rule a person typed keeps `origin = 'user'` when a
 * decision updates it; everything else is `learned`.
 */
export default class RuleLearner {
  async learnFromImport(
    household: HouseholdRef,
    actor: User,
    decisions: readonly LearningDecision[],
    trx: TransactionClientContract
  ): Promise<number> {
    if (decisions.length === 0) return 0
    const existing = await MerchantRule.query({ client: trx })
      .where('household_id', householdIdOf(household))
      .where('match_type', 'merchant')
    const upserts = learnRules(
      decisions,
      existing.map((rule) => rule.toRule())
    )

    for (const upsert of upserts) {
      const rule = existing.find((candidate) => candidate.id === upsert.existingRuleId)
      await this.save(
        household,
        actor,
        rule ?? null,
        {
          pattern: upsert.pattern,
          categoryId: upsert.categoryId,
          transferAccountId: upsert.transferAccountId,
          paidByUserId: upsert.paidByUserId,
        },
        trx
      )
    }
    return upserts.length
  }

  /**
   * "Apply to future" on an edited transaction: the category becomes the
   * rule of the merchant of the bank row the transaction came from. A
   * transaction typed by hand has no bank merchant key: nothing is learned.
   */
  async learnFromEdit(
    household: HouseholdRef,
    actor: User,
    transaction: Transaction,
    trx: TransactionClientContract
  ): Promise<MerchantRule | null> {
    if (transaction.categoryId === null) return null
    const source = await ImportRow.query({ client: trx })
      .where('household_id', householdIdOf(household))
      .where('transaction_id', transaction.id)
      .whereNot('merchant_full_key', '')
      .orderBy('id', 'desc')
      .first()
    if (!source) return null

    const existing = await MerchantRule.query({ client: trx })
      .where('household_id', householdIdOf(household))
      .where('match_type', 'merchant')
      .where('pattern', source.merchantFullKey)
      .first()
    return this.save(
      household,
      actor,
      existing,
      {
        pattern: source.merchantFullKey,
        categoryId: transaction.categoryId,
        transferAccountId: null,
        paidByUserId: existing?.paidByUserId ?? null,
      },
      trx
    )
  }

  /** Counts the rules that decided confirmed rows (`hit_count`, `last_hit_at`). */
  async recordHits(ruleIds: readonly number[], trx?: TransactionClientContract) {
    const client = trx ?? db
    const hits = new Map<number, number>()
    for (const id of ruleIds) hits.set(id, (hits.get(id) ?? 0) + 1)
    for (const [id, count] of hits) {
      await client
        .from('merchant_rules')
        .where('id', id)
        .update({
          hit_count: client.raw('hit_count + ?', [count]),
          last_hit_at: new Date(),
          updated_at: new Date(),
        })
    }
  }

  protected async save(
    household: HouseholdRef,
    actor: User,
    rule: MerchantRule | null,
    values: {
      pattern: string
      categoryId: number | null
      transferAccountId: number | null
      paidByUserId: number | null
    },
    trx: TransactionClientContract
  ) {
    if (rule) {
      rule.useTransaction(trx)
      rule.merge({
        categoryId: values.categoryId,
        transferAccountId: values.transferAccountId,
        paidByUserId: values.paidByUserId,
        origin: rule.origin === 'user' ? 'user' : 'learned',
      })
      await rule.save()
      return rule
    }
    return MerchantRule.create(
      {
        householdId: householdIdOf(household),
        matchType: 'merchant',
        pattern: values.pattern,
        categoryId: values.categoryId,
        transferAccountId: values.transferAccountId,
        paidByUserId: values.paidByUserId,
        origin: 'learned',
        createdByUserId: actor.id,
      },
      { client: trx }
    )
  }
}
