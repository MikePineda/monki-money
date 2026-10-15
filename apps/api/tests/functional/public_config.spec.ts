import { test } from '@japa/runner'

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
