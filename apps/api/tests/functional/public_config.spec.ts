import { test } from '@japa/runner'
import webpush from 'web-push'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { Secret } from '@adonisjs/core/helpers'
import AppSettings from '#services/settings/app_settings'
import VapidKeys, {
  VAPID_PRIVATE_KEY_SETTING,
  VAPID_PUBLIC_KEY_SETTING,
  type VapidSettings,
} from '#services/push/vapid_keys'

type Cleanup = (callback: () => void) => void

const SUBJECT = 'https://app.example.test'

function silentLogger() {
  const errors: string[] = []
  return {
    errors,
    info: () => undefined,
    error: (_context: Record<string, unknown>, message: string) => errors.push(message),
  }
}

/** A VapidKeys with nothing cached yet, bound for this test (the app keeps one per process). */
function freshVapidKeys(cleanup: Cleanup, settings: Partial<VapidSettings> = {}) {
  const keys = new VapidKeys(
    { publicKey: null, privateKey: null, subject: SUBJECT, ...settings },
    new AppSettings(),
    silentLogger()
  )
  app.container.swap(VapidKeys, () => keys)
  cleanup(() => app.container.restore(VapidKeys))
  return keys
}

function storedSettings() {
  return db.from('app_settings').orderBy('key').select('key', 'value')
}

test.group('Public config', () => {
  test('exposes only the public runtime flags the SPA needs, wrapped in data', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/v1/config')

    response.assertStatus(200)
    assert.sameMembers(Object.keys(response.body().data), [
      'registrationOpen',
      'version',
      'turnstileSiteKey',
      'sentryDsnWeb',
      'defaultLocale',
      'vapidPublicKey',
    ])
  })

  test('test_default_locale_is_english_unless_configured', async ({ client }) => {
    const response = await client.get('/api/v1/config')

    response.assertBodyContains({ data: { defaultLocale: 'en' } })
  })

  test('reflects REGISTRATION_OPEN from the environment', async ({ client }) => {
    // .env.test sets REGISTRATION_OPEN=true
    const response = await client.get('/api/v1/config')

    response.assertBodyContains({ data: { registrationOpen: true } })
  })

  test('returns null instead of empty strings for unset keys', async ({ client }) => {
    const response = await client.get('/api/v1/config')

    response.assertBodyContains({ data: { turnstileSiteKey: null, sentryDsnWeb: null } })
  })
})

test.group('Public config: VAPID public key', () => {
  test('test_without_env_keys_a_pair_is_generated_once_and_kept_in_app_settings', async ({
    client,
    assert,
    cleanup,
  }) => {
    freshVapidKeys(cleanup)

    const first = await client.get('/api/v1/config')
    const second = await client.get('/api/v1/config')

    const publicKey = first.body().data.vapidPublicKey
    assert.match(publicKey, /^[\w-]{87}$/)
    assert.lengthOf(Buffer.from(publicKey, 'base64url'), 65)
    assert.equal(second.body().data.vapidPublicKey, publicKey)
    const rows = await storedSettings()
    assert.deepEqual(
      rows.map((row) => row.key),
      [VAPID_PRIVATE_KEY_SETTING, VAPID_PUBLIC_KEY_SETTING]
    )
    assert.equal(rows[1].value, publicKey)
    assert.notInclude(JSON.stringify(first.body()), rows[0].value)
  })

  test('test_the_stored_private_key_is_encrypted_and_signs_for_the_public_one', async ({
    assert,
    cleanup,
  }) => {
    const keys = freshVapidKeys(cleanup)
    const details = await keys.details()

    const [privateRow] = await storedSettings()
    assert.notEqual(privateRow.value, details!.privateKey, 'never stored in clear')
    assert.notInclude(privateRow.value, details!.privateKey)
    // A second process (empty cache) reads the same pair back.
    const otherProcess = new VapidKeys(
      { publicKey: null, privateKey: null, subject: SUBJECT },
      new AppSettings(),
      silentLogger()
    )
    assert.deepEqual(await otherProcess.details(), details)
    // The pair is a real one: web-push accepts it for signing.
    const headers = webpush.getVapidHeaders(
      'https://push.example.test',
      details!.subject,
      details!.publicKey,
      details!.privateKey,
      'aes128gcm'
    )
    assert.include(headers.Authorization, `k=${details!.publicKey}`)
  })

  test('test_two_processes_generating_at_once_end_up_with_one_pair', async ({ assert }) => {
    /** Found nothing stored (the first process had not committed yet), then stores second. */
    class LateStore extends AppSettings {
      #reads = 0
      override async get(key: string) {
        this.#reads += 1
        return this.#reads <= 2 ? null : super.get(key)
      }
    }
    const settings = { publicKey: null, privateKey: null, subject: SUBJECT }
    const first = new VapidKeys(settings, new AppSettings(), silentLogger())
    const late = new LateStore()
    let generated = 0
    const second = new VapidKeys(settings, late, silentLogger(), () => {
      generated += 1
      return webpush.generateVAPIDKeys()
    })

    const winner = await first.publicKey()
    const loser = await second.publicKey()

    assert.equal(generated, 1, 'the second process did generate its own pair')
    assert.equal(loser, winner, 'but signs with the stored one')
    assert.lengthOf(await storedSettings(), 2)
  })

  test('test_env_keys_win_and_nothing_is_stored', async ({ client, assert, cleanup }) => {
    const pair = webpush.generateVAPIDKeys()
    freshVapidKeys(cleanup, {
      publicKey: pair.publicKey,
      privateKey: new Secret(pair.privateKey),
    })

    const response = await client.get('/api/v1/config')

    response.assertBodyContains({ data: { vapidPublicKey: pair.publicKey } })
    assert.lengthOf(await storedSettings(), 0)
  })

  test('test_a_private_key_that_no_longer_decrypts_makes_push_unavailable', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logger = silentLogger()
    const keys = new VapidKeys(
      { publicKey: null, privateKey: null, subject: SUBJECT },
      new AppSettings(),
      logger
    )
    app.container.swap(VapidKeys, () => keys)
    cleanup(() => app.container.restore(VapidKeys))
    // Written with another APP_KEY.
    const now = new Date()
    await db.table('app_settings').multiInsert([
      { key: VAPID_PUBLIC_KEY_SETTING, value: 'BPublic', created_at: now, updated_at: now },
      { key: VAPID_PRIVATE_KEY_SETTING, value: 'garbage.cipher', created_at: now, updated_at: now },
    ])

    const response = await client.get('/api/v1/config')

    response.assertStatus(200)
    response.assertBodyContains({ data: { vapidPublicKey: null } })
    assert.deepEqual(logger.errors, ['push: no VAPID key pair, push is unavailable'])
  })
})
