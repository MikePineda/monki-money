import { test } from '@japa/runner'
import User from '#models/user'
import limiter from '@adonisjs/limiter/services/main'
import { createHousehold } from '#tests/helpers/household'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'

test.group('Auth / login and sessions', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_login_sets_session_cookie_and_returns_user', async ({ client, assert }) => {
    const { owner, household } = await createHousehold()

    const response = await client
      .post('/api/v1/auth/login')
      .json({ email: owner.email.toUpperCase(), password: FACTORY_PASSWORD })
      .withCsrfToken()

    response.assertStatus(200)
    response.assertBodyContains({
      data: { user: { id: owner.id, email: owner.email }, household: { id: household.id } },
    })
    assert.exists(response.cookie('monkimoney_session'))
    response.assertSession('auth_web', owner.id)
    response.assertSession('sv', owner.sessionVersion)
    assert.notProperty(response.body().data.user, 'password')

    await owner.refresh()
    assert.isNotNull(owner.lastLoginAt)
  })

  test('test_login_with_a_wrong_password_is_rejected_without_revealing_the_email', async ({
    client,
  }) => {
    const user = await UserFactory.create()

    const wrongPassword = await client
      .post('/api/v1/auth/login')
      .json({ email: user.email, password: 'not-the-password' })
      .withCsrfToken()
    const unknownEmail = await client
      .post('/api/v1/auth/login')
      .json({ email: 'nobody@example.test', password: 'not-the-password' })
      .withCsrfToken()

    wrongPassword.assertStatus(400)
    unknownEmail.assertStatus(400)
    wrongPassword.assertBody(unknownEmail.body())
  })

  test('test_login_is_throttled_after_five_failures', async ({ client }) => {
    const user = await UserFactory.create()

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await client
        .post('/api/v1/auth/login')
        .json({ email: user.email, password: 'not-the-password' })
        .withCsrfToken()
      response.assertStatus(400)
    }

    // Even the right password is refused while the key is blocked.
    const blocked = await client
      .post('/api/v1/auth/login')
      .json({ email: user.email, password: FACTORY_PASSWORD })
      .withCsrfToken()
    blocked.assertStatus(429)
  })

  test('test_throttle_key_uses_cf_connecting_ip_not_x_forwarded_for', async ({ client }) => {
    const user = await UserFactory.create()
    const attempt = (cfIp: string, forwardedFor: string) =>
      client
        .post('/api/v1/auth/login')
        .header('cf-connecting-ip', cfIp)
        .header('x-forwarded-for', forwardedFor)
        .json({ email: user.email, password: 'not-the-password' })
        .withCsrfToken()

    // Rotating X-Forwarded-For does not escape the limit...
    for (let i = 1; i <= 5; i++) {
      const response = await attempt('203.0.113.10', `6.6.6.${i}`)
      response.assertStatus(400)
    }
    const blocked = await attempt('203.0.113.10', '6.6.6.99')
    blocked.assertStatus(429)

    // ...while another real client (CF-Connecting-IP) is not affected.
    const otherClient = await attempt('203.0.113.11', '6.6.6.1')
    otherClient.assertStatus(400)
  })

  test('test_successful_login_resets_the_failure_counter', async ({ client }) => {
    const user = await UserFactory.create()
    const fail = () =>
      client
        .post('/api/v1/auth/login')
        .json({ email: user.email, password: 'not-the-password' })
        .withCsrfToken()

    const failFourTimes = async () => {
      for (let i = 1; i <= 4; i++) {
        const response = await fail()
        response.assertStatus(400)
      }
    }

    await failFourTimes()
    const success = await client
      .post('/api/v1/auth/login')
      .json({ email: user.email, password: FACTORY_PASSWORD })
      .withCsrfToken()
    success.assertStatus(200)
    await failFourTimes()
  })

  test('test_csrf_token_is_required_on_post', async ({ client }) => {
    const user = await UserFactory.create()

    const response = await client
      .post('/api/v1/auth/login')
      .json({ email: user.email, password: FACTORY_PASSWORD })

    response.assertStatus(403)
  })

  test('test_me_requires_login_and_hands_out_the_xsrf_cookie', async ({ client, assert }) => {
    const response = await client.get('/api/v1/auth/me')

    response.assertStatus(401)
    assert.exists(response.cookie('XSRF-TOKEN'))
  })

  test('test_me_returns_user_household_membership_and_entitlements', async ({ client }) => {
    const { owner, household } = await createHousehold()

    const response = await client.get('/api/v1/auth/me').actingAs(owner)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        user: { id: owner.id, locale: 'en', theme: 'system' },
        household: { id: household.id, plan: 'free', settings: {} },
        membership: { role: 'owner' },
        entitlements: { maxAccounts: 6, maxMembers: 2 },
        flags: [],
      },
    })
  })

  test('test_authenticated_routes_are_throttled_per_user', async ({ client }) => {
    const user = await UserFactory.create()

    for (const request of [
      client.get('/api/v1/auth/me'),
      client.patch('/api/v1/me').json({ theme: 'dark' }),
    ]) {
      const response = await request.actingAs(user)
      response.assertStatus(200)
      response.assertHeader('x-ratelimit-limit', '300')
    }
  })

  test('test_logout_ends_the_session', async ({ client }) => {
    const user = await UserFactory.create()

    const logout = await client.post('/api/v1/auth/logout').actingAs(user)
    logout.assertStatus(204)

    const me = await client.get('/api/v1/auth/me').withSession(logout.session())
    me.assertStatus(401)
  })

  test('test_logout_all_invalidates_other_sessions', async ({ client, assert }) => {
    const user = await UserFactory.create()
    const versionBefore = user.sessionVersion

    const response = await client.post('/api/v1/auth/logout-all').actingAs(user)
    response.assertStatus(204)

    await user.refresh()
    assert.equal(user.sessionVersion, versionBefore + 1)

    // Another device still holding a session stamped with the old version.
    const otherDevice = await client
      .get('/api/v1/auth/me')
      .loginAs(user)
      .withSession({ sv: versionBefore })
    otherDevice.assertStatus(401)
  })

  test('test_session_without_a_version_stamp_is_rejected', async ({ client }) => {
    const user = await UserFactory.create()

    const response = await client.get('/api/v1/auth/me').loginAs(user)

    response.assertStatus(401)
  })

  test('test_unverified_user_cannot_access_resources', async ({ client }) => {
    const { owner } = await createHousehold()
    owner.emailVerifiedAt = null
    await owner.save()

    const me = await client.get('/api/v1/auth/me').actingAs(owner)
    me.assertStatus(200)

    for (const path of ['/api/v1/household', '/api/v1/accounts', '/api/v1/categories']) {
      const response = await client.get(path).actingAs(owner)
      response.assertStatus(403)
      response.assertBodyContains({ code: 'E_EMAIL_NOT_VERIFIED' })
    }
  })

  test('test_user_without_household_gets_403_on_household_routes', async ({ client }) => {
    const user = await UserFactory.create()

    const response = await client.get('/api/v1/accounts').actingAs(user)

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_NO_HOUSEHOLD' })
  })

  test('test_login_without_household_returns_null_household', async ({ client }) => {
    const user = await UserFactory.create()

    const response = await client
      .post('/api/v1/auth/login')
      .json({ email: user.email, password: FACTORY_PASSWORD })
      .withCsrfToken()

    response.assertStatus(200)
    response.assertBodyContains({ data: { household: null } })
    await User.findOrFail(user.id)
  })
})
