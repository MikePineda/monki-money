import User from '#models/user'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import Outbox from '#services/mail/outbox'
import mail from '@adonisjs/mail/services/main'
import limiter from '@adonisjs/limiter/services/main'
import { fakeTurnstile, PASSING_TURNSTILE_TOKEN } from '#tests/helpers/turnstile'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { NoopTurnstileVerifier, TurnstileVerifier } from '#services/auth/turnstile_verifier'

const signup = {
  fullName: 'Robin Example',
  email: 'robin@example.test',
  password: 'a-long-enough-password',
}

test.group('Auth / Turnstile bot check', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_turnstile_is_ignored_when_secret_is_empty', async ({ client, assert }) => {
    // .env.test leaves TURNSTILE_SECRET empty: the container hands out the no-op verifier.
    assert.instanceOf(await app.container.make(TurnstileVerifier), NoopTurnstileVerifier)
    const user = await UserFactory.create()

    const withoutToken = await client
      .post('/api/v1/auth/login')
      .json({ email: user.email, password: FACTORY_PASSWORD })
      .withCsrfToken()
    const withAnyToken = await client
      .post('/api/v1/auth/signup')
      .json({ ...signup, turnstileToken: 'whatever-the-widget-sent' })
      .withCsrfToken()

    withoutToken.assertStatus(200)
    withAnyToken.assertStatus(201)
  })

  test('test_login_requires_turnstile_token_when_secret_is_set', async ({
    client,
    assert,
    cleanup,
  }) => {
    const { restore } = fakeTurnstile()
    cleanup(restore)
    const user = await UserFactory.create()

    // A missing token fails before the credential check and never counts
    // toward the login throttle (6 rejections, then the login still works).
    for (let attempt = 1; attempt <= 6; attempt++) {
      const missing = await client
        .post('/api/v1/auth/login')
        .json({ email: user.email, password: FACTORY_PASSWORD })
        .withCsrfToken()
      missing.assertStatus(422)
      missing.assertBodyContains({ errors: [{ field: 'turnstileToken', rule: 'turnstile' }] })
    }
    await user.refresh()
    assert.isNull(user.lastLoginAt)

    const passed = await client
      .post('/api/v1/auth/login')
      .json({
        email: user.email,
        password: FACTORY_PASSWORD,
        turnstileToken: PASSING_TURNSTILE_TOKEN,
      })
      .withCsrfToken()
    passed.assertStatus(200)
  })

  test('test_signup_rejects_failed_turnstile_verification_with_422', async ({
    client,
    assert,
    cleanup,
  }) => {
    const { restore } = fakeTurnstile()
    cleanup(restore)

    const english = await client
      .post('/api/v1/auth/signup')
      .json({ ...signup, turnstileToken: 'forged-token' })
      .withCsrfToken()
    const spanish = await client
      .post('/api/v1/auth/signup')
      .header('accept-language', 'es')
      .json({ ...signup, turnstileToken: 'forged-token' })
      .withCsrfToken()

    english.assertStatus(422)
    english.assertBody({
      errors: [
        {
          field: 'turnstileToken',
          rule: 'turnstile',
          message: 'Complete the security check and try again',
        },
      ],
    })
    spanish.assertStatus(422)
    assert.equal(
      spanish.body().errors[0].message,
      'Completa la verificación de seguridad e inténtalo de nuevo'
    )
    assert.isNull(await User.findBy('email', signup.email))

    const passed = await client
      .post('/api/v1/auth/signup')
      .json({ ...signup, turnstileToken: PASSING_TURNSTILE_TOKEN })
      .withCsrfToken()
    passed.assertStatus(201)
  })

  test('test_forgot_password_rejects_failed_turnstile_verification_with_422', async ({
    client,
    cleanup,
  }) => {
    const { mails } = mail.fake()
    cleanup(() => mail.restore())
    const { restore } = fakeTurnstile()
    cleanup(restore)
    const user = await UserFactory.create()

    const response = await client
      .post('/api/v1/auth/password/forgot')
      .json({ email: user.email, turnstileToken: 'forged-token' })
      .withCsrfToken()

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'turnstileToken', rule: 'turnstile' }] })
    await Outbox.settled()
    mails.assertNoneSent()
  })

  test('test_turnstile_passes_client_ip_from_cf_connecting_ip', async ({
    client,
    assert,
    cleanup,
  }) => {
    const { fake, restore } = fakeTurnstile()
    cleanup(restore)
    const user = await UserFactory.create()

    const response = await client
      .post('/api/v1/auth/login')
      .header('cf-connecting-ip', '203.0.113.7')
      .header('x-forwarded-for', '198.51.100.66')
      .json({
        email: user.email,
        password: FACTORY_PASSWORD,
        turnstileToken: PASSING_TURNSTILE_TOKEN,
      })
      .withCsrfToken()

    response.assertStatus(200)
    assert.deepEqual(fake.calls, [{ token: PASSING_TURNSTILE_TOKEN, remoteIp: '203.0.113.7' }])
  })
})
