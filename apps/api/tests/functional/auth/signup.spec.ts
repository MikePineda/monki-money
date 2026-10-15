import User from '#models/user'
import { test } from '@japa/runner'
import env from '#start/env'
import Category from '#models/category'
import mail from '@adonisjs/mail/services/main'
import VerifyEmailMail from '#mails/verify_email_mail'
import CategoryGroup from '#models/category_group'
import { UserFactory } from '#database/factories/user_factory'

const signup = {
  fullName: 'Alex Example',
  email: 'Alex@Example.test',
  password: 'a-long-enough-password',
}

test.group('Auth / sign-up', (group) => {
  group.each.setup(() => {
    const original = env.get('REGISTRATION_OPEN')
    return () => env.set('REGISTRATION_OPEN', original)
  })

  test('test_signup_is_forbidden_when_registration_closed', async ({ client, assert }) => {
    env.set('REGISTRATION_OPEN', false)

    const response = await client.post('/api/v1/auth/signup').json(signup).withCsrfToken()

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_REGISTRATION_CLOSED' })
    assert.isNull(await User.findBy('email', 'alex@example.test'))
  })

  test('test_signup_creates_user_household_owner_and_logs_in', async ({ client, assert }) => {
    const { mails } = mail.fake()

    const response = await client.post('/api/v1/auth/signup').json(signup).withCsrfToken()

    response.assertStatus(201)
    response.assertBodyContains({
      data: {
        user: { email: 'alex@example.test', fullName: 'Alex Example', emailVerifiedAt: null },
        household: { name: 'Alex’s home', plan: 'free', status: 'active', currencyCode: 'AUD' },
      },
    })
    const user = await User.findByOrFail('email', 'alex@example.test')
    assert.equal(user.currentHouseholdId, response.body().data.household.id)
    response.assertSession('sv', user.sessionVersion)

    const me = await client.get('/api/v1/auth/me').withSession(response.session())
    me.assertStatus(200)

    mails.assertSent(VerifyEmailMail, (sent) => sent.user.id === user.id)
    mail.restore()
  })

  test('test_signup_creates_household_with_localized_taxonomy', async ({ client, assert }) => {
    mail.fake()

    const response = await client
      .post('/api/v1/auth/signup')
      .json({ ...signup, locale: 'es', householdName: 'Casa Prueba' })
      .withCsrfToken()

    response.assertStatus(201)
    const householdId = response.body().data.household.id
    assert.equal(response.body().data.household.name, 'Casa Prueba')
    assert.equal(response.body().data.user.locale, 'es')

    const groceries = await Category.query()
      .where('household_id', householdId)
      .where('slug', 'groceries')
      .firstOrFail()
    assert.equal(groceries.name, 'Supermercado')
    assert.isTrue(groceries.isSystem)

    const groups = await CategoryGroup.query().where('household_id', householdId)
    assert.includeMembers(
      groups.map((g) => g.slug),
      ['housing', 'food', 'finance-other', 'income']
    )
    mail.restore()
  })

  test('test_signup_rejects_an_email_already_registered', async ({ client }) => {
    await UserFactory.merge({ email: 'alex@example.test' }).create()

    const response = await client.post('/api/v1/auth/signup').json(signup).withCsrfToken()

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'email', rule: 'database.unique' }] })
  })

  test('test_signup_validates_the_password_length', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/signup')
      .json({ ...signup, password: 'short' })
      .withCsrfToken()

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'password', rule: 'minLength' }] })
  })
})
