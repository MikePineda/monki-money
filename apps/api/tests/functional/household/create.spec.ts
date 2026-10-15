import { test } from '@japa/runner'
import Category from '#models/category'
import Household from '#models/household'
import HouseholdMember from '#models/household_member'
import limiter from '@adonisjs/limiter/services/main'
import { createHousehold } from '#tests/helpers/household'
import { UserFactory } from '#database/factories/user_factory'

test.group('Household / create', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_user_without_household_can_create_one_with_localized_taxonomy', async ({
    client,
    assert,
  }) => {
    const user = await UserFactory.apply('spanish').create()

    const response = await client
      .post('/api/v1/households')
      .json({ name: 'Casa nueva' })
      .actingAs(user)

    response.assertStatus(201)
    const { household, membership } = response.body().data
    assert.include(household, {
      name: 'Casa nueva',
      locale: 'es',
      timezone: 'Australia/Brisbane',
      currencyCode: 'AUD',
      plan: 'free',
      status: 'active',
    })
    assert.include(membership, { householdId: household.id, role: 'owner' })
    await user.refresh()
    assert.equal(user.currentHouseholdId, household.id)

    const groceries = await Category.query()
      .where('household_id', household.id)
      .where('slug', 'groceries')
      .firstOrFail()
    assert.equal(groceries.name, 'Supermercado')

    // The same session reaches the new household right away.
    const show = await client.get('/api/v1/household').actingAs(user)
    show.assertStatus(200)
    show.assertBodyContains({ data: { id: household.id } })
  })

  test('test_create_household_takes_locale_timezone_and_currency', async ({ client, assert }) => {
    const user = await UserFactory.create()

    const response = await client
      .post('/api/v1/households')
      .json({ name: 'Our flat', locale: 'es', timezone: 'Australia/Sydney', currencyCode: 'nzd' })
      .actingAs(user)

    response.assertStatus(201)
    assert.include(response.body().data.household, {
      locale: 'es',
      timezone: 'Australia/Sydney',
      currencyCode: 'NZD',
    })
  })

  test('test_create_household_validates_the_body', async ({ client }) => {
    const user = await UserFactory.create()

    const response = await client
      .post('/api/v1/households')
      .json({ name: '', timezone: 'Mars/Olympus', currencyCode: 'dollars' })
      .actingAs(user)

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [{ field: 'name' }, { field: 'timezone' }, { field: 'currencyCode' }],
    })
  })

  test('test_user_with_household_cannot_create_another', async ({ client, assert }) => {
    const { owner, member } = await createHousehold({ users: 2 })
    const before = await Household.query().count('* as total').firstOrFail()

    const asOwner = await client
      .post('/api/v1/households')
      .json({ name: 'Second home' })
      .actingAs(owner)
    const asMember = await client
      .post('/api/v1/households')
      .json({ name: 'Second home' })
      .actingAs(member)

    for (const response of [asOwner, asMember]) {
      response.assertStatus(409)
      response.assertBodyContains({ code: 'E_ALREADY_IN_HOUSEHOLD' })
    }
    const after = await Household.query().count('* as total').firstOrFail()
    assert.equal(after.$extras.total, before.$extras.total)
  })

  test('test_create_household_requires_verified_email', async ({ client, assert }) => {
    const user = await UserFactory.apply('unverified').create()

    const response = await client
      .post('/api/v1/households')
      .json({ name: 'Unverified home' })
      .actingAs(user)

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_EMAIL_NOT_VERIFIED' })
    assert.isNull(await HouseholdMember.findBy('user_id', user.id))
  })

  test('test_create_household_requires_login', async ({ client }) => {
    const response = await client
      .post('/api/v1/households')
      .json({ name: 'Anonymous home' })
      .withCsrfToken()

    response.assertStatus(401)
  })

  test('test_leave_then_create_round_trip_restores_access', async ({ client, assert }) => {
    const { household: oldHome, member } = await createHousehold({ users: 2 })

    const left = await client.post('/api/v1/household/leave').actingAs(member)
    left.assertStatus(204)
    const lost = await client.get('/api/v1/accounts').actingAs(member)
    lost.assertStatus(403)
    lost.assertBodyContains({ code: 'E_NO_HOUSEHOLD' })

    const created = await client
      .post('/api/v1/households')
      .json({ name: 'My own place' })
      .actingAs(member)
    created.assertStatus(201)
    const newHome = created.body().data.household
    assert.notEqual(newHome.id, oldHome.id)

    const me = await client.get('/api/v1/auth/me').actingAs(member)
    me.assertBodyContains({
      data: { household: { id: newHome.id }, membership: { role: 'owner' } },
    })
    const accounts = await client.get('/api/v1/accounts').actingAs(member)
    accounts.assertStatus(200)
    accounts.assertBody({ data: [] })
  })
})
