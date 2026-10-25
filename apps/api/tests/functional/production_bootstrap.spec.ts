import { test } from '@japa/runner'
import User from '#models/user'
import Account from '#models/account'
import Category from '#models/category'
import Household from '#models/household'
import app from '@adonisjs/core/services/app'
import hash from '@adonisjs/core/services/hash'
import AccountCard from '#models/account_card'
import HouseholdMember from '#models/household_member'
import type { BootstrapInput, SmokeUserInput } from '#services/bootstrap/dto'
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

  test('test_the_bootstrapped_household_counts_as_onboarded_and_keeps_its_stamp', async ({
    assert,
  }) => {
    const bootstrap = await app.container.make(ProductionBootstrap)

    const { household } = await bootstrap.run(input)
    const first = await Household.findOrFail(household.id)
    await bootstrap.run(input)

    // Its starting accounts are the wizard's work: every device opens the app.
    assert.isNotNull(first.onboardedAt)
    const again = await Household.findOrFail(household.id)
    assert.equal(again.onboardedAt?.toMillis(), first.onboardedAt!.toMillis())
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

const smoke: SmokeUserInput = { email: 'smoke@example.test', password: 'smoke-password-123' }

test.group('Production bootstrap: smoke user', () => {
  test('test_smoke_user_gets_its_own_verified_household_without_accounts', async ({ assert }) => {
    const bootstrap = await app.container.make(ProductionBootstrap)

    const { user, household } = await bootstrap.ensureSmokeUser(smoke)

    assert.isNotNull(user.emailVerifiedAt)
    assert.isTrue(await hash.verify(user.password, 'smoke-password-123'))
    assert.equal(household?.name, 'Smoke')
    assert.equal(user.currentHouseholdId, household!.id)
    const members = await HouseholdMember.query().where('household_id', household!.id)
    assert.deepEqual(
      members.map((m) => [m.userId, m.role]),
      [[user.id, 'owner']]
    )
    assert.lengthOf(await Account.query().where('household_id', household!.id), 0)
    // The smoke run reads categories, so the household gets the taxonomy.
    const categories = await Category.query().where('household_id', household!.id)
    assert.isAbove(categories.length, 0)
  })

  test('test_smoke_bootstrap_is_idempotent_and_never_resets_the_password', async ({ assert }) => {
    const bootstrap = await app.container.make(ProductionBootstrap)
    const first = await bootstrap.ensureSmokeUser(smoke)

    const second = await bootstrap.ensureSmokeUser({ ...smoke, password: 'another-password-1' })

    assert.equal(second.user.id, first.user.id)
    assert.equal(second.household?.id, first.household?.id)
    assert.lengthOf(await User.query().where('email', smoke.email), 1)
    assert.lengthOf(await Household.query().where('name', 'Smoke'), 1)
    await second.user.refresh()
    assert.isTrue(await hash.verify(second.user.password, 'smoke-password-123'))
  })

  test('test_smoke_household_is_separate_from_the_real_household', async ({ assert }) => {
    const bootstrap = await app.container.make(ProductionBootstrap)
    const real = await bootstrap.run(input)

    const { user, household } = await bootstrap.ensureSmokeUser(smoke)

    assert.notEqual(household!.id, real.household.id)
    assert.lengthOf(await HouseholdMember.query().where('household_id', real.household.id), 2)
    assert.lengthOf(await HouseholdMember.query().where('user_id', user.id), 1)
  })

  test('test_smoke_user_who_shares_a_household_is_left_alone', async ({ assert }) => {
    const shared = await createHousehold({ users: 2 })
    const bootstrap = await app.container.make(ProductionBootstrap)

    const result = await bootstrap.ensureSmokeUser({ ...smoke, email: shared.member.email })

    assert.isNull(result.household)
    const memberships = await HouseholdMember.query().where('user_id', shared.member.id)
    assert.deepEqual(
      memberships.map((m) => m.householdId),
      [shared.household.id]
    )
    assert.lengthOf(await Household.query().where('name', 'Smoke'), 0)
  })

  test('test_smoke_user_alone_in_an_existing_household_keeps_it', async ({ assert }) => {
    const solo = await createHousehold({ name: 'Solo' })
    const bootstrap = await app.container.make(ProductionBootstrap)

    const result = await bootstrap.ensureSmokeUser({ ...smoke, email: solo.owner.email })

    assert.equal(result.household?.id, solo.household.id)
    assert.lengthOf(await Household.query().where('name', 'Smoke'), 0)
  })
})
