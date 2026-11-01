import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Account from '#models/account'
import Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { createHousehold } from '#tests/helpers/household'
import { UserFactory } from '#database/factories/user_factory'
import { BACKFILL_ONBOARDED_AT } from '#database/migrations/1792060000062_add_onboarded_at_to_households_table'

const URL = '/api/v1/household/onboarding/complete'

test.group('Household / onboarding', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_a_new_household_is_not_onboarded_yet', async ({ client }) => {
    const user = await UserFactory.create()

    const created = await client
      .post('/api/v1/households')
      .json({ name: 'Fresh home' })
      .actingAs(user)
    const me = await client.get('/api/v1/auth/me').actingAs(user)

    created.assertStatus(201)
    created.assertBodyContains({ data: { household: { onboardedAt: null } } })
    me.assertBodyContains({ data: { household: { onboardedAt: null } } })
  })

  test('test_the_owner_completing_the_wizard_stamps_onboarded_at_for_every_device', async ({
    client,
    assert,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })

    const response = await client.post(URL).actingAs(owner)

    response.assertStatus(200)
    const stamped = response.body().data.onboardedAt as string
    assert.isString(stamped)
    await household.refresh()
    assert.equal(household.onboardedAt?.toISO(), DateTime.fromISO(stamped).toISO())
    // GET /auth/me carries it to any device, the partner's included.
    for (const user of [owner, member]) {
      const me = await client.get('/api/v1/auth/me').actingAs(user)
      me.assertBodyContains({ data: { household: { id: household.id, onboardedAt: stamped } } })
    }
  })

  test('test_completing_the_wizard_again_keeps_the_first_stamp', async ({ client }) => {
    const { household, owner } = await createHousehold()
    const first = DateTime.fromISO('2026-09-01T10:00:00.000Z')
    household.onboardedAt = first
    await household.save()

    const response = await client.post(URL).actingAs(owner)

    response.assertStatus(200)
    response.assertBodyContains({ data: { onboardedAt: '2026-09-01T10:00:00.000Z' } })
  })

  test('test_a_member_cannot_complete_the_wizard', async ({ client, assert }) => {
    const { household, member } = await createHousehold({ users: 2 })

    const response = await client.post(URL).actingAs(member)

    response.assertStatus(403)
    await household.refresh()
    assert.isNull(household.onboardedAt)
  })

  test('test_completing_the_wizard_is_closed_while_the_household_is_pending_deletion', async ({
    client,
  }) => {
    const { household, owner } = await createHousehold()
    household.merge({
      status: 'pending_deletion',
      deletionScheduledAt: DateTime.now().plus({ days: 30 }),
    })
    await household.save()

    const response = await client.post(URL).actingAs(owner)

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_HOUSEHOLD_PENDING_DELETION' })
  })

  test('test_the_backfill_onboards_households_that_already_have_accounts', async ({ assert }) => {
    const withAccounts = await createHousehold({ accounts: [{ name: 'Everyday' }, {}] })
    const withoutAccounts = await createHousehold()
    const alreadyOnboarded = await createHousehold({ accounts: [{ name: 'Cash' }] })
    const firstAccountAt = DateTime.fromISO('2026-03-02T09:30:00.000Z')
    await Account.query()
      .where('id', withAccounts.accounts[0].id)
      .update({ created_at: firstAccountAt.toJSDate() })
    const stamp = DateTime.fromISO('2026-08-01T00:00:00.000Z')
    alreadyOnboarded.household.onboardedAt = stamp
    await alreadyOnboarded.household.save()

    await db.rawQuery(BACKFILL_ONBOARDED_AT)

    const onboardedAt = async (id: number) => {
      const household = await Household.findOrFail(id)
      return household.onboardedAt?.toMillis() ?? null
    }
    // Since their first account; nobody else changes.
    assert.equal(await onboardedAt(withAccounts.household.id), firstAccountAt.toMillis())
    assert.isNull(await onboardedAt(withoutAccounts.household.id))
    assert.equal(await onboardedAt(alreadyOnboarded.household.id), stamp.toMillis())
  })
})
