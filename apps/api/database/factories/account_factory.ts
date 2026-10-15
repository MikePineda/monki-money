import Account from '#models/account'
import factory from '@adonisjs/lucid/factories'

/**
 * Synthetic accounts. Always pass `householdId` (and `ownerUserId` for a
 * personal account) through `.merge()`.
 */
export const AccountFactory = factory
  .define(Account, ({ faker }) => ({
    name: `${faker.word.noun()} account`,
    institution: 'Test Bank',
    kind: 'transaction' as const,
    currencyCode: 'AUD',
    externalAccountNumber: null,
    openingBalanceCents: 0,
    openingBalanceDate: null,
    isActive: true,
    sortOrder: 0,
    ownerUserId: null,
  }))
  .state('savings', (account) => {
    account.kind = 'savings'
  })
  .build()
