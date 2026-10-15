import Account from '#models/account'
import Category from '#models/category'
import Household from '#models/household'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import { MerchantRuleSchema } from '#database/schema'
import type { MerchantRule as RuleValue } from '#domain/importing/types'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

/**
 * A household rule for bank rows: by merchant key, word or regex, it names
 * a category and/or a transfer account (plus payer and payee). `origin`
 * says who wrote it (person, importer, app defaults).
 */
export default class MerchantRule extends compose(MerchantRuleSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>

  @belongsTo(() => Account, { foreignKey: 'transferAccountId' })
  declare transferAccount: BelongsTo<typeof Account>

  /** The plain value the import pipeline works with. */
  toRule(): RuleValue {
    return {
      id: this.id,
      matchType: this.matchType,
      pattern: this.pattern,
      categoryId: this.categoryId,
      transferAccountId: this.transferAccountId,
      paidByUserId: this.paidByUserId,
      payeeOverride: this.payeeOverride,
      priority: this.priority,
      createdBy: this.origin === 'user' ? 'user' : 'system',
    }
  }
}
