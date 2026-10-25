import { test } from '@japa/runner'
import PushTest from '#commands/push_test'
import ace from '@adonisjs/core/services/ace'
import PushSubscription from '#models/push_subscription'
import { createHousehold } from '#tests/helpers/household'
import { fakePush, subscribeDevice } from '#tests/helpers/push'

/** Runs the command; `lines` are its own output (the raw-mode logger is shared). */
async function runCommand(...args: string[]) {
  const command = await ace.create(PushTest, args)
  const before = command.logger.getLogs().length
  await command.exec()
  return {
    command,
    lines: command.logger
      .getLogs()
      .slice(before)
      .map((log) => log.message),
  }
}

test.group('push:test command', (group) => {
  group.each.setup(() => {
    ace.ui.switchMode('raw')
    return () => ace.ui.switchMode('normal')
  })

  test('test_every_device_of_the_user_gets_a_test_notification', async ({ assert, cleanup }) => {
    const push = fakePush(cleanup)
    const { household, owner, member } = await createHousehold({ users: 2 })
    await owner.merge({ locale: 'es' }).save()
    const phone = await subscribeDevice(owner, household, { userAgent: 'iPhone Safari' })
    const tablet = await subscribeDevice(owner, household, { userAgent: null })
    const partnersPhone = await subscribeDevice(member, household)
    push.answer(tablet.endpoint, { status: 'gone', statusCode: 410 })

    const { command, lines } = await runCommand('--user', String(owner.id))

    command.assertSucceeded()
    assert.deepEqual(lines, [
      `device ${phone.id} (iPhone Safari): sent`,
      `device ${tablet.id} (unknown browser): gone (410), subscription deleted`,
    ])
    assert.deepEqual(push.to(phone.endpoint), [
      {
        title: 'Las notificaciones funcionan',
        body: 'Esta es una prueba de monkimoney.',
        url: '/settings',
        tag: 'push-test',
      },
    ])
    assert.lengthOf(push.to(partnersPhone.endpoint), 0)
    assert.isNull(await PushSubscription.find(tablet.id))
  })

  test('test_the_command_fails_when_no_device_got_it', async ({ cleanup }) => {
    const push = fakePush(cleanup)
    const { household, owner } = await createHousehold()
    const phone = await subscribeDevice(owner, household, { userAgent: 'Pixel Chrome' })
    push.answer(phone.endpoint, {
      status: 'failed',
      error: 'E_PUSH_REJECTED: 403',
      statusCode: 403,
    })

    const { command } = await runCommand('--user', String(owner.id))

    command.assertFailed()
    command.assertLog(`device ${phone.id} (Pixel Chrome): failed (E_PUSH_REJECTED: 403)`)
  })

  test('test_the_command_says_when_a_device_was_dropped_after_ten_failures', async ({
    assert,
    cleanup,
  }) => {
    const push = fakePush(cleanup)
    const { household, owner } = await createHousehold()
    const phone = await subscribeDevice(owner, household, {
      userAgent: 'Pixel Chrome',
      failures: 9,
    })
    push.answer(phone.endpoint, {
      status: 'failed',
      error: 'E_PUSH_REJECTED: 403',
      statusCode: 403,
    })

    const { command } = await runCommand('--user', String(owner.id))

    command.assertFailed()
    command.assertLog(
      `device ${phone.id} (Pixel Chrome): failed (E_PUSH_REJECTED: 403), subscription deleted after 10 failures in a row`
    )
    assert.isNull(await PushSubscription.find(phone.id))
  })

  test('test_the_command_needs_a_known_user_with_a_device', async ({ cleanup }) => {
    fakePush(cleanup)
    const { owner } = await createHousehold()

    const missingFlag = await runCommand()
    missingFlag.command.assertFailed()
    missingFlag.command.assertLogMatches(/--user <id> is required/)

    const unknown = await runCommand('--user', '999999')
    unknown.command.assertFailed()
    unknown.command.assertLogMatches(/User 999999 not found/)

    const noDevice = await runCommand('--user', String(owner.id))
    noDevice.command.assertFailed()
    noDevice.command.assertLogMatches(/has no device subscribed/)
  })
})
