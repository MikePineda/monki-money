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

  /** Where the field sits in the body (`changes.2`), or null at the top. */
  path: string | null = null

  constructor(
    public field: string,
    public rule: string,
    public meta: Record<string, unknown> = {}
  ) {
    super(`${field}: ${rule}`)
  }

  /**
   * The same failure for an item of a list in the body: rendered as
   * `<path>.<field>` (`changes.2.categoryId`), worded like the plain field.
   */
  within(path: string): FieldError {
    const nested = new FieldError(this.field, this.rule, this.meta)
    nested.path = path
    return nested
  }
}
