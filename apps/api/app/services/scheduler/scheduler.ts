import type { DateTime } from 'luxon'
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * Minimal in-process scheduler. `@adonisjs/queue` only fires schedules from
 * a `queue:work` worker and its `sync` driver ignores them, so the web
 * process ticks on its own: every 15 minutes it asks each job to run
 * whatever is due. Jobs own their idempotency (`scheduler_runs`, see
 * scheduler_runs.ts), which keeps two overlapping containers (start-first
 * updates) and restarts from doing the same work twice. Started by
 * providers/scheduler_provider.ts in production only.
 */

export const TICK_INTERVAL_MS = 15 * 60 * 1000

/** First tick after boot: lets the server turn healthy first. */
export const FIRST_TICK_DELAY_MS = 60 * 1000

/** How long `stop()` waits for a tick in progress before letting it go. */
const STOP_GRACE_MS = 5 * 1000

export interface TickContext {
  /** The current instant: read it again for every unit of work. */
  now: () => DateTime
  /**
   * Aborted once the process is stopping: check it before starting anything
   * new (a claim, a paid model call), and leave work not started for the
   * next tick of any container.
   */
  signal: AbortSignal
}

/** A unit of recurring work. `tick` should not throw; the scheduler guards anyway. */
export interface ScheduledJob {
  readonly name: string
  tick(context: TickContext): Promise<void>
}

/** The pino methods the scheduler uses (the app logger in production). */
export interface SchedulerLogger {
  info(context: Record<string, unknown>, message: string): void
  warn(context: Record<string, unknown>, message: string): void
  error(context: Record<string, unknown>, message: string): void
}

export interface SchedulerTiming {
  firstTickDelayMs: number
  intervalMs: number
}

/** Production only, unless `SCHEDULER=off`; never in development or tests. */
export function schedulerEnabled(input: {
  inProduction: boolean
  setting: 'on' | 'off' | undefined
}): boolean {
  return input.inProduction && input.setting !== 'off'
}

export class Scheduler {
  #timer: NodeJS.Timeout | null = null
  #running: Promise<void> | null = null
  readonly #stopping = new AbortController()

  constructor(
    protected jobs: ScheduledJob[],
    protected now: () => DateTime,
    protected logger: SchedulerLogger,
    protected timing: SchedulerTiming = {
      firstTickDelayMs: FIRST_TICK_DELAY_MS,
      intervalMs: TICK_INTERVAL_MS,
    }
  ) {}

  /**
   * Runs every job once, in order. Never rejects: a failing job is logged and
   * the next one still runs. A tick still in progress is not started again,
   * and nothing starts once `stop()` was called.
   */
  tick(): Promise<void> {
    if (this.#stopping.signal.aborted) return Promise.resolve()
    if (!this.#running) {
      this.#running = this.#runJobs().finally(() => {
        this.#running = null
      })
    }
    return this.#running
  }

  start() {
    if (this.#timer || this.#stopping.signal.aborted) return
    this.logger.info(
      {
        jobs: this.jobs.map((job) => job.name),
        everyMinutes: this.timing.intervalMs / 60_000,
      },
      'scheduler: started'
    )
    this.#timer = setTimeout(() => {
      void this.tick()
      this.#timer = setInterval(() => void this.tick(), this.timing.intervalMs).unref()
    }, this.timing.firstTickDelayMs).unref()
  }

  /**
   * Stops ticking and tells a tick in progress to stop (its jobs see the
   * signal before their next unit of work), then gives it a few seconds to
   * wind down: a model call already on the wire is not interrupted.
   */
  async stop() {
    this.#stopping.abort()
    if (this.#timer) {
      clearTimeout(this.#timer)
      clearInterval(this.#timer)
      this.#timer = null
    }
    if (this.#running) {
      await Promise.race([this.#running, sleep(STOP_GRACE_MS, undefined, { ref: false })])
    }
  }

  async #runJobs() {
    const context: TickContext = { now: this.now, signal: this.#stopping.signal }
    for (const job of this.jobs) {
      if (context.signal.aborted) return
      try {
        await job.tick(context)
      } catch (error) {
        this.logger.error({ err: error, job: job.name }, `scheduler: job ${job.name} failed`)
      }
    }
  }
}
