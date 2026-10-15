import { DateTime } from 'luxon'

/**
 * The only reader of the wall clock for business rules ("today in the
 * household time zone", "this month"). Resolved through the container, so
 * tests swap it for a fixed instant: `app.container.swap(Clock, ...)`.
 */
export default class Clock {
  now(): DateTime {
    return DateTime.now()
  }
}
