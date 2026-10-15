import pg from 'pg'

/**
 * Global `pg` type parsers, registered before the first query:
 *
 * - INT8 (`bigint`, also the type of `SUM()`/`COUNT()`) -> number. Money is
 *   integer cents; sums stay far below Number.MAX_SAFE_INTEGER.
 * - DATE -> the raw 'YYYY-MM-DD' string. The default parser builds a JS Date
 *   at local midnight, which shifts the day as soon as TZ is not UTC.
 */
export function registerPgTypeParsers(types: typeof pg.types = pg.types) {
  types.setTypeParser(types.builtins.INT8, (value: string) => Number(value))
  types.setTypeParser(types.builtins.DATE, (value: string) => value)
}

export default class PgTypesProvider {
  register() {
    registerPgTypeParsers()
  }
}
