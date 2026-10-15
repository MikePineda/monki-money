import { test } from '@japa/runner'
import { createHousehold } from '#tests/helpers/household'
import { UserFactory } from '#database/factories/user_factory'

test.group('Localization', () => {
  test('test_validation_errors_are_in_user_locale', async ({ client, assert }) => {
    const { owner } = await createHousehold({ locale: 'es' })

    const response = await client
      .post('/api/v1/accounts')
      .json({ kind: 'transaction' })
      .actingAs(owner)

    response.assertStatus(422)
    const [error] = response.body().errors
    assert.equal(error.field, 'name')
    assert.equal(error.rule, 'required')
    assert.equal(error.message, 'Escribe el campo nombre')
  })

  test('test_user_locale_wins_over_accept_language', async ({ client }) => {
    const { owner } = await createHousehold({ locale: 'en' })

    const response = await client
      .post('/api/v1/accounts')
      .header('accept-language', 'es-MX,es;q=0.9')
      .json({ kind: 'transaction' })
      .actingAs(owner)

    response.assertBodyContains({ errors: [{ field: 'name', message: 'Enter the name' }] })
  })

  test('test_accept_language_is_used_for_guests', async ({ client }) => {
    const spanish = await client
      .post('/api/v1/auth/login')
      .header('accept-language', 'es-MX,es;q=0.9,en;q=0.8')
      .json({ email: 'not-an-email', password: 'x' })
      .withCsrfToken()
    spanish.assertStatus(422)
    spanish.assertBodyContains({
      errors: [{ field: 'email', message: 'Escribe un correo válido' }],
    })
    spanish.assertHeader('content-language', 'es')

    const unsupported = await client
      .post('/api/v1/auth/login')
      .header('accept-language', 'fr-FR')
      .json({ email: 'not-an-email', password: 'x' })
      .withCsrfToken()
    unsupported.assertBodyContains({
      errors: [{ field: 'email', message: 'Enter a valid email address' }],
    })
  })

  test('test_domain_errors_are_translated_too', async ({ client }) => {
    const user = await UserFactory.apply('spanish').create()

    const response = await client.get('/api/v1/accounts').actingAs(user)

    response.assertStatus(403)
    response.assertBody({ message: 'Todavía no perteneces a un hogar', code: 'E_NO_HOUSEHOLD' })
  })

  test('test_not_found_is_translated_for_the_reader', async ({ client }) => {
    const { owner } = await createHousehold({ locale: 'es' })

    const response = await client.get('/api/v1/accounts/999999').actingAs(owner)

    response.assertStatus(404)
    response.assertBody({ message: 'No encontrado', code: 'E_ROW_NOT_FOUND' })
  })
})
