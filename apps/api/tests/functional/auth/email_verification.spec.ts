import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import limiter from '@adonisjs/limiter/services/main'
import VerifyEmailMail from '#mails/verify_email_mail'
import encryption from '@adonisjs/core/services/encryption'
import { UserFactory } from '#database/factories/user_factory'
import { issueEmailVerificationToken } from '#services/auth/auth_tokens'

test.group('Auth / email verification', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_verify_email_marks_the_user_verified', async ({ client, assert }) => {
    const user = await UserFactory.apply('unverified').create()
    const token = issueEmailVerificationToken(user)

    // Public on purpose: on iOS the link opens Safari, outside the PWA session.
    const response = await client.post('/api/v1/auth/email/verify').json({ token }).withCsrfToken()

    response.assertStatus(200)
    await user.refresh()
    assert.isNotNull(user.emailVerifiedAt)
    assert.isString(response.body().data.emailVerifiedAt)
  })

  test('test_verify_email_rejects_tampered_token', async ({ client, assert }) => {
    const user = await UserFactory.apply('unverified').create()
    const token = issueEmailVerificationToken(user)
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA')

    const response = await client
      .post('/api/v1/auth/email/verify')
      .json({ token: tampered })
      .withCsrfToken()

    response.assertStatus(400)
    response.assertBodyContains({ code: 'E_INVALID_TOKEN' })
    await user.refresh()
    assert.isNull(user.emailVerifiedAt)
  })

  test('test_verify_email_rejects_a_token_for_another_purpose', async ({ client }) => {
    const user = await UserFactory.apply('unverified').create()
    const token = encryption.encrypt(
      { userId: user.id, email: user.email },
      { expiresIn: '1 hour', purpose: 'password-reset' }
    )

    const response = await client.post('/api/v1/auth/email/verify').json({ token }).withCsrfToken()

    response.assertStatus(400)
  })

  test('test_verify_email_rejects_a_token_issued_for_a_previous_email', async ({ client }) => {
    const user = await UserFactory.apply('unverified').create()
    const token = issueEmailVerificationToken(user)
    user.email = 'changed@example.test'
    await user.save()

    const response = await client.post('/api/v1/auth/email/verify').json({ token }).withCsrfToken()

    response.assertStatus(400)
  })

  test('test_resend_sends_a_new_verification_mail', async ({ client }) => {
    const { mails } = mail.fake()
    const user = await UserFactory.apply('unverified').create()

    const response = await client.post('/api/v1/auth/email/resend').actingAs(user)

    response.assertStatus(202)
    mails.assertSent(VerifyEmailMail, (sent) => {
      return sent.user.id === user.id && sent.url.includes('/verify-email?token=')
    })
    mail.restore()
  })

  test('test_resend_is_limited_to_three_per_fifteen_minutes', async ({ client }) => {
    mail.fake()
    const user = await UserFactory.apply('unverified').create()

    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await client.post('/api/v1/auth/email/resend').actingAs(user)
      response.assertStatus(202)
    }
    const blocked = await client.post('/api/v1/auth/email/resend').actingAs(user)
    blocked.assertStatus(429)
    mail.restore()
  })

  test('test_resend_is_a_no_op_for_verified_users', async ({ client }) => {
    const { mails } = mail.fake()
    const user = await UserFactory.create()

    const response = await client.post('/api/v1/auth/email/resend').actingAs(user)

    response.assertStatus(202)
    mails.assertNoneSent()
    mail.restore()
  })

  test('test_verification_mail_is_in_the_user_locale_and_links_to_app_url', async ({
    client,
    assert,
  }) => {
    const { mails } = mail.fake()
    const user = await UserFactory.apply('unverified').apply('spanish').create()

    await client.post('/api/v1/auth/email/resend').actingAs(user)

    const [sent] = mails.sent() as VerifyEmailMail[]
    await sent.build()
    assert.equal(sent.message.toJSON().message.subject, 'Confirma tu correo')
    assert.isTrue(sent.url.startsWith('http://127.0.0.1:3333/verify-email?token='))
    mail.restore()
  })
})
