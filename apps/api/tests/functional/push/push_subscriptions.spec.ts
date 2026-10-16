import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import HouseholdMember from '#models/household_member'
import PushSubscription from '#models/push_subscription'
import { createHousehold } from '#tests/helpers/household'
import { aBrowserSubscription, anEndpoint, subscribeDevice } from '#tests/helpers/push'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

function devicesOf(userId: number) {
  return PushSubscription.query().where('user_id', userId).orderBy('id')
}

test.group('Push subscriptions', () => {
  test('test_a_device_subscribes_for_the_current_person_and_household', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await createHousehold()
    const browser = aBrowserSubscription()

    const response = await client
      .post('/api/v1/push/subscriptions')
      .header('user-agent', IPHONE)
      .json(browser)
      .actingAs(owner)

    response.assertStatus(201)
    response.assertBodyContains({ data: { endpoint: browser.endpoint, userAgent: IPHONE } })
    assert.notProperty(response.body().data, 'p256dh')
    assert.notProperty(response.body().data, 'auth')
    const [device] = await devicesOf(owner.id)
    assert.include(device.serialize(), {
      householdId: household.id,
      endpoint: browser.endpoint,
      p256Dh: browser.keys.p256dh,
      auth: browser.keys.auth,
      failures: 0,
    })
  })

  test('test_subscribing_the_same_endpoint_again_refreshes_it_without_a_second_row', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await createHousehold()
    const existing = await subscribeDevice(owner, household, { failures: 4 })
    const renewed = aBrowserSubscription(existing.endpoint)
    renewed.keys.auth = 'bmV3LWF1dGgtc2VjcmV0'

    const response = await client.post('/api/v1/push/subscriptions').json(renewed).actingAs(owner)

    response.assertStatus(200)
    const devices = await devicesOf(owner.id)
    assert.lengthOf(devices, 1)
    assert.include(devices[0].serialize(), {
      id: existing.id,
      auth: 'bmV3LWF1dGgtc2VjcmV0',
      failures: 0,
    })
  })

  test('test_a_device_registered_before_moves_to_the_current_household', async ({
    client,
    assert,
  }) => {
    const before = await createHousehold()
    const device = await subscribeDevice(before.owner, before.household)
    const after = await createHousehold()
    await HouseholdMember.create({
      householdId: after.household.id,
      userId: before.owner.id,
      role: 'member',
      joinedAt: DateTime.now(),
    })
    await before.owner.merge({ currentHouseholdId: after.household.id }).save()

    const response = await client
      .post('/api/v1/push/subscriptions')
      .json(aBrowserSubscription(device.endpoint))
      .actingAs(before.owner)

    response.assertStatus(200)
    await device.refresh()
    assert.equal(device.householdId, after.household.id)
  })

  test('test_an_endpoint_the_partner_registered_answers_404_and_stays_theirs', async ({
    client,
    assert,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const partners = await subscribeDevice(member, household)

    const response = await client
      .post('/api/v1/push/subscriptions')
      .json(aBrowserSubscription(partners.endpoint))
      .actingAs(owner)

    response.assertStatus(404)
    response.assertBodyContains({ code: 'E_ROW_NOT_FOUND' })
    await partners.refresh()
    assert.equal(partners.userId, member.id)
    assert.lengthOf(await devicesOf(owner.id), 0)
  })

  test('test_unsubscribe_forgets_only_the_given_device_of_the_current_person', async ({
    client,
    assert,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const phone = await subscribeDevice(owner, household)
    const laptop = await subscribeDevice(owner, household)
    const partners = await subscribeDevice(member, household)

    const response = await client
      .delete('/api/v1/push/subscriptions')
      .json({ endpoint: phone.endpoint })
      .actingAs(owner)

    response.assertStatus(204)
    const left = await devicesOf(owner.id)
    assert.deepEqual(
      left.map((device) => device.id),
      [laptop.id]
    )
    assert.isNotNull(await PushSubscription.find(partners.id))

    const again = await client
      .delete('/api/v1/push/subscriptions')
      .json({ endpoint: phone.endpoint })
      .actingAs(owner)
    again.assertStatus(404)
  })

  test('test_a_partner_cannot_unsubscribe_my_device', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const mine = await subscribeDevice(owner, household)

    const response = await client
      .delete('/api/v1/push/subscriptions')
      .json({ endpoint: mine.endpoint })
      .actingAs(member)

    response.assertStatus(404)
    assert.isNotNull(await PushSubscription.find(mine.id))
  })

  test('test_the_subscription_must_be_an_https_endpoint_with_both_keys', async ({
    client,
    assert,
  }) => {
    const { owner } = await createHousehold()
    const plainHttp = { ...aBrowserSubscription(), endpoint: 'http://push.example.test/send/1' }
    const noKeys = { endpoint: anEndpoint() }
    const badKey = aBrowserSubscription()
    badKey.keys.p256dh = 'not base64!'

    for (const body of [plainHttp, noKeys, badKey]) {
      const response = await client.post('/api/v1/push/subscriptions').json(body).actingAs(owner)
      response.assertStatus(422)
    }
    const missing = await client.delete('/api/v1/push/subscriptions').json({}).actingAs(owner)
    missing.assertStatus(422)
    assert.lengthOf(await devicesOf(owner.id), 0)
  })

  test('test_subscribing_needs_a_signed_in_person', async ({ client }) => {
    const response = await client
      .post('/api/v1/push/subscriptions')
      .json(aBrowserSubscription())
      .withCsrfToken()

    response.assertStatus(401)
  })
})
