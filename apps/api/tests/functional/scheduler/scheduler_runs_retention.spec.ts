import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { createHousehold } from '#tests/helpers/household'
import { SCHEDULER_RUNS_TABLE } from '#services/scheduler/scheduler_runs'
import SchedulerRunsRetentionJob, {
  RETENTION_JOB,
} from '#services/scheduler/scheduler_runs_retention_job'

const NOW = DateTime.fromISO('2026-10-25T09:00:00+10:00', { setZone: true })

interface RunSpec {
  job?: string
  periodKey: string
  householdId?: number | null
  userId?: number | null
  startedAt: DateTime
}

/** A finished run row, as a job writes it. */
async function run(spec: RunSpec): Promise<number> {
  const startedAt = spec.startedAt.toJSDate()
  const [row] = await db
    .table(SCHEDULER_RUNS_TABLE)
    .insert({
      job: spec.job ?? 'monthly-insights',
      period_key: spec.periodKey,
      household_id: spec.householdId ?? null,
      user_id: spec.userId ?? null,
      attempts: 1,
      started_at: startedAt,
      finished_at: startedAt,
      outcome: 'generated',
      created_at: startedAt,
      updated_at: startedAt,
    })
    .returning('id')
  return row.id
}

async function remainingIds(): Promise<number[]> {
  const rows = await db.from(SCHEDULER_RUNS_TABLE).whereNot('job', RETENTION_JOB).select('id')
  return rows.map((row) => row.id as number)
}

function tickAt(job: SchedulerRunsRetentionJob, instant: DateTime, signal?: AbortSignal) {
  return job.tick({ now: () => instant, signal: signal ?? new AbortController().signal })
}

test.group('Scheduler runs retention: the daily prune', () => {
  test('test_the_prune_drops_runs_older_than_thirteen_months_and_keeps_the_rest', async ({
    assert,
  }) => {
    const { household, owner } = await createHousehold()
    const job = await app.container.make(SchedulerRunsRetentionJob)
    const old = await run({
      periodKey: '2025-08',
      householdId: household.id,
      startedAt: NOW.minus({ months: 14 }),
    })
    const oldReminder = await run({
      job: 'daily-reminder',
      periodKey: '2025-09-20',
      householdId: household.id,
      userId: owner.id,
      startedAt: NOW.minus({ months: 13, days: 1 }),
    })
    const lastYear = await run({
      periodKey: '2025-09',
      householdId: household.id,
      startedAt: NOW.minus({ months: 13 }).plus({ days: 1 }),
    })
    const recent = await run({
      periodKey: '2026-09',
      householdId: household.id,
      startedAt: NOW.minus({ weeks: 3 }),
    })

    await tickAt(job, NOW)

    assert.sameMembers(await remainingIds(), [lastYear, recent])
    assert.notInclude(await remainingIds(), old)
    assert.notInclude(await remainingIds(), oldReminder)
    // The prune logs itself like any run: one per UTC day, app-wide.
    const own = await db.from(SCHEDULER_RUNS_TABLE).where('job', RETENTION_JOB)
    assert.lengthOf(own, 1)
    assert.include(own[0], {
      period_key: '2026-10-24',
      household_id: null,
      user_id: null,
      outcome: 'pruned:2',
    })
    assert.isNotNull(own[0].finished_at)
  })

  test('test_the_prune_runs_at_most_once_a_day', async ({ assert }) => {
    const job = await app.container.make(SchedulerRunsRetentionJob)
    await tickAt(job, NOW)
    const leftover = await run({ periodKey: '2025-01', startedAt: NOW.minus({ months: 20 }) })

    // Later ticks of the same UTC day (any container) leave it alone...
    await tickAt(job, NOW.plus({ minutes: 15 }))
    // 23:45 UTC: still 24 October for the claim.
    await tickAt(job, NOW.plus({ minutes: 45 }))
    assert.include(await remainingIds(), leftover)

    // ...the next day's first tick prunes it.
    await tickAt(job, NOW.plus({ days: 1 }))
    assert.notInclude(await remainingIds(), leftover)
    const own = await db.from(SCHEDULER_RUNS_TABLE).where('job', RETENTION_JOB).orderBy('id')
    assert.deepEqual(
      own.map((row) => [row.period_key, row.outcome]),
      [
        ['2026-10-24', 'pruned:0'],
        ['2026-10-25', 'pruned:1'],
      ]
    )
  })

  test('test_a_stopping_process_gives_the_prune_back_untouched', async ({ assert }) => {
    const job = await app.container.make(SchedulerRunsRetentionJob)
    const leftover = await run({ periodKey: '2025-01', startedAt: NOW.minus({ months: 20 }) })
    const stopping = new AbortController()
    stopping.abort()

    await tickAt(job, NOW, stopping.signal)

    assert.include(await remainingIds(), leftover)
    const own = await db.from(SCHEDULER_RUNS_TABLE).where('job', RETENTION_JOB)
    assert.lengthOf(own, 0)
  })
})
