import { test } from '@japa/runner'
import webpush from 'web-push'
import app from '@adonisjs/core/services/app'
import ace from '@adonisjs/core/services/ace'
import db from '@adonisjs/lucid/services/db'
import { Secret } from '@adonisjs/core/helpers'
import PushRotateKeys from '#commands/push_rotate_keys'
import PushSubscription from '#models/push_subscription'
import AppSettings from '#services/settings/app_settings'
import { createHousehold } from '#tests/helpers/household'
import { subscribeDevice } from '#tests/helpers/push'
import VapidKeys, { VAPID_PUBLIC_KEY_SETTING, type VapidSettings } from '#services/push/vapid_keys'

type Cleanup = (callback: () => void) => void

const SUBJECT = 'https://app.example.test'

const silentLogger = { info: () => undefined, error: () => undefined }

/** A VapidKeys with nothing cached yet, bound for this test (the app keeps one per process). */
function freshVapidKeys(cleanup: Cleanup, settings: Partial<VapidSettings> = {}) {
  const keys = new VapidKeys(
    { publicKey: null, privateKey: null, subject: SUBJECT, ...settings },
    new AppSettings(),
    silentLogger
  )
  app.container.swap(VapidKeys, () => keys)
  cleanup(() => app.container.restore(VapidKeys))
  return keys
}

/** Runs the command; `lines` are its own output (the raw-mode logger is shared). */
async function runCommand(...args: string[]) {
  const command = await ace.create(PushRotateKeys, args)
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

/** Two households, three devices. */
async function devices() {
  const first = await createHousehold({ users: 2 })
  const second = await createHousehold()
  await subscribeDevice(first.owner, first.household)
  await subscribeDevice(first.member, first.household)
  await subscribeDevice(second.owner, second.household)
}

test.group('push:rotate-keys command', (group) => {
  group.each.setup(() => {
    ace.ui.switchMode('raw')
    return () => ace.ui.switchMode('normal')
  })

  test('test_rotating_needs_force_and_changes_nothing_without_it', async ({ assert, cleanup }) => {
    const keys = freshVapidKeys(cleanup)
    const before = await keys.details()
    await devices()

    const { command } = await runCommand()

    command.assertFailed()
    command.assertLogMatches(/deletes all 3 push subscriptions/)
    command.assertLogMatches(/--force/)
    assert.equal(await new AppSettings().get(VAPID_PUBLIC_KEY_SETTING), before!.publicKey)
    assert.lengthOf(await PushSubscription.all(), 3)
  })

  test('test_rotating_replaces_the_stored_pair_and_drops_every_subscription', async ({
    assert,
    cleanup,
  }) => {
    const keys = freshVapidKeys(cleanup)
    const before = await keys.details()
    await devices()

    const { command, lines } = await runCommand('--force')

    command.assertSucceeded()
    assert.lengthOf(await PushSubscription.all(), 0)
    const after = await keys.details()
    assert.notEqual(after!.publicKey, before!.publicKey, 'this process signs with the new pair')
    assert.equal(await new AppSettings().get(VAPID_PUBLIC_KEY_SETTING), after!.publicKey)
    // Another process (empty cache) reads the new pair back, and it signs.
    const otherProcess = new VapidKeys(
      { publicKey: null, privateKey: null, subject: SUBJECT },
      new AppSettings(),
      silentLogger
    )
    assert.deepEqual(await otherProcess.details(), after)
    const headers = webpush.getVapidHeaders(
      'https://push.example.test',
      after!.subject,
      after!.publicKey,
      after!.privateKey,
      'aes128gcm'
    )
    assert.include(headers.Authorization, `k=${after!.publicKey}`)
    assert.include(lines.join('\n'), '3 devices must subscribe again')
    assert.match(lines.join('\n'), /[Rr]eload/)
    const rows = await db.from('app_settings').select('key')
    assert.lengthOf(rows, 2, 'still one pair')
  })

  test('test_rotating_works_before_any_pair_was_generated', async ({ assert, cleanup }) => {
    const keys = freshVapidKeys(cleanup)

    const { command, lines } = await runCommand('--force')

    command.assertSucceeded()
    assert.isNotNull(await new AppSettings().get(VAPID_PUBLIC_KEY_SETTING))
    assert.isNotNull(await keys.details())
    assert.include(lines.join('\n'), '0 devices must subscribe again')
  })

  test('test_rotating_is_refused_while_the_environment_pins_the_pair', async ({
    assert,
    cleanup,
  }) => {
    const pair = webpush.generateVAPIDKeys()
    freshVapidKeys(cleanup, {
      publicKey: pair.publicKey,
      privateKey: new Secret(pair.privateKey),
    })
    await devices()

    const { command } = await runCommand('--force')

    command.assertFailed()
    command.assertLogMatches(/VAPID_PUBLIC_KEY/)
    assert.lengthOf(await PushSubscription.all(), 3)
    assert.isNull(await new AppSettings().get(VAPID_PUBLIC_KEY_SETTING))
  })
})
