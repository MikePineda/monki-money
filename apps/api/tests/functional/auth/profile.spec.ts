import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'

test.group('Profile (PATCH /me)', () => {
  test('test_profile_updates_name_locale_and_theme', async ({ client, assert }) => {
    const user = await UserFactory.create()

    const response = await client
      .patch('/api/v1/me')
      .json({ fullName: 'Sam Example', locale: 'es', theme: 'dark' })
      .actingAs(user)

    response.assertStatus(200)
    response.assertBodyContains({
      data: { fullName: 'Sam Example', locale: 'es', theme: 'dark' },
    })
    await user.refresh()
    assert.equal(user.locale, 'es')
    assert.equal(user.theme, 'dark')
  })

  test('test_profile_rejects_an_unsupported_locale_or_theme', async ({ client }) => {
    const user = await UserFactory.create()

    const response = await client
      .patch('/api/v1/me')
      .json({ locale: 'fr', theme: 'neon' })
      .actingAs(user)

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [
        { field: 'locale', rule: 'enum' },
        { field: 'theme', rule: 'enum' },
      ],
    })
  })

  test('test_password_change_requires_the_current_password', async ({ client, assert }) => {
    const user = await UserFactory.create()

    const missing = await client
      .patch('/api/v1/me')
      .json({ password: 'brand-new-password' })
      .actingAs(user)
    missing.assertStatus(422)
    missing.assertBodyContains({ errors: [{ field: 'currentPassword', rule: 'required' }] })

    const wrong = await client
      .patch('/api/v1/me')
      .json({ password: 'brand-new-password', currentPassword: 'not-it-at-all' })
      .actingAs(user)
    wrong.assertStatus(422)
    wrong.assertBodyContains({ errors: [{ field: 'currentPassword', rule: 'matches' }] })

    await user.refresh()
    assert.isTrue(await hash.verify(user.password, FACTORY_PASSWORD))
  })

  test('test_password_change_revokes_other_sessions_but_keeps_this_one', async ({
    client,
    assert,
  }) => {
    const user = await UserFactory.create()
    const versionBefore = user.sessionVersion

    const response = await client
      .patch('/api/v1/me')
      .json({ password: 'brand-new-password', currentPassword: FACTORY_PASSWORD })
      .actingAs(user)
    response.assertStatus(200)

    await user.refresh()
    assert.equal(user.sessionVersion, versionBefore + 1)
    assert.isTrue(await hash.verify(user.password, 'brand-new-password'))

    const thisSession = await client.get('/api/v1/auth/me').withSession(response.session())
    thisSession.assertStatus(200)

    const otherSession = await client
      .get('/api/v1/auth/me')
      .loginAs(user)
      .withSession({ sv: versionBefore })
    otherSession.assertStatus(401)
  })
})
