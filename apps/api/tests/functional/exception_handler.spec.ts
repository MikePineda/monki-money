import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import testUtils from '@adonisjs/core/services/test_utils'
import HttpExceptionHandler from '#exceptions/handler'

async function render(error: unknown, options: { debug: boolean; locale?: string }) {
  const ctx = await testUtils.createHttpContext()
  ctx.i18n = i18nManager.locale(options.locale ?? 'en')
  ctx.request.request.headers.accept = 'application/json'

  const handler = new HttpExceptionHandler()
  ;(handler as unknown as { debug: boolean }).debug = options.debug
  await handler.handle(error, ctx)

  return { status: ctx.response.getStatus(), body: ctx.response.getBody() }
}

function pgUniqueViolation() {
  return Object.assign(
    new Error(
      'insert into "account_cards" - duplicate key value violates unique constraint "account_cards_account_id_card_suffix_unique"'
    ),
    { code: '23505', constraint: 'account_cards_account_id_card_suffix_unique' }
  )
}

test.group('Exception handler', () => {
  test('test_server_errors_never_leak_driver_messages_in_production', async ({ assert }) => {
    const { status, body } = await render(new Error('relation "secret_table" does not exist'), {
      debug: false,
    })

    assert.equal(status, 500)
    assert.deepEqual(body, {
      message: 'Something went wrong on our side. Try again in a moment',
      code: 'E_INTERNAL_SERVER_ERROR',
    })
  })

  test('test_server_error_message_is_localized', async ({ assert }) => {
    const { body } = await render(new Error('boom'), { debug: false, locale: 'es' })

    assert.equal(body.message, 'Algo falló de nuestro lado. Inténtalo de nuevo en un momento')
  })

  test('test_unique_violation_maps_to_409_without_the_constraint_name', async ({ assert }) => {
    for (const debug of [true, false]) {
      const { status, body } = await render(pgUniqueViolation(), { debug })

      assert.equal(status, 409)
      assert.deepEqual(body, {
        message: 'This already exists. Reload and try again',
        code: 'E_CONFLICT',
      })
    }
  })
})
