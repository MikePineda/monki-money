import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import mail from '@adonisjs/mail/services/main'
import limiter from '@adonisjs/limiter/services/main'
import PasswordResetMail from '#mails/password_reset_mail'
import Outbox from '#services/mail/outbox'
import app from '@adonisjs/core/services/app'
import { InvalidToken } from '#exceptions/errors'
import { UserFactory } from '#database/factories/user_factory'
import { issuePasswordResetToken } from '#services/auth/auth_tokens'
import PasswordResetService from '#services/auth/password_reset_service'

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
    await Outbox.settled()
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
    await Outbox.settled()
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
    await Outbox.settled()
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

  test('test_reset_is_atomic_when_the_same_token_is_used_twice_at_once', async ({ assert }) => {
    const user = await UserFactory.create()
    const token = issuePasswordResetToken(user)
    const passwords = await app.container.make(PasswordResetService)

    const results = await Promise.allSettled([
      passwords.reset(token, 'first-new-password'),
      passwords.reset(token, 'second-new-password'),
    ])

    assert.lengthOf(
      results.filter((result) => result.status === 'fulfilled'),
      1
    )
    const rejected = results.find((result) => result.status === 'rejected')
    assert.instanceOf((rejected as PromiseRejectedResult).reason, InvalidToken)
    await user.refresh()
    assert.equal(user.sessionVersion, 2)
  })

  test('test_forgot_password_does_not_wait_for_the_mail_delivery', async ({
    client,
    assert,
    cleanup,
  }) => {
    // A provider that never answers: the request must still return at once,
    // so response time does not reveal which emails exist.
    let attempted = 0
    class HangingOutbox extends Outbox {
      override async send() {
        attempted++
        await new Promise(() => {})
      }

      override dispatch() {
        attempted++
        return new Promise<void>(() => {})
      }
    }
    app.container.swap(Outbox, () => new HangingOutbox())
    cleanup(() => app.container.restore(Outbox))
    const user = await UserFactory.create()

    const response = await client
      .post('/api/v1/auth/password/forgot')
      .json({ email: user.email })
      .withCsrfToken()

    response.assertStatus(200)
    assert.equal(attempted, 1)
  }).timeout(5000)
})
