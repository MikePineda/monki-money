import type AccountCard from '#models/account_card'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class AccountCardTransformer extends BaseTransformer<AccountCard> {
  toObject() {
    return {
      id: this.resource.id,
      accountId: this.resource.accountId,
      cardSuffix: this.resource.cardSuffix,
      userId: this.resource.userId,
      label: this.resource.label,
    }
  }
}
