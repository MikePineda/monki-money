import { Exception } from '@adonisjs/core/exceptions'

/**
 * A validation failure only a service can detect (email already taken,
 * foreign id in the body, wrong current password...). Rendered exactly like
 * a VineJS error: 422 `{ errors: [{ field, rule, message }] }`, with the
 * message from `validator.shared.messages.<field>.<rule>` (or `<rule>`) in
 * the request locale.
 */
export class FieldError extends Exception {
  static override status = 422
  static override code = 'E_FIELD_ERROR'

  constructor(
    public field: string,
    public rule: string,
    public meta: Record<string, unknown> = {}
  ) {
    super(`${field}: ${rule}`)
  }
}
