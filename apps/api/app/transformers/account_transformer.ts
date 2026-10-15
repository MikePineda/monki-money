import type Account from '#models/account'
import type { AccountBalance } from '#services/accounts/dto'
import { BaseTransformer } from '@adonisjs/core/transformers'
import AccountCardTransformer from '#transformers/account_card_transformer'

const ZERO: AccountBalance = { clearedBalanceCents: 0, availableBalanceCents: 0 }

/** An account with its cards (preloaded) and balances (in cents). */
export default class AccountTransformer extends BaseTransformer<Account> {
  constructor(
    resource: Account,
    protected balances: Map<number, AccountBalance> = new Map()
  ) {
    super(resource)
  }

  toObject() {
    const balance = this.balances.get(this.resource.id) ?? ZERO
    return {
      id: this.resource.id,
      name: this.resource.name,
      institution: this.resource.institution,
      kind: this.resource.kind,
      ownerUserId: this.resource.ownerUserId,
      isJoint: this.resource.isJoint,
      currencyCode: this.resource.currencyCode,
      externalAccountNumber: this.resource.externalAccountNumber,
      openingBalanceCents: this.resource.openingBalanceCents,
      openingBalanceDate: this.resource.openingBalanceDate,
      isActive: this.resource.isActive,
      sortOrder: this.resource.sortOrder,
      clearedBalanceCents: balance.clearedBalanceCents,
      availableBalanceCents: balance.availableBalanceCents,
      cards: AccountCardTransformer.transform(this.resource.cards ?? []),
    }
  }
}
