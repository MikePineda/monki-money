import { test } from '@japa/runner'
import { createHousehold } from '#tests/helpers/household'
import UserNotificationSetting from '#models/user_notification_setting'

test.group('Notification preferences', () => {
  test('test_a_person_who_never_chose_gets_the_summary_and_no_reminder_at_20', async ({
    client,
    assert,
  }) => {
    const { owner } = await createHousehold()

    const response = await client.get('/api/v1/me/notifications').actingAs(owner)

    response.assertStatus(200)
    response.assertBody({
      data: { summaryReady: true, dailyReminder: false, reminderTime: '20:00' },
    })
    assert.isNull(
      await UserNotificationSetting.findBy('user_id', owner.id),
      'reading writes nothing'
    )
  })

  test('test_patch_saves_the_given_fields_and_keeps_the_rest', async ({ client, assert }) => {
    const { owner } = await createHousehold()

    const first = await client
      .patch('/api/v1/me/notifications')
      .json({ dailyReminder: true, reminderTime: '21:30' })
      .actingAs(owner)
    first.assertStatus(200)
    first.assertBody({ data: { summaryReady: true, dailyReminder: true, reminderTime: '21:30' } })

    const second = await client
      .patch('/api/v1/me/notifications')
      .json({ summaryReady: false })
      .actingAs(owner)
    second.assertBody({ data: { summaryReady: false, dailyReminder: true, reminderTime: '21:30' } })

    const shown = await client.get('/api/v1/me/notifications').actingAs(owner)
    shown.assertBody(second.body())
    assert.lengthOf(await UserNotificationSetting.query().where('user_id', owner.id), 1)
  })

  test('test_an_empty_patch_answers_the_current_preferences', async ({ client }) => {
    const { owner } = await createHousehold()

    const response = await client.patch('/api/v1/me/notifications').json({}).actingAs(owner)

    response.assertStatus(200)
    response.assertBody({
      data: { summaryReady: true, dailyReminder: false, reminderTime: '20:00' },
    })
  })

  test('test_patch_refuses_a_malformed_time_or_a_non_boolean_switch', async ({
    client,
    assert,
  }) => {
    const { owner } = await createHousehold()

    for (const [field, value] of [
      ['reminderTime', '24:00'],
      ['reminderTime', '7:30'],
      ['reminderTime', '19:30:00'],
      ['reminderTime', 1930],
      ['summaryReady', 'yes'],
      ['dailyReminder', 1],
    ] as const) {
      const response = await client
        .patch('/api/v1/me/notifications')
        .json({ [field]: value })
        .actingAs(owner)

      response.assertStatus(422)
      assert.equal(response.body().errors[0].field, field, `${field}: ${value}`)
    }
    assert.isNull(await UserNotificationSetting.findBy('user_id', owner.id))
  })

  test('test_preferences_belong_to_one_person_only', async ({ client }) => {
    const { owner, member } = await createHousehold({ users: 2 })

    await client
      .patch('/api/v1/me/notifications')
      .json({ summaryReady: false, dailyReminder: true })
      .actingAs(owner)

    const partners = await client.get('/api/v1/me/notifications').actingAs(member)
    partners.assertBody({
      data: { summaryReady: true, dailyReminder: false, reminderTime: '20:00' },
    })
  })

  test('test_preferences_need_a_signed_in_person', async ({ client }) => {
    const response = await client.get('/api/v1/me/notifications')

    response.assertStatus(401)
  })
})
