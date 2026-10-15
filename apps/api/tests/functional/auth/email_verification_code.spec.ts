import User from '#models/user'
import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import mail from '@adonisjs/mail/services/main'
import type { ApiClient } from '@japa/api-client'
import { freezeClock } from '#tests/helpers/ledger'
import limiter from '@adonisjs/limiter/services/main'
import type VerifyEmailMail from '#mails/verify_email_mail'
import { UserFactory } from '#database/factories/user_factory'

/** Asks for a new verification mail and returns the 6-digit code it carries. */
async function requestCode(client: ApiClient, user: User): Promise<string> {
  const { mails } = mail.fake()
  try {
    const response = await client.post('/api/v1/auth/email/resend').actingAs(user)
    response.assertStatus(202)
    const sent = mails.sent() as VerifyEmailMail[]
    return sent[sent.length - 1].code
  } finally {
    mail.restore()
  }
}

/** Any 6-digit code other than `code`. */
function wrongCodeFor(code: string) {
  return code === '000000' ? '111111' : '000000'
}

function verifyCode(client: ApiClient, user: User, code: string) {
  return client.post('/api/v1/auth/email/verify-code').json({ code }).actingAs(user)
}

test.group('Auth / email verification by code', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_verification_mail_carries_link_and_six_digit_code', async ({ client, assert }) => {
    const { mails } = mail.fake()

    const response = await client
      .post('/api/v1/auth/signup')
      .json({
        fullName: 'Casey Example',
        email: 'casey@example.test',
        password: 'a-long-enough-password',
      })
      .withCsrfToken()

    response.assertStatus(201)
    const [sent] = mails.sent() as VerifyEmailMail[]
    mail.restore()
    assert.match(sent.code, /^\d{6}$/)
    await sent.build()
    const text = String(sent.message.toJSON().message.text)
    assert.include(text, sent.url)
    assert.include(text, sent.code)
    assert.include(text, '15 minutes')

    // Only a hash of the code is stored, bound to the user id.
    const user = await User.findByOrFail('email', 'casey@example.test')
    assert.equal(
      user.emailVerificationCodeHash,
      createHash('sha256').update(`${user.id}:${sent.code}`).digest('hex')
    )
    assert.equal(user.emailVerificationCodeAttempts, 0)
    const minutesLeft = user.emailVerificationCodeExpiresAt!.diffNow('minutes').minutes
    assert.closeTo(minutesLeft, 15, 1)
  })

  test('test_verification_mail_shows_the_code_in_the_user_locale', async ({ client, assert }) => {
    const user = await UserFactory.apply('unverified').apply('spanish').create()
    const { mails } = mail.fake()

    await client.post('/api/v1/auth/email/resend').actingAs(user)

    const [sent] = mails.sent() as VerifyEmailMail[]
    mail.restore()
    await sent.build()
    const text = String(sent.message.toJSON().message.text)
    assert.include(text, sent.code)
    assert.include(text, '15 minutos')
  })

  test('test_verify_code_marks_email_verified', async ({ client, assert }) => {
    const user = await UserFactory.apply('unverified').create()
    const code = await requestCode(client, user)

    const response = await verifyCode(client, user, code)

    response.assertStatus(200)
    response.assertBody({ data: { verified: true } })
    await user.refresh()
    assert.isNotNull(user.emailVerifiedAt)
    assert.isNull(user.emailVerificationCodeHash)
    assert.isNull(user.emailVerificationCodeExpiresAt)
    assert.equal(user.emailVerificationCodeAttempts, 0)
  })

  test('test_verify_code_rejects_wrong_code_and_locks_after_five_attempts', async ({
    client,
    assert,
  }) => {
    const user = await UserFactory.apply('unverified').create()
    const code = await requestCode(client, user)
    const wrong = wrongCodeFor(code)

    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await verifyCode(client, user, wrong)
      response.assertStatus(422)
      response.assertBodyContains({
        errors: [{ field: 'code', rule: 'verificationCode.invalid' }],
      })
    }
    // The fifth failure invalidates the code: the user must ask for a new one.
    const fifth = await verifyCode(client, user, wrong)
    fifth.assertStatus(422)
    fifth.assertBodyContains({ errors: [{ field: 'code', rule: 'verificationCode.locked' }] })
    await user.refresh()
    assert.isNull(user.emailVerificationCodeHash)
    assert.isNull(user.emailVerifiedAt)

    // Five failures per minute per IP + email also block the key...
    const throttled = await verifyCode(client, user, code)
    throttled.assertStatus(429)

    // ...and once the block is gone, even the right code stays locked.
    await limiter.clear()
    const locked = await verifyCode(client, user, code)
    locked.assertStatus(422)
    locked.assertBodyContains({ errors: [{ field: 'code', rule: 'verificationCode.locked' }] })

    const fresh = await requestCode(client, user)
    const unlocked = await verifyCode(client, user, fresh)
    unlocked.assertStatus(200)
  })

  test('test_verify_code_expires_after_fifteen_minutes', async ({ client, assert, cleanup }) => {
    cleanup(freezeClock('2026-10-15T10:00:00Z'))
    const user = await UserFactory.apply('unverified').create()
    const code = await requestCode(client, user)

    freezeClock('2026-10-15T10:15:01Z')
    const response = await verifyCode(client, user, code)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'code', rule: 'verificationCode.expired' }] })
    await user.refresh()
    assert.isNull(user.emailVerifiedAt)
    assert.equal(user.emailVerificationCodeAttempts, 0)
  })

  test('test_verify_code_still_works_just_before_fifteen_minutes', async ({ client, cleanup }) => {
    cleanup(freezeClock('2026-10-15T10:00:00Z'))
    const user = await UserFactory.apply('unverified').create()
    const code = await requestCode(client, user)

    freezeClock('2026-10-15T10:14:59Z')
    const response = await verifyCode(client, user, code)

    response.assertStatus(200)
  })

  test('test_resend_rotates_the_code', async ({ client, assert }) => {
    const user = await UserFactory.apply('unverified').create()
    const first = await requestCode(client, user)
    await verifyCode(client, user, wrongCodeFor(first))

    const second = await requestCode(client, user)

    await user.refresh()
    assert.equal(user.emailVerificationCodeAttempts, 0)
    // Two random codes collide one time in a million; only then is the old one still valid.
    if (first !== second) {
      const old = await verifyCode(client, user, first)
      old.assertStatus(422)
      old.assertBodyContains({ errors: [{ field: 'code', rule: 'verificationCode.invalid' }] })
    }
    const current = await verifyCode(client, user, second)
    current.assertStatus(200)
  })

  test('test_verify_code_is_idempotent_when_already_verified', async ({ client, assert }) => {
    const user = await UserFactory.create()
    const verifiedAt = user.emailVerifiedAt!.toISO()

    const first = await verifyCode(client, user, '123456')
    const second = await verifyCode(client, user, '654321')

    first.assertStatus(200)
    first.assertBody({ data: { verified: true } })
    second.assertStatus(200)
    await user.refresh()
    assert.equal(user.emailVerifiedAt!.toISO(), verifiedAt)
  })

  test('test_verify_code_validates_the_code_format', async ({ client }) => {
    const user = await UserFactory.apply('unverified').create()

    const response = await verifyCode(client, user, '12a45')

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'code' }] })
  })

  test('test_verify_code_requires_login', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/email/verify-code')
      .json({ code: '123456' })
      .withCsrfToken()

    response.assertStatus(401)
  })
})
