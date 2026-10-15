import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import type Account from '#models/account'
import Category from '#models/category'
import Invitation from '#models/invitation'
import AccountCard from '#models/account_card'
import router from '@adonisjs/core/services/router'
import CategoryGroup from '#models/category_group'
import { createHousehold, type TestHousehold } from '#tests/helpers/household'
import { generateInvitationToken, hashInvitationToken } from '#domain/households/invitation_token'

/**
 * Cross-household access answers 404 (never 403, which would leak that the
 * id exists) and leaves the victim's data untouched. One case per route
 * with an `:id`-like param; the guard test below fails when a new route is
 * added without a case here.
 */

interface Victim {
  household: TestHousehold
  account: Account
  card: AccountCard
  group: CategoryGroup
  category: Category
  invitation: Invitation
}

interface Attacker {
  household: TestHousehold
  account: Account
}

interface IsolationCase {
  route: string
  method: 'get' | 'patch' | 'post' | 'put' | 'delete'
  url: (victim: Victim, attacker: Attacker) => string
  body?: Record<string, unknown>
}

const cases: IsolationCase[] = [
  { route: 'accounts.show', method: 'get', url: (v) => `/api/v1/accounts/${v.account.id}` },
  {
    route: 'accounts.update',
    method: 'patch',
    url: (v) => `/api/v1/accounts/${v.account.id}`,
    body: { name: 'Hijacked' },
  },
  { route: 'accounts.destroy', method: 'delete', url: (v) => `/api/v1/accounts/${v.account.id}` },
  {
    route: 'accounts.cards.store',
    method: 'post',
    url: (v) => `/api/v1/accounts/${v.account.id}/cards`,
    body: { cardSuffix: '9999' },
  },
  {
    route: 'accounts.cards.destroy',
    method: 'delete',
    url: (v) => `/api/v1/accounts/${v.account.id}/cards/${v.card.id}`,
  },
  {
    // Own account in the path, another household's card id.
    route: 'accounts.cards.destroy',
    method: 'delete',
    url: (v, a) => `/api/v1/accounts/${a.account.id}/cards/${v.card.id}`,
  },
  {
    route: 'category_groups.update',
    method: 'patch',
    url: (v) => `/api/v1/category-groups/${v.group.id}`,
    body: { name: 'Hijacked' },
  },
  {
    route: 'category_groups.destroy',
    method: 'delete',
    url: (v) => `/api/v1/category-groups/${v.group.id}`,
  },
  {
    route: 'categories.update',
    method: 'patch',
    url: (v) => `/api/v1/categories/${v.category.id}`,
    body: { name: 'Hijacked' },
  },
  {
    route: 'categories.destroy',
    method: 'delete',
    url: (v) => `/api/v1/categories/${v.category.id}`,
  },
  {
    route: 'household.invitations.destroy',
    method: 'delete',
    url: (v) => `/api/v1/household/invitations/${v.invitation.id}`,
  },
  {
    route: 'household.invitations.resend',
    method: 'post',
    url: (v) => `/api/v1/household/invitations/${v.invitation.id}/resend`,
  },
]

/**
 * Routes with params that are not household-scoped ids: public invitation
 * routes are looked up by an unguessable token, not by id.
 */
const NOT_ID_SCOPED = new Set(['auth.invitations.show', 'auth.invitations.accept'])

async function victimHousehold(): Promise<Victim> {
  const household = await createHousehold({
    taxonomy: true,
    accounts: [{ name: 'Victim account' }],
  })
  const account = household.accounts[0]
  const card = await AccountCard.create({
    accountId: account.id,
    cardSuffix: '4242',
    userId: household.owner.id,
  })
  const group = await CategoryGroup.query()
    .where('household_id', household.household.id)
    .where('slug', 'food')
    .firstOrFail()
  const category = await Category.query()
    .where('household_id', household.household.id)
    .where('slug', 'groceries')
    .firstOrFail()
  const invitation = await Invitation.create({
    householdId: household.household.id,
    email: 'victim-invitee@example.test',
    tokenHash: hashInvitationToken(generateInvitationToken()),
    role: 'member',
    expiresAt: DateTime.now().plus({ days: 7 }),
  })
  return { household, account, card, group, category, invitation }
}

test.group('Tenant isolation', () => {
  test('test_every_resource_returns_404_for_other_household ({$self})')
    .with(cases.map((entry) => ({ ...entry, toString: () => `${entry.method} ${entry.route}` })))
    .run(async ({ client, assert }, entry) => {
      const victim = await victimHousehold()
      const attackerHousehold = await createHousehold({
        taxonomy: true,
        accounts: [{ name: 'Attacker account' }],
      })
      const attacker = { household: attackerHousehold, account: attackerHousehold.accounts[0] }

      const request = client[entry.method](entry.url(victim, attacker))
      if (entry.body) request.json(entry.body)
      const response = await request.actingAs(attackerHousehold.owner)

      response.assertStatus(404)

      // Nothing of the victim changed.
      await victim.account.refresh()
      assert.equal(victim.account.name, 'Victim account')
      assert.isNotNull(await AccountCard.find(victim.card.id))
      await victim.group.refresh()
      assert.equal(victim.group.slug, 'food')
      await victim.category.refresh()
      assert.equal(victim.category.slug, 'groceries')
      assert.isTrue(victim.category.isSystem)
      const invitation = await Invitation.find(victim.invitation.id)
      assert.equal(invitation?.tokenHash, victim.invitation.tokenHash)
      assert.lengthOf(await AccountCard.query().where('account_id', victim.account.id), 1)
    })

  test('test_isolation_dataset_covers_every_route_with_an_id', ({ assert }) => {
    const routes = Object.values(router.toJSON()).flat()
    const withParams = routes
      .filter((route) => route.pattern.startsWith('/api/') && route.pattern.includes('/:'))
      .map((route) => route.name!)
      .filter((name) => !NOT_ID_SCOPED.has(name))

    assert.isNotEmpty(withParams)
    assert.sameMembers(
      [...new Set(withParams)].sort(),
      [...new Set(cases.map((entry) => entry.route))].sort(),
      'Every route with an :id needs a tenant isolation case (or a reason in NOT_ID_SCOPED)'
    )
  })

  test('test_lists_only_show_the_current_household', async ({ client, assert }) => {
    const victim = await victimHousehold()
    const attacker = await createHousehold({ taxonomy: true, accounts: [{ name: 'Mine' }] })

    const accounts = await client.get('/api/v1/accounts').actingAs(attacker.owner)
    assert.deepEqual(
      accounts.body().data.map((a: any) => a.name),
      ['Mine']
    )

    const categories = await client.get('/api/v1/categories').actingAs(attacker.owner)
    const victimCategories = await Category.query().where(
      'household_id',
      victim.household.household.id
    )
    const victimIds = new Set(victimCategories.map((c) => c.id))
    assert.isTrue(categories.body().data.every((c: any) => !victimIds.has(c.id)))

    const members = await client.get('/api/v1/household/members').actingAs(attacker.owner)
    assert.deepEqual(
      members.body().data.map((m: any) => m.userId),
      [attacker.owner.id]
    )
  })

  test('test_foreign_ids_in_a_body_are_rejected_with_422', async ({ client }) => {
    const victim = await victimHousehold()
    const attacker = await createHousehold({ taxonomy: true, accounts: [{ name: 'Mine' }] })

    const reorder = await client
      .put('/api/v1/accounts/reorder')
      .json({ ids: [attacker.accounts[0].id, victim.account.id] })
      .actingAs(attacker.owner)
    reorder.assertStatus(422)

    const card = await client
      .post(`/api/v1/accounts/${attacker.accounts[0].id}/cards`)
      .json({ cardSuffix: '1234', userId: victim.household.owner.id })
      .actingAs(attacker.owner)
    card.assertStatus(422)
    card.assertBodyContains({ errors: [{ field: 'userId', rule: 'database.exists' }] })

    const ownCategory = await Category.query()
      .where('household_id', attacker.household.id)
      .firstOrFail()
    const move = await client
      .patch(`/api/v1/categories/${ownCategory.id}`)
      .json({ categoryGroupId: victim.group.id })
      .actingAs(attacker.owner)
    move.assertStatus(422)
    move.assertBodyContains({ errors: [{ field: 'categoryGroupId', rule: 'database.exists' }] })
  })
})
