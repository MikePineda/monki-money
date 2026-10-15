import User from '#models/user'
import Account from '#models/account'
import { belongsTo } from '@adonisjs/lucid/orm'
import { AccountCardSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

/**
 * A card of an account, by its printed suffix. Scoped through its account
 * (load the account with `findInHousehold` first, then the card by account).
 */
export default class AccountCard extends AccountCardSchema {
  @belongsTo(() => Account)
  declare account: BelongsTo<typeof Account>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
