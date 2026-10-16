import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  Scheduler,
  schedulerEnabled,
  TICK_INTERVAL_MS,
  type ScheduledJob,
  type SchedulerLogger,
} from '#services/scheduler/scheduler'

const NOW = DateTime.fromISO('2026-10-01T08:30:00+10:00', { setZone: true })

function recordingLogger() {
  const lines: Array<{ level: string; message: string }> = []
  const at =
    (level: string) =>
    (_context: Record<string, unknown>, message: string): void => {
      lines.push({ level, message })
    }
  const logger: SchedulerLogger = { info: at('info'), warn: at('warn'), error: at('error') }
  return { logger, lines }
}

function job(name: string, run: (now: DateTime) => Promise<void> | void): ScheduledJob {
  return { name, tick: async (now) => run(now) }
}

test.group('Scheduler', () => {
  test('test_a_failing_job_never_escapes_the_tick_and_the_next_job_still_runs', async ({
    assert,
  }) => {
    const { logger, lines } = recordingLogger()
    const seen: DateTime[] = []
    const scheduler = new Scheduler(
      [
        job('broken', () => {
          throw new Error('boom')
        }),
        job('healthy', (now) => {
          seen.push(now)
        }),
      ],
      () => NOW,
      logger
    )

    await scheduler.tick()

    assert.deepEqual(seen, [NOW])
    assert.deepEqual(lines, [{ level: 'error', message: 'scheduler: job broken failed' }])
  })

  test('test_a_tick_still_running_is_not_started_again', async ({ assert }) => {
    const { logger } = recordingLogger()
    let runs = 0
    let release!: () => void
    const scheduler = new Scheduler(
      [
        job('slow', async () => {
          runs++
          await new Promise<void>((resolve) => (release = resolve))
        }),
      ],
      () => NOW,
      logger
    )

    const first = scheduler.tick()
    const overlapping = scheduler.tick()
    release()
    await Promise.all([first, overlapping])

    assert.equal(runs, 1)
    const next = scheduler.tick()
    release()
    await next
    assert.equal(runs, 2, 'the next tick runs once the previous one finished')
  })

  test('test_the_scheduler_ticks_on_its_interval_until_stopped', async ({ assert }) => {
    const { logger } = recordingLogger()
    let ticks = 0
    const scheduler = new Scheduler(
      [
        job('count', () => {
          ticks++
        }),
      ],
      () => NOW,
      logger,
      { firstTickDelayMs: 0, intervalMs: 10 }
    )

    scheduler.start()
    await sleep(80)
    await scheduler.stop()
    const stoppedAt = ticks
    await sleep(40)

    assert.isAtLeast(stoppedAt, 2)
    assert.equal(ticks, stoppedAt, 'no tick after stop()')
    assert.equal(TICK_INTERVAL_MS, 15 * 60 * 1000)
  })

  test('test_the_scheduler_runs_only_in_production_unless_switched_off', ({ assert }) => {
    assert.isTrue(schedulerEnabled({ inProduction: true, setting: undefined }))
    assert.isTrue(schedulerEnabled({ inProduction: true, setting: 'on' }))
    assert.isFalse(schedulerEnabled({ inProduction: true, setting: 'off' }))
    assert.isFalse(schedulerEnabled({ inProduction: false, setting: undefined }))
    assert.isFalse(schedulerEnabled({ inProduction: false, setting: 'on' }))
  })
})
