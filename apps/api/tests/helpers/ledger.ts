import { DateTime } from 'luxon'
import Clock from '#services/clock'
import Category from '#models/category'
import app from '@adonisjs/core/services/app'

/** A category of the household's seeded taxonomy, by slug. */
export function categoryBySlug(householdId: number, slug: string) {
  return Category.query().where('household_id', householdId).where('slug', slug).firstOrFail()
}

/**
 * Freezes "now" for business rules (today in the household time zone,
 * the current month). Returns the restore function for `cleanup`.
 */
export function freezeClock(iso: string) {
  const frozen = DateTime.fromISO(iso, { setZone: true })
  class FrozenClock extends Clock {
    override now() {
      return frozen
    }
  }
  app.container.swap(Clock, () => new FrozenClock())
  return () => app.container.restore(Clock)
}
