import { test } from '@japa/runner'
import User from '#models/user'
import Account from '#models/account'
import Category from '#models/category'
import app from '@adonisjs/core/services/app'
import hash from '@adonisjs/core/services/hash'
import AccountCard from '#models/account_card'
import HouseholdMember from '#models/household_member'
import type { BootstrapInput } from '#services/bootstrap/dto'
import ProductionBootstrap from '#services/bootstrap/production_bootstrap'
import { createHousehold } from '#tests/helpers/household'

const input: BootstrapInput = {
  householdName: 'Synthetic Home',
  locale: 'en',
  owner: {
    email: 'owner@example.test',
    fullName: 'Olive Owner',
    password: 'owner-password-123',
    cardSuffix: '1111',
  },
  member: {
    email: 'member@example.test',
    fullName: 'Mel Member',
    password: 'member-password-123',
    cardSuffix: '2222',
  },
  jointAccountNumber: '000111222',
}

test.group('Production bootstrap', () => {
  test('test_bootstrap_creates_household_users_accounts_and_cards', async ({ assert }) => {
    const bootstrap = await app.container.make(ProductionBootstrap)

    const { household, owner, member } = await bootstrap.run(input)

    assert.equal(household.name, 'Synthetic Home')
    assert.isNotNull(owner.emailVerifiedAt)
    assert.isNotNull(member!.emailVerifiedAt)

    const roles = await HouseholdMember.query().where('household_id', household.id)
    assert.sameDeepMembers(
      roles.map((m) => ({ userId: m.userId, role: m.role })),
      [
        { userId: owner.id, role: 'owner' },
        { userId: member!.id, role: 'member' },
      ]
    )

    const accounts = await Account.query()
      .where('household_id', household.id)
      .preload('cards')
      .orderBy('sort_order')
    assert.deepEqual(
      accounts.map((a) => [a.name, a.kind, a.ownerUserId]),
      [
        ['NAB Everyday', 'transaction', null],
        ['NAB Savings', 'savings', null],
        ['Hnry', 'wallet', owner.id],
        ['Cash', 'cash', null],
      ]
    )
    assert.equal(accounts[0].externalAccountNumber, '000111222')
    assert.sameDeepMembers(
      accounts[0].cards.map((c) => ({ suffix: c.cardSuffix, userId: c.userId })),
      [
        { suffix: '1111', userId: owner.id },
        { suffix: '2222', userId: member!.id },
      ]
    )

    const categories = await Category.query().where('household_id', household.id)
    assert.isAbove(categories.length, 30)
  })

  test('test_bootstrap_is_idempotent_and_never_resets_passwords', async ({ assert }) => {
    const bootstrap = await app.container.make(ProductionBootstrap)
    const first = await bootstrap.run(input)

    const second = await bootstrap.run({
      ...input,
      owner: { ...input.owner, password: 'a-different-password' },
    })

    assert.equal(second.household.id, first.household.id)
    assert.lengthOf(
      await User.query().whereIn('email', [input.owner.email, input.member!.email]),
      2
    )
    assert.lengthOf(await Account.query().where('household_id', first.household.id), 4)
    assert.lengthOf(await AccountCard.query().where('account_id', first.accounts[0].id), 2)
    const owner = await User.findByOrFail('email', input.owner.email)
    assert.isTrue(await hash.verify(owner.password, 'owner-password-123'))
  })

  test('test_bootstrap_never_moves_a_member_who_already_has_another_household', async ({
    assert,
  }) => {
    const elsewhere = await createHousehold()
    const member = elsewhere.owner
    const bootstrap = await app.container.make(ProductionBootstrap)

    const { household, accounts } = await bootstrap.run({
      ...input,
      member: { ...input.member!, email: member.email },
    })

    const memberships = await HouseholdMember.query().where('user_id', member.id)
    assert.deepEqual(
      memberships.map((m) => m.householdId),
      [elsewhere.household.id]
    )
    await member.refresh()
    assert.equal(member.currentHouseholdId, elsewhere.household.id)
    assert.lengthOf(await HouseholdMember.query().where('household_id', household.id), 1)
    // No card is attributed to someone outside the household.
    assert.lengthOf(await AccountCard.query().where('account_id', accounts[0].id), 1)
  })
})
