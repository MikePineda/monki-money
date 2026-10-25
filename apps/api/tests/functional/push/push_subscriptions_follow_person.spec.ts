import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import Invitation from '#models/invitation'
import limiter from '@adonisjs/limiter/services/main'
import PushNotifier from '#services/push/push_notifier'
import PushSubscription from '#models/push_subscription'
import { createHousehold } from '#tests/helpers/household'
import { FACTORY_PASSWORD } from '#database/factories/user_factory'
import { generateInvitationToken, hashInvitationToken } from '#domain/households/invitation_token'
import { subscribeDevice } from '#tests/helpers/push'

/** An invitation to `householdId` for `email` with a known token. */
async function invite(householdId: number, email: string) {
  const token = generateInvitationToken()
  await Invitation.create({
    householdId,
    email,
    tokenHash: hashInvitationToken(token),
    role: 'member',
    expiresAt: DateTime.now().plus({ days: 7 }),
    acceptedAt: null,
  })
  return token
}

function devicesOf(userId: number) {
  return PushSubscription.query().where('user_id', userId).orderBy('id')
}

test.group('Push subscriptions follow their person', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_leaving_a_household_detaches_the_persons_devices', async ({ client, assert }) => {
    const { household, member } = await createHousehold({ users: 2 })
    const phone = await subscribeDevice(member, household)
    const laptop = await subscribeDevice(member, household)

    const response = await client.post('/api/v1/household/leave').actingAs(member)

    response.assertStatus(204)
    const devices = await devicesOf(member.id)
    assert.deepEqual(
      devices.map((device) => [device.id, device.householdId]),
      [
        [phone.id, null],
        [laptop.id, null],
      ]
    )
    const notifier = await app.container.make(PushNotifier)
    assert.lengthOf(await notifier.devicesOf(member.id, household.id), 0, 'nothing goes out')
  })

  test('test_the_devices_move_to_the_household_their_person_joins_by_invitation', async ({
    client,
    assert,
  }) => {
    const before = await createHousehold({ users: 2 })
    const phone = await subscribeDevice(before.member, before.household)
    const after = await createHousehold()
    const partnersPhone = await subscribeDevice(after.owner, after.household)
    await client.post('/api/v1/household/leave').actingAs(before.member)

    const token = await invite(after.household.id, before.member.email)
    const accepted = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ password: FACTORY_PASSWORD })
      .withCsrfToken()

    accepted.assertStatus(200)
    await phone.refresh()
    assert.equal(phone.householdId, after.household.id)
    await partnersPhone.refresh()
    assert.equal(partnersPhone.householdId, after.household.id, 'nobody else moves')
    const notifier = await app.container.make(PushNotifier)
    const reachable = await notifier.devicesOf(before.member.id, after.household.id)
    assert.deepEqual(
      reachable.map((device) => device.id),
      [phone.id],
      'pushes resume without opening Settings'
    )
  })

  test('test_the_devices_move_to_a_household_their_person_creates_after_leaving', async ({
    client,
    assert,
  }) => {
    const { household, member } = await createHousehold({ users: 2 })
    const phone = await subscribeDevice(member, household)
    await client.post('/api/v1/household/leave').actingAs(member)

    const created = await client
      .post('/api/v1/households')
      .json({ name: 'New flat' })
      .actingAs(member)

    created.assertStatus(201)
    await phone.refresh()
    assert.equal(phone.householdId, created.body().data.household.id)
  })

  test('test_a_failed_join_leaves_the_devices_where_they_were', async ({ client, assert }) => {
    const first = await createHousehold()
    const phone = await subscribeDevice(first.owner, first.household)
    const second = await createHousehold()
    const token = await invite(second.household.id, first.owner.email)

    // Already in a household: 409, nothing moves.
    const refused = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ password: FACTORY_PASSWORD })
      .withCsrfToken()

    refused.assertStatus(409)
    await phone.refresh()
    assert.equal(phone.householdId, first.household.id)
  })
})
