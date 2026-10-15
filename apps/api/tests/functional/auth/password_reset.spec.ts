import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import mail from '@adonisjs/mail/services/main'
import limiter from '@adonisjs/limiter/services/main'
import PasswordResetMail from '#mails/password_reset_mail'
import { UserFactory } from '#database/factories/user_factory'

function tokenFrom(sent: PasswordResetMail) {
  return decodeURIComponent(sent.url.split('/reset-password/')[1])
}

test.group('Auth / password reset', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_forgot_password_always_answers_200', async ({ client }) => {
    const { mails } = mail.fake()

    const response = await client
      .post('/api/v1/auth/password/forgot')
      .json({ email: 'nobody@example.test' })
      .withCsrfToken()

    response.assertStatus(200)
    mails.assertNoneSent()
    mail.restore()
  })

  test('test_forgot_password_mails_a_reset_link_to_known_users', async ({ client }) => {
    const { mails } = mail.fake()
    const user = await UserFactory.create()

    const response = await client
      .post('/api/v1/auth/password/forgot')
      .json({ email: user.email.toUpperCase() })
      .withCsrfToken()

    response.assertStatus(200)
    mails.assertSent(PasswordResetMail, (sent) => sent.user.id === user.id)
    mail.restore()
  })

  test('test_reset_password_token_is_single_use_and_bumps_session_version', async ({
    client,
    assert,
  }) => {
    const { mails } = mail.fake()
    const user = await UserFactory.create()
    const versionBefore = user.sessionVersion

    await client.post('/api/v1/auth/password/forgot').json({ email: user.email }).withCsrfToken()
    const token = tokenFrom(mails.sent()[0] as PasswordResetMail)

    const reset = await client
      .post('/api/v1/auth/password/reset')
      .json({ token, password: 'brand-new-password' })
      .withCsrfToken()
    reset.assertStatus(200)

    await user.refresh()
    assert.equal(user.sessionVersion, versionBefore + 1)
    assert.isTrue(await hash.verify(user.password, 'brand-new-password'))

    const reuse = await client
      .post('/api/v1/auth/password/reset')
      .json({ token, password: 'another-new-password' })
      .withCsrfToken()
    reuse.assertStatus(400)
    reuse.assertBodyContains({ code: 'E_INVALID_TOKEN' })

    // Sessions opened before the reset are revoked.
    const oldSession = await client
      .get('/api/v1/auth/me')
      .loginAs(user)
      .withSession({ sv: versionBefore })
    oldSession.assertStatus(401)
    mail.restore()
  })

  test('test_reset_password_rejects_garbage_tokens', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/password/reset')
      .json({ token: 'not-a-token', password: 'brand-new-password' })
      .withCsrfToken()

    response.assertStatus(400)
  })

  test('test_forgot_password_is_rate_limited', async ({ client }) => {
    mail.fake()
    const user = await UserFactory.create()
    const forgot = () =>
      client.post('/api/v1/auth/password/forgot').json({ email: user.email }).withCsrfToken()

    for (let i = 1; i <= 5; i++) {
      const response = await forgot()
      response.assertStatus(200)
    }
    const blocked = await forgot()
    blocked.assertStatus(429)
    mail.restore()
  })
})
