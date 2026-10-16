import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import LlmUsage from '#models/llm_usage'
import ace from '@adonisjs/core/services/ace'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { Locale } from '@monkimoney/shared'
import { LlmProvider } from '#llm/llm_provider'
import { freezeClock } from '#tests/helpers/ledger'
import MonthlyInsight from '#models/monthly_insight'
import InsightsGenerate from '#commands/insights_generate'
import { createHousehold } from '#tests/helpers/household'
import InsightService from '#services/insights/insight_service'
import { FakeLlmProvider } from '#llm/providers/fake_llm_provider'
import SchedulerRuns, { type RunKey } from '#services/scheduler/scheduler_runs'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'
import MonthlyInsightsJob, { MONTHLY_INSIGHTS_JOB } from '#services/insights/monthly_insights_job'

/** Mid-October 2026 in Brisbane: the command's default month is September. */
const MID_OCTOBER = '2026-10-15T09:00:00+10:00'
/** The scheduled run of September: 1 October, 08:30 in Brisbane. */
const FIRST_OF_OCTOBER = DateTime.fromISO('2026-10-01T08:30:00+10:00', { setZone: true })

type September = 'activity' | 'transfers-only' | 'nothing'

async function insightFixtures() {
  return JSON.parse(await readFile(app.makePath('tests/fixtures/llm/insight.json'), 'utf8'))
}

async function containerLlm() {
  const llm = await app.container.make(LlmProvider)
  if (!(llm instanceof FakeLlmProvider)) throw new Error('Tests run with LLM_PROVIDER=fake')
  return llm
}

/** A household (Brisbane) whose September had spending, only transfers, or nothing. */
async function householdWith(september: September, options: { locale?: Locale } = {}) {
  const fixture = await createHousehold({
    locale: options.locale,
    accounts: [{ name: 'Everyday' }, { name: 'Savings', kind: 'savings' }],
  })
  const { household, owner, accounts } = fixture
  const base = { householdId: household.id, accountId: accounts[0].id, createdByUserId: owner.id }

  // October activity never makes September count.
  await TransactionFactory.merge({ ...base, date: '2026-10-02', amountCents: -2_500 }).create()
  if (september === 'nothing') return fixture

  await TransferFactory.merge({
    householdId: household.id,
    fromAccountId: accounts[0].id,
    toAccountId: accounts[1].id,
    date: '2026-09-20',
    amountCents: 100_000,
  }).create()
  if (september === 'activity') {
    await TransactionFactory.merge([
      { ...base, kind: 'income', date: '2026-09-01', amountCents: 500_000 },
      { ...base, date: '2026-09-03', amountCents: -80_000 },
    ]).createMany(2)
  }
  return fixture
}

/** September's English summary as a partner's tap at `generatedAt` left it. */
async function storedSummary(householdId: number, generatedAt: string, headline: string) {
  const stamp = new Date(generatedAt)
  await db.table('monthly_insights').insert({
    household_id: householdId,
    month: '2026-09',
    locale: 'en',
    headline,
    body_markdown: 'Written by a tap.',
    highlights: '[]',
    input_json: '{}',
    model: 'fake',
    generated_at: stamp,
    created_at: stamp,
    updated_at: stamp,
  })
}

function insightsOf(householdId: number) {
  return MonthlyInsight.query().where('household_id', householdId).orderBy('id')
}

function runsOf(householdId: number) {
  return db
    .from('scheduler_runs')
    .where('household_id', householdId)
    .orderBy('id')
    .select('job', 'period_key', 'attempts', 'outcome', 'error', 'finished_at')
}

function septemberOf(householdId: number): RunKey {
  return { job: MONTHLY_INSIGHTS_JOB, periodKey: '2026-09', householdId }
}

/** One scheduler tick in which every household reads `instant` as now. */
function tickAt(job: MonthlyInsightsJob, instant: DateTime, signal?: AbortSignal) {
  return job.tick({ now: () => instant, signal: signal ?? new AbortController().signal })
}

/** Runs the command; `lines` are its own output (the raw-mode logger is shared). */
async function runCommand(...args: string[]) {
  const command = await ace.create(InsightsGenerate, args)
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

/** Uses the monthly cap of every household; restored after the test. */
function capLlmCallsAt(cap: number, cleanup: (callback: () => void) => void) {
  const previous = app.config.get('llm.monthlyCapOverride')
  app.config.set('llm.monthlyCapOverride', cap)
  cleanup(() => app.config.set('llm.monthlyCapOverride', previous))
}

/** One answered insight call on 1 October at 07:00 in Brisbane (it counts against the quota). */
async function spentOneCall(householdId: number) {
  const stamp = new Date('2026-09-30T21:00:00Z')
  await db.table('llm_usage').insert({
    household_id: householdId,
    purpose: 'insight',
    provider: 'fake',
    model: 'fake',
    status: 'ok',
    created_at: stamp,
    updated_at: stamp,
  })
}

test.group('Monthly insights: insights:generate command', (group) => {
  group.each.setup(() => {
    ace.ui.switchMode('raw')
    const restoreClock = freezeClock(MID_OCTOBER)
    return () => {
      ace.ui.switchMode('normal')
      restoreClock()
    }
  })

  test('test_the_command_generates_only_for_households_with_activity', async ({ assert }) => {
    const fixtures = await insightFixtures()
    const busy = await householdWith('activity', { locale: 'es' })
    const transfersOnly = await householdWith('transfers-only')
    const quiet = await householdWith('nothing')

    const { command, lines } = await runCommand()

    command.assertSucceeded()
    const rows = await insightsOf(busy.household.id)
    assert.deepEqual(
      rows.map((row) => [row.month, row.locale, row.headline, row.generatedByUserId]),
      [['2026-09', 'es', fixtures.es.headline, null]]
    )
    assert.lengthOf(await insightsOf(transfersOnly.household.id), 0)
    assert.lengthOf(await insightsOf(quiet.household.id), 0)
    assert.includeMembers(lines, [
      `household ${busy.household.id} 2026-09 es: generated`,
      `household ${transfersOnly.household.id} 2026-09 en: skipped (no activity)`,
      `household ${quiet.household.id} 2026-09 en: skipped (no activity)`,
    ])
  })

  test('test_running_the_command_twice_creates_one_row', async ({ assert }) => {
    const { household } = await householdWith('activity')
    const llm = await containerLlm()
    const id = String(household.id)

    await runCommand('--month', '2026-09', '--household', id)
    const calls = llm.requests.length
    const { command, lines } = await runCommand('--month', '2026-09', '--household', id)

    command.assertSucceeded()
    assert.lengthOf(await insightsOf(household.id), 1)
    assert.equal(llm.requests.length, calls, 'the second run costs no call')
    assert.deepEqual(lines, [
      `household ${household.id} 2026-09 en: skipped (already run; --force redoes it)`,
    ])
    const runs = await runsOf(household.id)
    assert.deepEqual(
      runs.map((run) => [run.period_key, run.outcome, run.attempts]),
      [['2026-09', 'generated', 1]]
    )
  })

  test('test_force_recreates_the_month_summary', async ({ assert }) => {
    const fixtures = await insightFixtures()
    const { household } = await householdWith('activity')
    const llm = await containerLlm()
    const id = String(household.id)
    await runCommand('--household', id)
    const [first] = await insightsOf(household.id)
    assert.equal(first.headline, fixtures.en.headline)

    llm.script(
      JSON.stringify({ headline: 'A second look', body: 'Still **fine**.', highlights: [] })
    )
    const { command, lines } = await runCommand('--household', id, '--force')

    command.assertSucceeded()
    const rows = await insightsOf(household.id)
    assert.deepEqual(
      rows.map((row) => [row.month, row.headline]),
      [['2026-09', 'A second look']]
    )
    assert.deepEqual(lines, [`household ${household.id} 2026-09 en: generated`])
    assert.lengthOf(await runsOf(household.id), 1, '--force bypasses the lock')
  })

  test('test_a_summary_written_after_the_month_ended_is_kept', async ({ assert }) => {
    const { household } = await householdWith('activity')
    // Tapped on 2 October: it already covers the whole of September.
    await storedSummary(household.id, '2026-10-02T09:00:00+10:00', 'Tapped on the 2nd')
    const llm = await containerLlm()
    const calls = llm.requests.length

    const { lines } = await runCommand('--household', String(household.id))

    assert.deepEqual(lines, [`household ${household.id} 2026-09 en: skipped (already generated)`])
    assert.equal(llm.requests.length, calls)
    const rows = await insightsOf(household.id)
    assert.deepEqual(
      rows.map((row) => row.headline),
      ['Tapped on the 2nd']
    )
  })

  test('test_a_household_over_quota_is_skipped_and_reported', async ({ assert, cleanup }) => {
    capLlmCallsAt(1, cleanup)
    const spent = await householdWith('activity')
    const fresh = await householdWith('activity')
    await spentOneCall(spent.household.id)

    const { command, lines } = await runCommand('--month', '2026-09')

    command.assertSucceeded()
    assert.lengthOf(await insightsOf(spent.household.id), 0)
    assert.lengthOf(await insightsOf(fresh.household.id), 1)
    assert.includeMembers(lines, [
      `household ${spent.household.id} 2026-09 en: skipped (quota exhausted)`,
      `household ${fresh.household.id} 2026-09 en: generated`,
    ])
  })

  test('test_a_failure_in_one_household_does_not_stop_the_next', async ({ assert }) => {
    const first = await householdWith('activity')
    const second = await householdWith('activity')
    const llm = await containerLlm()
    // Two unusable answers: the first household's call and its retry.
    llm.script('not json at all', 'still not json')

    const { command, lines } = await runCommand('--month', '2026-09')

    command.assertFailed()
    assert.lengthOf(await insightsOf(first.household.id), 0)
    assert.lengthOf(await insightsOf(second.household.id), 1)
    const failed = lines.find((line) => line.startsWith(`household ${first.household.id} `))
    assert.match(failed!, /^household \d+ 2026-09 en: failed \(E_LLM_OUTPUT_INVALID: /)
    assert.include(lines, `household ${second.household.id} 2026-09 en: generated`)
    const usage = await LlmUsage.query().where('household_id', first.household.id)
    assert.deepEqual(
      usage.map((entry) => entry.status),
      ['invalid_output', 'invalid_output']
    )
    const [run] = await runsOf(first.household.id)
    assert.include(run, { attempts: 1, outcome: 'failed:final' })
  })

  test('test_llm_usage_gets_a_row_per_generated_insight', async ({ assert }) => {
    const households = [await householdWith('activity'), await householdWith('activity')]

    await runCommand('--month', '2026-09')

    for (const { household } of households) {
      const usage = await LlmUsage.query().where('household_id', household.id)
      assert.deepEqual(
        usage.map((entry) => [entry.purpose, entry.status, entry.userId]),
        [['insight', 'ok', null]]
      )
    }
  })

  test('test_the_command_skips_households_pending_deletion_or_without_a_live_model', async ({
    assert,
    cleanup,
  }) => {
    const leaving = await householdWith('activity')
    await leaving.household
      .merge({ status: 'pending_deletion', deletionScheduledAt: DateTime.now().plus({ days: 30 }) })
      .save()
    const { lines } = await runCommand('--month', '2026-09', '--force')
    assert.include(
      lines,
      `household ${leaving.household.id} 2026-09 en: skipped (pending deletion)`
    )

    class ProductionInsightService extends InsightService {
      protected override fakeLlmAllowed() {
        return false
      }
    }
    app.container.swap(InsightService, (resolver) => resolver.make(ProductionInsightService))
    cleanup(() => app.container.restore(InsightService))
    const staying = await householdWith('activity')
    const llm = await containerLlm()
    const calls = llm.requests.length

    const production = await runCommand('--household', String(staying.household.id))

    production.command.assertSucceeded()
    assert.deepEqual(production.lines, [
      `household ${staying.household.id} 2026-09 en: skipped (LLM not configured)`,
    ])
    assert.equal(llm.requests.length, calls)
    assert.lengthOf(await insightsOf(staying.household.id), 0)
  })

  test('test_the_command_rejects_a_malformed_month_and_an_unknown_household', async () => {
    const malformed = await runCommand('--month', '2026-9')
    malformed.command.assertFailed()
    malformed.command.assertLogMatches(/--month must be YYYY-MM/)

    const unknown = await runCommand('--household', '999999')
    unknown.command.assertFailed()
    unknown.command.assertLogMatches(/Household 999999 not found/)
  })
})

test.group('Monthly insights: scheduled run', (group) => {
  group.each.setup(() => freezeClock(FIRST_OF_OCTOBER.toISO()!))

  test('test_the_scheduled_run_generates_once_eight_passes_in_the_household_timezone', async ({
    assert,
  }) => {
    const fixtures = await insightFixtures()
    const { household } = await householdWith('activity')
    const job = await app.container.make(MonthlyInsightsJob)

    await tickAt(job, FIRST_OF_OCTOBER.set({ hour: 7, minute: 45 }))
    assert.lengthOf(await insightsOf(household.id), 0, 'not before 08:00')
    assert.lengthOf(await runsOf(household.id), 0)

    await tickAt(job, FIRST_OF_OCTOBER)

    const rows = await insightsOf(household.id)
    assert.deepEqual(
      rows.map((row) => [row.month, row.locale, row.headline]),
      [['2026-09', 'en', fixtures.en.headline]]
    )
    const runs = await runsOf(household.id)
    assert.lengthOf(runs, 1)
    assert.include(runs[0], {
      job: MONTHLY_INSIGHTS_JOB,
      period_key: '2026-09',
      attempts: 1,
      outcome: 'generated',
      error: null,
    })
    assert.isNotNull(runs[0].finished_at)
  })

  test('test_a_summary_tapped_before_the_month_ended_is_replaced_on_the_first', async ({
    assert,
  }) => {
    const fixtures = await insightFixtures()
    const partial = await householdWith('activity')
    const early = await householdWith('activity')
    // The partner tapped on the 20th: it covers 1-20 September only.
    await storedSummary(partial.household.id, '2026-09-20T10:00:00+10:00', 'Tapped on the 20th')
    // Tapped at 07:00 on the 1st: September was already over.
    await storedSummary(early.household.id, '2026-10-01T07:00:00+10:00', 'Tapped on the 1st')
    const job = await app.container.make(MonthlyInsightsJob)
    const llm = await containerLlm()
    const calls = llm.requests.length

    await tickAt(job, FIRST_OF_OCTOBER)

    assert.equal(llm.requests.length, calls + 1, 'one call, for the partial summary only')
    const replaced = await insightsOf(partial.household.id)
    assert.deepEqual(
      replaced.map((row) => [row.headline, row.generatedAt.toMillis()]),
      [[fixtures.en.headline, FIRST_OF_OCTOBER.toMillis()]]
    )
    const kept = await insightsOf(early.household.id)
    assert.deepEqual(
      kept.map((row) => row.headline),
      ['Tapped on the 1st']
    )
    const [run] = await runsOf(early.household.id)
    assert.include(run, { outcome: 'skipped:already-generated' })
  })

  test('test_the_scheduler_lock_prevents_a_second_concurrent_run_of_the_same_period', async ({
    assert,
  }) => {
    const busy = await householdWith('activity')
    const other = await householdWith('activity')
    const runs = await app.container.make(SchedulerRuns)
    const job = await app.container.make(MonthlyInsightsJob)
    const llm = await containerLlm()
    const key = septemberOf(busy.household.id)

    // Another container started this household's run five minutes ago.
    const owned = await runs.claim(key, FIRST_OF_OCTOBER.minus({ minutes: 5 }))
    assert.isNotNull(owned)
    assert.isNull(await runs.claim(key, FIRST_OF_OCTOBER), 'a claimed period is not claimed twice')

    const calls = llm.requests.length
    await tickAt(job, FIRST_OF_OCTOBER)

    assert.lengthOf(await insightsOf(busy.household.id), 0, 'left to the container that owns it')
    assert.lengthOf(await insightsOf(other.household.id), 1)
    assert.equal(llm.requests.length, calls + 1)

    // Once finished, a period never runs again, whatever the number of ticks.
    await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes: 15 }))
    await runs.finish(owned!, FIRST_OF_OCTOBER.plus({ minutes: 20 }), { outcome: 'generated' })
    await tickAt(job, FIRST_OF_OCTOBER.plus({ hours: 3 }))
    assert.equal(llm.requests.length, calls + 1)
    assert.lengthOf(await runsOf(other.household.id), 1)
    assert.isNull(await runs.claim(key, FIRST_OF_OCTOBER.plus({ hours: 4 })))
  })

  test('test_the_command_and_the_scheduler_share_the_lock', async ({ assert, cleanup }) => {
    ace.ui.switchMode('raw')
    cleanup(() => ace.ui.switchMode('normal'))
    const { household } = await householdWith('activity')
    const job = await app.container.make(MonthlyInsightsJob)
    const llm = await containerLlm()
    const id = String(household.id)
    const calls = llm.requests.length

    // A manual run on the 1st claims the scheduler's row...
    const manual = await runCommand('--household', id)
    assert.deepEqual(manual.lines, [`household ${household.id} 2026-09 en: generated`])
    // ...so the tick does not pay for it again, nor does a second manual run.
    await tickAt(job, FIRST_OF_OCTOBER)
    const again = await runCommand('--household', id)
    assert.deepEqual(again.lines, [
      `household ${household.id} 2026-09 en: skipped (already run; --force redoes it)`,
    ])
    assert.equal(llm.requests.length, calls + 1)

    // --force bypasses the lock (and leaves its row alone).
    const forced = await runCommand('--household', id, '--force')
    assert.deepEqual(forced.lines, [`household ${household.id} 2026-09 en: generated`])
    assert.equal(llm.requests.length, calls + 2)
    const runs = await runsOf(household.id)
    assert.deepEqual(
      runs.map((run) => [run.outcome, run.attempts]),
      [['generated', 1]]
    )
  })

  test('test_a_run_left_unfinished_by_a_stopped_container_is_taken_over_after_thirty_minutes', async ({
    assert,
  }) => {
    const { household } = await householdWith('activity')
    const runs = await app.container.make(SchedulerRuns)
    const job = await app.container.make(MonthlyInsightsJob)
    await runs.claim(septemberOf(household.id), FIRST_OF_OCTOBER.minus({ minutes: 20 }))

    await tickAt(job, FIRST_OF_OCTOBER)
    assert.lengthOf(await insightsOf(household.id), 0, 'twenty minutes may still be running')

    await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes: 15 }))

    assert.lengthOf(await insightsOf(household.id), 1)
    const [run] = await runsOf(household.id)
    assert.include(run, { attempts: 2, outcome: 'generated', error: null })
  })

  test('test_a_taken_over_run_cannot_be_finished_or_released_by_its_old_owner', async ({
    assert,
  }) => {
    const { household } = await householdWith('activity')
    const runs = await app.container.make(SchedulerRuns)
    const key = septemberOf(household.id)
    const old = await runs.claim(key, FIRST_OF_OCTOBER.minus({ minutes: 40 }))
    const current = await runs.claim(key, FIRST_OF_OCTOBER)
    assert.deepEqual([old?.attempt, current?.attempt], [1, 2])

    // The old owner wakes up late: nothing it writes lands.
    assert.isFalse(await runs.finish(old!, FIRST_OF_OCTOBER, { outcome: 'generated' }))
    assert.isFalse(await runs.release(old!, FIRST_OF_OCTOBER))
    const [running] = await runsOf(household.id)
    assert.include(running, { attempts: 2, outcome: null, finished_at: null })

    assert.isTrue(
      await runs.finish(current!, FIRST_OF_OCTOBER.plus({ minutes: 1 }), { outcome: 'generated' })
    )
    const [finished] = await runsOf(household.id)
    assert.include(finished, { attempts: 2, outcome: 'generated' })
  })

  test('test_a_failure_in_one_household_does_not_stop_the_next_and_is_retried_an_hour_later', async ({
    assert,
  }) => {
    const failing = await householdWith('activity')
    const healthy = await householdWith('activity')
    const job = await app.container.make(MonthlyInsightsJob)
    const llm = await containerLlm()
    llm.script(new Error('vendor down'))

    await tickAt(job, FIRST_OF_OCTOBER)

    assert.lengthOf(await insightsOf(failing.household.id), 0)
    assert.lengthOf(await insightsOf(healthy.household.id), 1)
    const [failed] = await runsOf(failing.household.id)
    assert.include(failed, { attempts: 1, outcome: 'failed' })
    assert.equal(failed.error, 'E_LLM_UNAVAILABLE: vendor down')

    // Not retried within the hour, then retried once.
    const calls = llm.requests.length
    await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes: 45 }))
    assert.equal(llm.requests.length, calls)
    await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes: 75 }))

    assert.lengthOf(await insightsOf(failing.household.id), 1)
    const [retried] = await runsOf(failing.household.id)
    assert.include(retried, { attempts: 2, outcome: 'generated', error: null })
  })

  test('test_a_vendor_failure_is_tried_three_times_at_most', async ({ assert }) => {
    const { household } = await householdWith('activity')
    const job = await app.container.make(MonthlyInsightsJob)
    const llm = await containerLlm()
    llm.script(new Error('down 1'), new Error('down 2'), new Error('down 3'))

    for (const minutes of [0, 90, 180, 270, 360]) {
      await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes }))
    }

    assert.lengthOf(await insightsOf(household.id), 0)
    const [run] = await runsOf(household.id)
    assert.include(run, { attempts: 3, outcome: 'failed', error: 'E_LLM_UNAVAILABLE: down 3' })
    assert.lengthOf(await LlmUsage.query().where('household_id', household.id), 3)
  })

  test('test_an_unusable_answer_is_final_and_never_retried', async ({ assert }) => {
    const { household } = await householdWith('activity')
    const job = await app.container.make(MonthlyInsightsJob)
    const llm = await containerLlm()
    // The answer and the LLM layer's own retry: both billed, both unusable.
    llm.script('not json at all', 'still not json')

    for (const minutes of [0, 75, 150, 225]) {
      await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes }))
    }

    assert.lengthOf(await insightsOf(household.id), 0)
    const [run] = await runsOf(household.id)
    assert.include(run, { attempts: 1, outcome: 'failed:final' })
    assert.match(run.error, /^E_LLM_OUTPUT_INVALID: /)
    const usage = await LlmUsage.query().where('household_id', household.id)
    assert.deepEqual(
      usage.map((entry) => entry.status),
      ['invalid_output', 'invalid_output'],
      'one job attempt, never a second'
    )
  })

  test('test_a_stop_request_ends_the_tick_before_the_next_household', async ({
    assert,
    cleanup,
  }) => {
    const stopping = new AbortController()
    // The process is told to stop while the first household's summary is written.
    class StopAfterOneInsightService extends InsightService {
      override async generate(...args: Parameters<InsightService['generate']>) {
        const generated = await super.generate(...args)
        stopping.abort()
        return generated
      }
    }
    app.container.swap(InsightService, (resolver) => resolver.make(StopAfterOneInsightService))
    cleanup(() => app.container.restore(InsightService))
    const first = await householdWith('activity')
    const second = await householdWith('activity')
    const job = await app.container.make(MonthlyInsightsJob)

    await tickAt(job, FIRST_OF_OCTOBER, stopping.signal)

    assert.lengthOf(await insightsOf(first.household.id), 1)
    assert.lengthOf(await insightsOf(second.household.id), 0)
    assert.lengthOf(await runsOf(second.household.id), 0, 'not even claimed')

    // The next tick (of any container) picks it up.
    await tickAt(job, FIRST_OF_OCTOBER.plus({ minutes: 15 }))
    assert.lengthOf(await insightsOf(second.household.id), 1)
  })

  test('test_a_stop_before_the_model_call_gives_the_claim_back', async ({ assert, cleanup }) => {
    const stopping = new AbortController()
    // The stop request lands right after the claim, before the model call.
    class StopAfterClaimRuns extends SchedulerRuns {
      override async claim(...args: Parameters<SchedulerRuns['claim']>) {
        const claim = await super.claim(...args)
        stopping.abort()
        return claim
      }
    }
    app.container.swap(SchedulerRuns, () => new StopAfterClaimRuns())
    cleanup(() => app.container.restore(SchedulerRuns))
    const { household } = await householdWith('activity')
    const job = await app.container.make(MonthlyInsightsJob)
    const llm = await containerLlm()
    const calls = llm.requests.length

    await tickAt(job, FIRST_OF_OCTOBER, stopping.signal)

    assert.equal(llm.requests.length, calls, 'nothing paid')
    const [released] = await runsOf(household.id)
    assert.include(released, { attempts: 0, outcome: 'released' })

    // No 30-minute wait: the next tick claims it at once, as a first attempt.
    app.container.restore(SchedulerRuns)
    const next = await app.container.make(MonthlyInsightsJob)
    await tickAt(next, FIRST_OF_OCTOBER.plus({ minutes: 15 }))
    assert.lengthOf(await insightsOf(household.id), 1)
    const [run] = await runsOf(household.id)
    assert.include(run, { attempts: 1, outcome: 'generated' })
  })

  test('test_skipped_households_are_recorded_once_per_period', async ({ assert, cleanup }) => {
    capLlmCallsAt(1, cleanup)
    const quiet = await householdWith('transfers-only')
    const spent = await householdWith('activity')
    await spentOneCall(spent.household.id)
    const leaving = await householdWith('activity')
    await leaving.household
      .merge({ status: 'pending_deletion', deletionScheduledAt: DateTime.now().plus({ days: 30 }) })
      .save()
    const job = await app.container.make(MonthlyInsightsJob)

    await tickAt(job, FIRST_OF_OCTOBER)
    await tickAt(job, FIRST_OF_OCTOBER.plus({ hours: 2 }))

    for (const [fixture, outcome] of [
      [quiet, 'skipped:no-activity'],
      [spent, 'skipped:quota-exhausted'],
      [leaving, 'skipped:pending-deletion'],
    ] as const) {
      const runs = await runsOf(fixture.household.id)
      assert.deepEqual(
        runs.map((run) => [run.outcome, run.attempts, run.error]),
        [[outcome, 1, null]]
      )
      assert.lengthOf(await insightsOf(fixture.household.id), 0)
    }
  })
})
