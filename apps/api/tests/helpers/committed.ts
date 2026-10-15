import db from '@adonisjs/lucid/services/db'
import type { TestHousehold } from '#tests/helpers/household'

type Cleanup = (callback: () => Promise<void> | void) => void

/**
 * Runs a test outside the per-test global transaction, so several
 * connections (and their row locks) really interleave. Whatever the test
 * commits must be tracked: households (and their users) are deleted when
 * the test ends, and the global transaction is reopened for the group's
 * teardown.
 */
export async function withoutGlobalTransaction(cleanup: Cleanup) {
  await db.rollbackGlobalTransaction()
  const households: number[] = []
  const users: number[] = []

  cleanup(async () => {
    if (households.length > 0) await db.from('households').whereIn('id', households).delete()
    if (users.length > 0) await db.from('users').whereIn('id', users).delete()
    await db.beginGlobalTransaction()
  })

  return {
    track<Fixture extends TestHousehold>(fixture: Fixture): Fixture {
      households.push(fixture.household.id)
      users.push(...fixture.users.map((user) => user.id))
      return fixture
    },
  }
}

/** Resolves once another connection of this database waits on a row lock. */
export async function untilSomeoneWaitsOnALock(timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await db.rawQuery(
      `SELECT count(*) AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`
    )
    if (Number(result.rows[0].waiting) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Nobody waited on the lock: the operation did not reach the locked row')
}
