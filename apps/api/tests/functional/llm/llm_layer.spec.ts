import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import LlmUsage from '#models/llm_usage'
import { Secret } from '@adonisjs/core/helpers'
import app from '@adonisjs/core/services/app'
import { LlmProvider } from '#llm/llm_provider'
import type { ClassifyInput } from '#llm/types'
import { createLlmProvider } from '#llm/create_llm_provider'
import { createHousehold } from '#tests/helpers/household'
import { TAXONOMY_CATEGORIES } from '#tests/helpers/llm'
import LlmUsageRecorder from '#llm/usage_recorder'
import { resolveLlmSettings } from '#llm/llm_settings'
import type { Logger } from '@adonisjs/core/logger'
import HttpExceptionHandler from '#exceptions/handler'
import i18nManager from '@adonisjs/i18n/services/main'
import testUtils from '@adonisjs/core/services/test_utils'
import { FakeLlmProvider } from '#llm/providers/fake_llm_provider'
import { LlmOutputInvalidError, LlmQuotaExceededError } from '#llm/errors'
import EntitlementsService from '#services/entitlements/entitlements_service'

const emptyUsage = {
  model: 'fake',
  inputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
  attempts: 0,
  costMicros: 0,
}

const input: ClassifyInput = {
  rows: [
    { id: '11', date: '2026-09-01', amountCents: -4520, description: 'WOOLWORTHS 4412' },
    { id: '12', date: '2026-09-02', amountCents: 350000, description: 'ACME PAYROLL' },
  ],
  categories: TAXONOMY_CATEGORIES,
}

/** `count` usage rows for a household, all created at `at`. */
async function usageRows(
  householdId: number,
  count: number,
  at: DateTime,
  status: LlmUsage['status'] = 'ok'
) {
  await LlmUsage.createMany(
    Array.from({ length: count }, () => ({
      householdId,
      purpose: 'classify' as const,
      provider: 'fake',
      model: 'fake',
      status,
      createdAt: at,
    }))
  )
}

async function fakeFromContainer() {
  const llm = await app.container.make(LlmProvider)
  if (!(llm instanceof FakeLlmProvider)) throw new Error('Tests run with LLM_PROVIDER=fake')
  return llm
}

test.group('LLM layer', () => {
  test('test_classify_records_usage_row', async ({ assert }) => {
    const { household, owner } = await createHousehold()
    const llm = await app.container.make(LlmProvider)

    const result = await llm.classifyTransactions(input, {
      householdId: household.id,
      userId: owner.id,
    })

    assert.deepEqual(
      result.data.suggestions.map((s) => s.categorySlug),
      ['groceries', 'salary']
    )
    const rows = await LlmUsage.query().where('household_id', household.id)
    assert.lengthOf(rows, 1)
    assert.include(rows[0].serialize(), {
      userId: owner.id,
      purpose: 'classify',
      provider: 'fake',
      model: 'fake',
      status: 'ok',
      errorMessage: null,
      costMicros: 0,
    })
    assert.equal(rows[0].inputTokens, result.usage.inputTokens)
    assert.equal(rows[0].outputTokens, result.usage.outputTokens)
  })

  test('test_quota_blocks_calls_when_exceeded', async ({ assert }) => {
    const { household, owner } = await createHousehold()
    const cap = 200 // free plan (config/plans.ts)
    await usageRows(household.id, cap, DateTime.now())
    const llm = await fakeFromContainer()
    const requestsBefore = llm.requests.length

    await assert.rejects(
      () => llm.classifyTransactions(input, { householdId: household.id, userId: owner.id }),
      LlmQuotaExceededError
    )

    assert.equal(llm.requests.length, requestsBefore, 'no provider call once over quota')
    const total = await LlmUsage.query().where('household_id', household.id).count('* as total')
    assert.equal(Number(total[0].$extras.total), cap, 'a blocked call records nothing')
  })

  test('test_quota_counts_only_this_household_month_and_answered_calls', async ({ assert }) => {
    const { household } = await createHousehold()
    const other = await createHousehold()
    const entitlements = await app.container.make(EntitlementsService)

    // Households live in Australia/Brisbane (UTC+10): this instant is
    // 2026-10-01 01:00 there, 2026-09-30 15:00 UTC.
    const now = DateTime.fromISO('2026-09-30T15:00:00Z')
    await usageRows(household.id, 2, DateTime.fromISO('2026-09-30T14:30:00Z')) // Oct 1st local
    await usageRows(household.id, 3, DateTime.fromISO('2026-09-30T13:00:00Z')) // Sep 30th local
    await usageRows(household.id, 4, DateTime.fromISO('2026-09-30T14:45:00Z'), 'error')
    await usageRows(household.id, 1, DateTime.fromISO('2026-09-30T14:50:00Z'), 'invalid_output')
    await usageRows(other.household.id, 5, DateTime.fromISO('2026-09-30T14:30:00Z'))

    assert.equal(await entitlements.llmCallsThisMonth(household, now), 3)
  })

  test('test_monthly_cap_override_replaces_the_plan_limit', async ({ assert, cleanup }) => {
    const previous = app.config.get('llm.monthlyCapOverride')
    app.config.set('llm.monthlyCapOverride', 1)
    cleanup(() => app.config.set('llm.monthlyCapOverride', previous))

    const { household, owner } = await createHousehold()
    const entitlements = await app.container.make(EntitlementsService)
    assert.equal(await entitlements.llmMonthlyCap(household), 1)

    const llm = await app.container.make(LlmProvider)
    const options = { householdId: household.id, userId: owner.id }
    await llm.classifyTransactions(input, options)
    await assert.rejects(() => llm.classifyTransactions(input, options), LlmQuotaExceededError)
  })

  test('test_invalid_output_retries_once_then_degrades', async ({ assert }) => {
    const { household, owner } = await createHousehold()
    const llm = await fakeFromContainer()
    llm.script('Here you go!', '{"results": [{"id": 11}]}')

    const result = await llm.classifyTransactions(input, {
      householdId: household.id,
      userId: owner.id,
    })

    assert.isTrue(result.degraded)
    assert.isTrue(result.data.suggestions.every((s) => s.categorySlug === null))
    const rows = await LlmUsage.query().where('household_id', household.id).orderBy('id')
    assert.deepEqual(
      rows.map((row) => row.status),
      ['invalid_output', 'invalid_output']
    )
    assert.include(rows[0].errorMessage ?? '', 'valid JSON')
    assert.include(rows[1].errorMessage ?? '', 'results.0')
  })

  test('test_operator_calls_are_recorded_without_household', async ({ assert }) => {
    const llm = await app.container.make(LlmProvider)
    const before = await LlmUsage.query().whereNull('household_id').count('* as total')

    await llm.classifyTransactions(input, { householdId: null, userId: null })

    const after = await LlmUsage.query().whereNull('household_id').count('* as total')
    assert.equal(Number(after[0].$extras.total), Number(before[0].$extras.total) + 1)
  })

  test('test_usage_recording_failure_is_logged_not_thrown', async ({ assert }) => {
    const logged: string[] = []
    const logger = { error: (_context: unknown, message: string) => logged.push(message) }
    const recorder = new LlmUsageRecorder(logger as unknown as Logger)

    // An enum value the database rejects.
    await recorder.record({
      householdId: null,
      userId: null,
      purpose: 'nonsense' as never,
      provider: 'fake',
      model: 'fake',
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      status: 'ok',
      errorMessage: null,
      costMicros: 0,
    })
    assert.deepEqual(logged, ['could not record LLM usage'])
  })

  test('test_llm_errors_render_localized_json', async ({ assert }) => {
    const cases = [
      [new LlmQuotaExceededError(), 402, 'E_LLM_QUOTA_EXCEEDED'],
      [new LlmOutputInvalidError(['x'], emptyUsage), 422, 'E_LLM_OUTPUT_INVALID'],
    ] as const

    for (const [error, status, code] of cases) {
      const ctx = await testUtils.createHttpContext()
      ctx.i18n = i18nManager.locale('es')
      ctx.request.request.headers.accept = 'application/json'
      await new HttpExceptionHandler().handle(error, ctx)

      assert.equal(ctx.response.getStatus(), status)
      assert.deepEqual(ctx.response.getBody(), {
        code,
        message: i18nManager.locale('es').t(`errors.${code}`),
      })
      assert.notEqual(ctx.response.getBody().message, `errors.${code}`)
    }
  })

  test('test_app_boots_without_llm_key', async ({ assert, client }) => {
    // The test env has LLM_API_KEY empty: the container serves the fake.
    const llm = await app.container.make(LlmProvider)
    assert.instanceOf(llm, FakeLlmProvider)
    assert.isFalse(llm.isLive)

    // A real provider name without a key also falls back to the fake.
    const settings = resolveLlmSettings({
      provider: 'anthropic-compatible',
      apiKey: new Secret(''),
    })
    const fallback = await createLlmProvider(settings, {}, app.makePath('tests/fixtures/llm'))
    assert.instanceOf(fallback, FakeLlmProvider)

    const response = await client.get('/api/health')
    response.assertStatus(200)
  })

  test('test_a_configured_key_selects_the_anthropic_compatible_provider', async ({ assert }) => {
    const settings = resolveLlmSettings({
      provider: 'anthropic-compatible',
      apiKey: new Secret('sk-test'),
    })
    const llm = await createLlmProvider(settings, {}, app.makePath('tests/fixtures/llm'))
    assert.equal(llm.name, 'anthropic-compatible')
    assert.isTrue(llm.isLive)
    assert.equal(llm.model, 'MiniMax-M3')
  })
})
