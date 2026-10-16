import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import HouseholdMember from '#models/household_member'
import { MAX_DEVICES_PER_PERSON } from '#services/push/push_subscription_service'
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
    renewed.keys.auth = 'bmV3LWF1dGgtc2VjcmV0IQ' // gitleaks:allow

    const response = await client.post('/api/v1/push/subscriptions').json(renewed).actingAs(owner)

    response.assertStatus(200)
    const devices = await devicesOf(owner.id)
    assert.lengthOf(devices, 1)
    assert.include(devices[0].serialize(), {
      id: existing.id,
      auth: 'bmV3LWF1dGgtc2VjcmV0IQ', // gitleaks:allow
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
    const plainHttp = {
      ...aBrowserSubscription(),
      endpoint: 'http://fcm.googleapis.com/fcm/send/1',
    }
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

  test('test_only_endpoints_of_the_known_push_services_are_accepted', async ({
    client,
    assert,
  }) => {
    const { owner } = await createHousehold()

    for (const endpoint of [
      'https://127.0.0.1:6379/x',
      'https://169.254.169.254/latest/meta-data/iam',
      'https://[::1]:5432/',
      'https://tarpit.example.test/send/1',
      'https://fcm.googleapis.com:8443/fcm/send/1',
    ]) {
      const response = await client
        .post('/api/v1/push/subscriptions')
        .json(aBrowserSubscription(endpoint))
        .actingAs(owner)

      response.assertStatus(422)
      assert.deepInclude(response.body().errors, {
        field: 'endpoint',
        rule: 'pushEndpoint',
        message: 'The push address is not a supported push service',
      })
    }
    assert.lengthOf(await devicesOf(owner.id), 0)

    for (const endpoint of [
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
      'https://web.push.apple.com/QGuQyavXutnMHW',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB',
    ]) {
      const response = await client
        .post('/api/v1/push/subscriptions')
        .json(aBrowserSubscription(endpoint))
        .actingAs(owner)
      response.assertStatus(201)
    }
  })

  test('test_keys_must_be_a_real_p256_point_and_a_16_byte_secret', async ({ client, assert }) => {
    const { owner } = await createHousehold()
    const weak = { endpoint: anEndpoint(), keys: { p256dh: 'A', auth: 'A' } }

    const response = await client.post('/api/v1/push/subscriptions').json(weak).actingAs(owner)

    response.assertStatus(422)
    const fields = response
      .body()
      .errors.map((error: { field: string; rule: string }) => [error.field, error.rule])
    assert.sameDeepMembers(fields, [
      ['keys.p256dh', 'pushKey'],
      ['keys.auth', 'pushKey'],
    ])
    assert.lengthOf(await devicesOf(owner.id), 0)
  })

  test('test_a_person_keeps_ten_devices_and_the_least_recent_one_goes', async ({
    client,
    assert,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const partners = await subscribeDevice(member, household)
    const old = []
    for (let index = 0; index < MAX_DEVICES_PER_PERSON; index += 1) {
      const device = await subscribeDevice(owner, household)
      // Registered a minute apart, oldest first.
      await db
        .from('push_subscriptions')
        .where('id', device.id)
        .update({
          updated_at: DateTime.now()
            .minus({ minutes: 60 - index })
            .toJSDate(),
        })
      old.push(device)
    }
    // Refreshed today with nothing new: no longer the least recent one.
    await client
      .post('/api/v1/push/subscriptions')
      .header('user-agent', 'Test browser')
      .json(aBrowserSubscription(old[0].endpoint))
      .actingAs(owner)

    const response = await client
      .post('/api/v1/push/subscriptions')
      .json(aBrowserSubscription())
      .actingAs(owner)

    response.assertStatus(201)
    const kept = await devicesOf(owner.id)
    assert.lengthOf(kept, MAX_DEVICES_PER_PERSON)
    const keptIds = kept.map((device) => device.id)
    assert.notInclude(keptIds, old[1].id, 'the least recently registered one went')
    assert.include(keptIds, old[0].id)
    assert.include(keptIds, response.body().data.id)
    assert.isNotNull(
      await PushSubscription.find(partners.id),
      'per person: the partner keeps theirs'
    )
  })

  test('test_subscribing_needs_a_signed_in_person', async ({ client }) => {
    const response = await client
      .post('/api/v1/push/subscriptions')
      .json(aBrowserSubscription())
      .withCsrfToken()

    response.assertStatus(401)
  })
})
