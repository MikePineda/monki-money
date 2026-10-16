import db from '@adonisjs/lucid/services/db'
import emitter from '@adonisjs/core/services/emitter'

/**
 * Counts the SQL statements `run` sends through the default connection.
 * Functional specs run inside a global transaction, so every query of the
 * request (middleware included) goes through that one client: turning its
 * `debug` flag on makes Lucid emit `db:query` for each of them. Compare two
 * counts to prove a code path does not grow with the number of rows (N+1).
 */
export async function countQueries(run: () => Promise<unknown>): Promise<number> {
  const client = db.connection() as unknown as { debug: boolean }
  const previous = client.debug
  let count = 0
  const listener = () => {
    count++
  }

  client.debug = true
  emitter.on('db:query', listener)
  try {
    await run()
  } finally {
    emitter.off('db:query', listener)
    client.debug = previous
  }
  return count
}
