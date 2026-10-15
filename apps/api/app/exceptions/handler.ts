import app from '@adonisjs/core/services/app'
import { FieldError } from '#exceptions/field_error'
import type { I18n } from '@adonisjs/i18n'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'

/** Self-rendering framework errors whose own rendering does not fit a JSON API. */
const JSON_RENDERED_CODES = new Set(['E_BAD_CSRF_TOKEN'])

/** Postgres unique_violation: a race lost against a concurrent insert. */
const PG_UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): error is Error & { status?: number; code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  )
}

/**
 * JSON-only API error rendering:
 *
 * - Exceptions that render themselves (validation, auth, CSRF, throttle,
 *   authorization) keep their shape: 422 `{ errors: [{ field, rule, message }] }`,
 *   401/400/403/429 `{ errors: [{ message }] }`. Exception: CSRF (see
 *   JSON_RENDERED_CODES) answers 403 `{ message, code }`.
 * - `FieldError` (service-level validation) renders like a VineJS error.
 * - Any other 4xx answers `{ message, code }` with the message translated
 *   from `errors.<code>` (E_ROW_NOT_FOUND -> 404 "Not found", domain errors).
 *   Never the debug page: 4xx bodies are part of the contract.
 * - Postgres unique violations (a lost race the services could not
 *   pre-check) answer 409 `E_CONFLICT`, never the constraint name.
 * - 5xx: debug page in development; in production a generic translated
 *   `{ message, code: 'E_INTERNAL_SERVER_ERROR' }` (driver messages, table
 *   and constraint names never leave the server, they go to the logs).
 */
export default class HttpExceptionHandler extends ExceptionHandler {
  protected override debug = !app.inProduction

  override async handle(error: unknown, ctx: HttpContext) {
    const i18n = 'i18n' in ctx ? (ctx.i18n as I18n | undefined) : undefined
    const translate = (code: string, fallback: string) =>
      i18n ? i18n.t(`errors.${code}`, {}, fallback) : fallback

    if (isUniqueViolation(error)) {
      error.status = 409
      return ctx.response
        .status(409)
        .send({ message: translate('E_CONFLICT', 'Conflict'), code: 'E_CONFLICT' })
    }

    if (error instanceof FieldError) {
      const messageKey = i18n?.resolveIdentifier(
        `validator.shared.messages.${error.field}.${error.rule}`
      )
        ? `validator.shared.messages.${error.field}.${error.rule}`
        : `validator.shared.messages.${error.rule}`
      const field = i18n?.resolveIdentifier(`validator.shared.fields.${error.field}`)
        ? i18n.t(`validator.shared.fields.${error.field}`)
        : error.field
      const message = i18n
        ? i18n.t(messageKey, { field, ...error.meta }, error.message)
        : error.message
      return ctx.response
        .status(422)
        .send({ errors: [{ field: error.field, rule: error.rule, message }] })
    }

    const httpError = this.toHttpError(error) as {
      status: number
      code?: string
      message: string
      handle?: unknown
    }
    // Shield renders CSRF failures as an HTML redirect-back; an API answers 403.
    const selfRendered =
      typeof httpError.handle === 'function' && !JSON_RENDERED_CODES.has(httpError.code ?? '')
    const isValidation = httpError.code === 'E_VALIDATION_ERROR'

    if (!selfRendered && !isValidation && httpError.status >= 400 && httpError.status < 500) {
      const message = httpError.code
        ? translate(httpError.code, httpError.message)
        : httpError.message
      return ctx.response.status(httpError.status).send({ message, code: httpError.code })
    }

    if (httpError.status >= 500 && !this.debug) {
      return ctx.response.status(httpError.status).send({
        message: translate('E_INTERNAL_SERVER_ERROR', 'Internal server error'),
        code: 'E_INTERNAL_SERVER_ERROR',
      })
    }

    return super.handle(error, ctx)
  }

  override async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
