import type User from '#models/user'
import { inject } from '@adonisjs/core'
import ImportRow from '#models/import_row'
import Transaction from '#models/transaction'
import MerchantRule from '#models/merchant_rule'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import { FieldError } from '#exceptions/field_error'
import type { RuleMatchType } from '@monkimoney/shared'
import { isHiddenFrom } from '#domain/ledger/privacy'
import { findInHousehold } from '#repositories/scoped'
import { decodeHtmlEntities } from '#importers/html_entities'
import LedgerReferences from '#services/ledger/ledger_references'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { isUniqueViolationOn } from '#services/ledger/unique_violation'
import { findMatchingRule, type RuleSubject } from '#domain/importing/rule_matching'
import { merchantFullKey, merchantKey, normalizeDescription } from '#domain/importing/normalize'

/** Unique index of migration 16: one rule per (household, match_type, pattern). */
const PATTERN_CONSTRAINT = 'merchant_rules_household_type_pattern_unique'

export interface RuleInput {
  matchType?: RuleMatchType
  pattern?: string
  categoryId?: number | null
  transferAccountId?: number | null
  paidByUserId?: number | null
  payeeOverride?: string | null
  priority?: number
}

/**
 * The household's merchant rules (`/rules`). Rules typed or edited by a
 * person are `origin = 'user'`. A `merchant` pattern is stored as a merchant
 * key (lowercase words, no numbers) so it compares with the importer's keys;
 * `contains` / `regex` keep the text as typed.
 */
@inject()
export default class RulesService {
  constructor(protected references: LedgerReferences) {}

  list(household: Household) {
    return MerchantRule.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .orderBy('priority', 'desc')
      .orderBy('id')
  }

  async create(
    household: Household,
    actor: User,
    input: RuleInput & { matchType: RuleMatchType; pattern: string }
  ) {
    const values = await this.validated(household, null, input)
    try {
      return await MerchantRule.create({
        ...values,
        householdId: household.id,
        origin: 'user',
        createdByUserId: actor.id,
      })
    } catch (error) {
      if (isUniqueViolationOn(error, PATTERN_CONSTRAINT)) throw new FieldError('pattern', 'taken')
      throw error
    }
  }

  async update(household: Household, ruleId: number, input: RuleInput) {
    const rule = await findInHousehold(MerchantRule, household, ruleId)
    const values = await this.validated(household, rule, input)
    rule.merge({ ...values, origin: 'user' })
    try {
      await rule.save()
    } catch (error) {
      if (isUniqueViolationOn(error, PATTERN_CONSTRAINT)) throw new FieldError('pattern', 'taken')
      throw error
    }
    return rule
  }

  async destroy(household: Household, ruleId: number) {
    const rule = await findInHousehold(MerchantRule, household, ruleId)
    await rule.delete()
  }

  /**
   * Re-categorizes the transactions still in triage (`needs_review`) that
   * the rule matches: imported rows by their bank row (merchant keys, bank
   * text), typed ones by payee. Transfers, split rows and the partner's
   * private rows are left alone; reviewed rows are never touched.
   */
  async apply(household: Household, actor: User, ruleId: number): Promise<{ updated: number }> {
    const rule = await findInHousehold(MerchantRule, household, ruleId)
    if (rule.categoryId === null) return { updated: 0 }

    const candidates = await Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('needs_review', true)
      .whereNot('kind', 'transfer')
      .where('is_split', false)
    const viewer = await privacyViewer(household, actor)
    const visible = candidates.filter((row) => !isHiddenFrom(row, viewer))
    const bankRows = await this.bankRowsOf(visible.map((row) => row.id))

    const ruleValue = rule.toRule()
    const matched = visible.filter(
      (row) => findMatchingRule([ruleValue], subjectOf(row, bankRows.get(row.id))) !== null
    )
    if (matched.length === 0) return { updated: 0 }

    await db.transaction(async (trx) => {
      await Transaction.query({ client: trx })
        .withScopes((scopes) => scopes.forHousehold(household))
        .whereIn(
          'id',
          matched.map((row) => row.id)
        )
        .update({
          category_id: rule.categoryId,
          needs_review: false,
          ...(rule.payeeOverride ? { payee: rule.payeeOverride } : {}),
          ...(rule.paidByUserId ? { paid_by_user_id: rule.paidByUserId } : {}),
          updated_by_user_id: actor.id,
          updated_at: new Date(),
        })
      await trx
        .from('merchant_rules')
        .where('id', rule.id)
        .update({
          hit_count: trx.raw('hit_count + ?', [matched.length]),
          last_hit_at: new Date(),
          updated_at: new Date(),
        })
    })
    return { updated: matched.length }
  }

  /** The bank row each transaction came from (latest link wins). */
  protected async bankRowsOf(transactionIds: number[]) {
    const rows = new Map<number, ImportRow>()
    for (let offset = 0; offset < transactionIds.length; offset += 1000) {
      const found = await ImportRow.query()
        .whereIn('transaction_id', transactionIds.slice(offset, offset + 1000))
        .orderBy('id')
      for (const row of found) rows.set(row.transactionId!, row)
    }
    return rows
  }

  /** Normalized, checked values of a new or edited rule (422 per field). */
  protected async validated(household: Household, rule: MerchantRule | null, input: RuleInput) {
    const matchType = input.matchType ?? rule!.matchType
    const rawPattern = input.pattern ?? rule!.pattern
    const pattern =
      matchType === 'merchant'
        ? merchantFullKey({ nabMerchant: null, description: rawPattern })
        : rawPattern.trim()
    if (pattern === '') throw new FieldError('pattern', 'required')
    if (matchType === 'regex') {
      try {
        new RegExp(pattern, 'i')
      } catch {
        throw new FieldError('pattern', 'regex')
      }
    }

    const pick = <Key extends keyof RuleInput>(key: Key, fallback: RuleInput[Key]) =>
      input[key] !== undefined ? input[key] : fallback
    const categoryId = pick('categoryId', rule?.categoryId ?? null) ?? null
    const transferAccountId = pick('transferAccountId', rule?.transferAccountId ?? null) ?? null
    if (categoryId === null && transferAccountId === null) {
      throw new FieldError('categoryId', 'required')
    }
    await this.references.categories(household, [categoryId], 'categoryId')
    if (transferAccountId !== null) {
      await this.references.account(household, transferAccountId, 'transferAccountId')
    }
    const paidByUserId = pick('paidByUserId', rule?.paidByUserId ?? null) ?? null
    await this.references.payer(household, paidByUserId)

    const duplicate = await MerchantRule.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('match_type', matchType)
      .where('pattern', pattern)
      .if(rule, (query) => query.whereNot('id', rule!.id))
      .first()
    if (duplicate) throw new FieldError('pattern', 'taken')

    return {
      matchType,
      pattern,
      categoryId,
      transferAccountId,
      paidByUserId,
      payeeOverride: pick('payeeOverride', rule?.payeeOverride ?? null) ?? null,
      priority: pick('priority', rule?.priority ?? 0) ?? 0,
    }
  }
}

/** What a rule looks at: the bank row when there is one, else the payee typed by hand. */
function subjectOf(transaction: Transaction, bankRow: ImportRow | undefined): RuleSubject {
  if (bankRow) {
    return {
      merchantKey: bankRow.merchantKey,
      merchantFullKey: bankRow.merchantFullKey,
      details: decodeHtmlEntities(bankRow.descriptionRaw),
      nabMerchant: bankRow.nabMerchant,
    }
  }
  const text = transaction.rawDescription ?? transaction.payee ?? ''
  const source = { nabMerchant: transaction.payee, description: normalizeDescription(text) }
  return {
    merchantKey: merchantKey(source),
    merchantFullKey: merchantFullKey(source),
    details: text,
    nabMerchant: transaction.payee,
  }
}
