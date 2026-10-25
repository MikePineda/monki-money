import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import db from '@adonisjs/lucid/services/db'
import SchedulerRunsCommand from '#commands/scheduler_runs'
import { createHousehold } from '#tests/helpers/household'
import { SCHEDULER_RUNS_TABLE } from '#services/scheduler/scheduler_runs'

const NOW = DateTime.fromISO('2026-10-01T09:00:00Z')

interface RunSpec {
  job: string
  periodKey: string
  householdId?: number | null
  userId?: number | null
  startedAt: DateTime
  finished?: boolean
  outcome?: string | null
  error?: string | null
  attempts?: number
}

async function run(spec: RunSpec) {
  const startedAt = spec.startedAt.toJSDate()
  const finished = spec.finished ?? true
  await db.table(SCHEDULER_RUNS_TABLE).insert({
    job: spec.job,
    period_key: spec.periodKey,
    household_id: spec.householdId ?? null,
    user_id: spec.userId ?? null,
    attempts: spec.attempts ?? 1,
    started_at: startedAt,
    finished_at: finished ? startedAt : null,
    outcome: finished ? (spec.outcome ?? 'generated') : null,
    error: spec.error ?? null,
    created_at: startedAt,
    updated_at: startedAt,
  })
}

/** Runs the command; `lines` are its own output (the raw-mode logger is shared). */
async function runCommand(...args: string[]) {
  const command = await ace.create(SchedulerRunsCommand, args)
  const before = command.logger.getLogs().length
  await command.exec()
  return {
    command,
    lines: command.logger
      .getLogs()
      .slice(before)
      .map((log) => log.message),
  }
}

test.group('scheduler:runs command', (group) => {
  group.each.setup(() => {
    ace.ui.switchMode('raw')
    return () => ace.ui.switchMode('normal')
  })

  test('test_the_command_prints_the_last_runs_newest_first', async ({ assert }) => {
    const { household, owner } = await createHousehold()
    await run({
      job: 'monthly-insights',
      periodKey: '2026-09',
      householdId: household.id,
      startedAt: NOW.minus({ hours: 2 }),
    })
    await run({
      job: 'daily-reminder',
      periodKey: '2026-10-01',
      householdId: household.id,
      userId: owner.id,
      startedAt: NOW.minus({ hours: 1 }),
      outcome: 'failed',
      error: 'no device took it',
      attempts: 2,
    })
    await run({
      job: 'scheduler-runs-retention',
      periodKey: '2026-10-01',
      startedAt: NOW,
      finished: false,
    })

    const { command, lines } = await runCommand('--limit', '2')

    command.assertSucceeded()
    assert.deepEqual(lines, [
      '2026-10-01T09:00:00.000Z scheduler-runs-retention 2026-10-01 household=- user=- attempts=1 running',
      `2026-10-01T08:00:00.000Z daily-reminder 2026-10-01 household=${household.id} user=${owner.id} attempts=2 failed: no device took it`,
    ])
  })

  test('test_the_command_prints_json_for_scripts', async ({ assert }) => {
    const { household } = await createHousehold()
    await run({
      job: 'monthly-insights',
      periodKey: '2026-09',
      householdId: household.id,
      startedAt: NOW,
      outcome: 'skipped:no-activity',
    })

    const { command, lines } = await runCommand('--json')

    command.assertSucceeded()
    assert.lengthOf(lines, 1)
    assert.deepEqual(JSON.parse(lines[0]), [
      {
        id: JSON.parse(lines[0])[0].id,
        job: 'monthly-insights',
        periodKey: '2026-09',
        householdId: household.id,
        userId: null,
        attempts: 1,
        startedAt: '2026-10-01T09:00:00.000Z',
        finishedAt: '2026-10-01T09:00:00.000Z',
        outcome: 'skipped:no-activity',
        error: null,
      },
    ])
  })

  test('test_the_command_shows_one_job_with_the_job_flag', async ({ assert }) => {
    await run({ job: 'monthly-insights', periodKey: '2026-09', startedAt: NOW })
    await run({ job: 'scheduler-runs-retention', periodKey: '2026-10-01', startedAt: NOW })

    const { lines } = await runCommand('--job', 'scheduler-runs-retention')

    assert.deepEqual(lines, [
      '2026-10-01T09:00:00.000Z scheduler-runs-retention 2026-10-01 household=- user=- attempts=1 generated',
    ])
  })

  test('test_the_command_says_so_when_there_are_no_runs', async ({ assert }) => {
    const text = await runCommand()
    const json = await runCommand('--json')

    text.command.assertSucceeded()
    assert.deepEqual(text.lines, ['No scheduler runs yet'])
    assert.deepEqual(json.lines, ['[]'])
  })

  test('test_the_command_rejects_a_limit_that_is_not_a_positive_number', async () => {
    const { command } = await runCommand('--limit', '0')

    command.assertFailed()
  })
})
