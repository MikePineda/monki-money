import app from '@adonisjs/core/services/app'
import { FieldError } from '#exceptions/field_error'
import type { I18n } from '@adonisjs/i18n'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'

/** Self-rendering framework errors whose own rendering does not fit a JSON API. */
const JSON_RENDERED_CODES = new Set(['E_BAD_CSRF_TOKEN'])

/**
 * Server errors whose translated message is meant for people: a dependency
 * is down or not configured, not a bug. They keep `{ message, code }` in
 * production too.
 */
const PUBLIC_SERVER_ERROR_CODES = new Set(['E_INSIGHTS_UNAVAILABLE', 'E_LLM_UNAVAILABLE'])

/** Postgres unique_violation: a race lost against a concurrent insert. */
const PG_UNIQUE_VIOLATION = '23505'

/** Postgres foreign_key_violation: a delete raced an insert (or the reverse). */
const PG_FOREIGN_KEY_VIOLATION = '23503'

/**
 * Postgres deadlock_detected / serialization_failure: two writers locked
 * the same rows in opposite order (e.g. the two batches of one upload
 * confirmed at once). Nothing was written; the client may simply retry.
 */
const PG_RETRYABLE = ['40P01', '40001']

/** Deleted parent (the statement Knex prefixes to the message) -> its "in use" code. */
const IN_USE_ON_DELETE: Array<[RegExp, string]> = [
  [/^delete from "categories"/, 'E_CATEGORY_IN_USE'],
  [/^delete from "accounts"/, 'E_ACCOUNT_IN_USE'],
]

function hasPgCode(
  error: unknown,
  code: string
): error is Error & { status?: number; code: string } {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code
}

function isUniqueViolation(error: unknown) {
  return hasPgCode(error, PG_UNIQUE_VIOLATION)
}

/** 409 code for a foreign key race: "in use" when a parent delete lost it. */
function foreignKeyConflictCode(error: Error) {
  const match = IN_USE_ON_DELETE.find(([statement]) => statement.test(error.message))
  return match ? match[1] : 'E_CONFLICT'
}

/** Extra client fields a domain error carries (`details`, see app/exceptions/errors.ts). */
function detailsOf(error: unknown): Record<string, unknown> {
  const details = (error as { details?: unknown } | null)?.details
  return typeof details === 'object' && details !== null && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {}
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
 *   from `errors.<code>` (E_ROW_NOT_FOUND -> 404 "Not found", domain errors),
 *   plus the error's `details` when it has them (`accountNumbers`, `line`...).
 *   Never the debug page: 4xx bodies are part of the contract.
 * - Postgres unique violations (a lost race the services could not
 *   pre-check) answer 409 `E_CONFLICT`, never the constraint name. Foreign
 *   key violations answer 409 too: `E_CATEGORY_IN_USE` / `E_ACCOUNT_IN_USE`
 *   when deleting the parent lost a race against an insert, else
 *   `E_CONFLICT`. Deadlocks and serialization failures answer 409
 *   `E_CONCURRENT_UPDATE` (retryable).
 * - 5xx: `E_INSIGHTS_UNAVAILABLE` / `E_LLM_UNAVAILABLE` (503) answer their
 *   translated `{ message, code }` everywhere; any other one shows the
 *   debug page in development and, in production, a generic translated
 *   `{ message, code: 'E_INTERNAL_SERVER_ERROR' }` (driver messages, table
 *   and constraint names never leave the server, they go to the logs).
 */
export default class HttpExceptionHandler extends ExceptionHandler {
  protected override debug = !app.inProduction

  /** No LLM configured: already warned once at boot (providers/llm_provider.ts). */
  protected override ignoreCodes = ['E_INSIGHTS_UNAVAILABLE']

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

    if (PG_RETRYABLE.some((code) => hasPgCode(error, code))) {
      ;(error as Error & { status?: number }).status = 409
      return ctx.response.status(409).send({
        message: translate('E_CONCURRENT_UPDATE', 'Concurrent update'),
        code: 'E_CONCURRENT_UPDATE',
      })
    }

    if (hasPgCode(error, PG_FOREIGN_KEY_VIOLATION)) {
      error.status = 409
      const code = foreignKeyConflictCode(error)
      return ctx.response.status(409).send({ message: translate(code, 'Conflict'), code })
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
      return ctx.response
        .status(httpError.status)
        .send({ ...detailsOf(error), message, code: httpError.code })
    }

    if (httpError.status >= 500 && PUBLIC_SERVER_ERROR_CODES.has(httpError.code ?? '')) {
      return ctx.response
        .status(httpError.status)
        .send({ message: translate(httpError.code!, httpError.message), code: httpError.code })
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
