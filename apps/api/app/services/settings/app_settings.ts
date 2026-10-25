import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

export const APP_SETTINGS_TABLE = 'app_settings'

/** Thrown inside the transaction to roll back a partial write. */
class AlreadyPresent extends Error {}

/**
 * The app's own key-value settings (`app_settings`): values the app writes
 * for itself instead of asking for an env var. Not tenant data. Values are
 * stored as given: callers encrypt secrets first.
 */
export default class AppSettings {
  async get(key: string): Promise<string | null> {
    const row = await db.from(APP_SETTINGS_TABLE).where('key', key).select('value').first()
    return row?.value ?? null
  }

  /**
   * Writes every entry in one transaction, unless any key is already
   * there: true when this call wrote them. Of two processes racing, the
   * second one's insert waits for the first one's commit, conflicts and
   * writes nothing, so readers always see one complete set.
   */
  async putAllIfAbsent(entries: Record<string, string>, now: Date): Promise<boolean> {
    const rows = Object.entries(entries).map(([key, value]) => ({
      key,
      value,
      created_at: now,
      updated_at: now,
    }))
    try {
      await db.transaction(async (trx) => {
        const inserted = await trx
          .knexQuery()
          .table(APP_SETTINGS_TABLE)
          .insert(rows)
          .onConflict('key')
          .ignore()
          .returning('key')
        if (inserted.length !== rows.length) throw new AlreadyPresent()
      })
      return true
    } catch (error) {
      if (error instanceof AlreadyPresent) return false
      throw error
    }
  }

  /**
   * Writes every entry, replacing the keys already there, in `client`'s
   * transaction when given (a rotation).
   */
  async putAll(
    entries: Record<string, string>,
    now: Date,
    client: QueryClientContract = db.connection()
  ): Promise<void> {
    const rows = Object.entries(entries).map(([key, value]) => ({
      key,
      value,
      created_at: now,
      updated_at: now,
    }))
    await client
      .knexQuery()
      .table(APP_SETTINGS_TABLE)
      .insert(rows)
      .onConflict('key')
      .merge(['value', 'updated_at'])
  }
}
