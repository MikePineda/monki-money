import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import testUtils from '@adonisjs/core/services/test_utils'
import { LlmProviderError } from '#llm/errors'
import HttpExceptionHandler from '#exceptions/handler'
import { InsightsUnavailable } from '#exceptions/errors'

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

function pgForeignKeyViolation(statement: string) {
  return Object.assign(
    new Error(
      `${statement} - update or delete on table violates foreign key constraint "transactions_category_id_foreign"`
    ),
    { code: '23503', constraint: 'transactions_category_id_foreign' }
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

  test('test_unavailable_dependencies_keep_their_localized_message_in_production', async ({
    assert,
  }) => {
    const cases = [
      [new InsightsUnavailable(), 'E_INSIGHTS_UNAVAILABLE'],
      [new LlmProviderError('upstream 529: overloaded', 529), 'E_LLM_UNAVAILABLE'],
    ] as const

    for (const [error, code] of cases) {
      for (const debug of [true, false]) {
        const { status, body } = await render(error, { debug, locale: 'es' })

        assert.equal(status, 503)
        assert.deepEqual(body, {
          code,
          message: i18nManager.locale('es').t(`errors.${code}`),
        })
        assert.notInclude(body.message, 'upstream')
      }
    }
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

  test('test_foreign_key_race_on_delete_maps_to_in_use', async ({ assert }) => {
    const cases: Array<[string, string]> = [
      ['delete from "categories" where "id" = $1', 'E_CATEGORY_IN_USE'],
      ['delete from "accounts" where "id" = $1', 'E_ACCOUNT_IN_USE'],
      ['insert into "transactions" ("account_id") values ($1)', 'E_CONFLICT'],
    ]
    for (const [statement, code] of cases) {
      const { status, body } = await render(pgForeignKeyViolation(statement), { debug: false })

      assert.equal(status, 409, statement)
      assert.equal(body.code, code, statement)
      assert.notInclude(JSON.stringify(body), 'transactions_category_id_foreign')
    }
  })

  test('test_deadlock_or_serialization_failure_maps_to_409_retryable', async ({ assert }) => {
    for (const code of ['40P01', '40001']) {
      const error = Object.assign(new Error('deadlock detected on relation "import_rows"'), {
        code,
      })

      const { status, body } = await render(error, { debug: false })

      assert.equal(status, 409, code)
      assert.deepEqual(body, {
        message: 'This was being saved at the same time elsewhere. Try again',
        code: 'E_CONCURRENT_UPDATE',
      })
    }
  })
})
