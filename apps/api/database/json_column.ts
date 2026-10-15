import { column } from '@adonisjs/lucid/orm'
import type { ColumnOptions } from '@adonisjs/lucid/types/model'

/**
 * `@column()` for jsonb columns holding arrays (used by the generated
 * `database/schema.ts` through `schema_rules.ts`). `pg` sends a JS array as
 * a Postgres array literal ('{a,b}'), which jsonb rejects, so the value is
 * stringified on the way in. `pg` parses jsonb on the way out.
 */
export function jsonColumn(options: Partial<ColumnOptions> = {}) {
  return column({
    prepare: (value: unknown) =>
      value === null || value === undefined ? value : JSON.stringify(value),
    ...options,
  })
}
