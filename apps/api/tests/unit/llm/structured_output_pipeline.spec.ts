import { test } from '@japa/runner'
import type { ClassifyInput } from '#llm/types'
import { LlmOutputInvalidError, LlmProviderError, LlmQuotaExceededError } from '#llm/errors'
import {
  TAXONOMY_CATEGORIES,
  fakeLlm,
  fakeLlmSettings,
  memoryUsageSink,
  receiptPhoto,
} from '#tests/helpers/llm'

const operator = { householdId: null, userId: null }

function rows(count: number): ClassifyInput {
  return {
    rows: Array.from({ length: count }, (_, index) => ({
      id: `r${index + 1}`,
      date: '2026-09-01',
      amountCents: -1000,
      description: index % 2 === 0 ? 'WOOLWORTHS METRO' : 'NETFLIX.COM',
    })),
    categories: TAXONOMY_CATEGORIES,
  }
}

const validReceipt = JSON.stringify({ merchant: 'Shop', total: 1, confidence: 0.5 })

test.group('LLM structured output pipeline', () => {
  test('test_invalid_answer_is_retried_once_with_the_issues', async ({ assert }) => {
    const usage = memoryUsageSink()
    const fake = await fakeLlm({ usage })
    fake.script('Sorry, I cannot help with that.', validReceipt)

    const result = await fake.extractReceipt(
      { image: await receiptPhoto(), categories: TAXONOMY_CATEGORIES },
      operator
    )

    assert.equal(result.data.merchant, 'Shop')
    assert.equal(result.usage.attempts, 2)
    assert.deepEqual(
      usage.entries.map((entry) => entry.status),
      ['invalid_output', 'ok']
    )

    // The retry carries the previous answer and the issues, never a new image.
    const retry = fake.requests[1].messages
    assert.deepEqual(
      retry.map((message) => message.role),
      ['user', 'assistant', 'user']
    )
    const feedback = retry[2].content[0]
    assert.equal(feedback.type, 'text')
    assert.include(feedback.type === 'text' ? feedback.text : '', 'could not be used')
  })

  test('test_receipt_invalid_twice_throws_output_invalid_error', async ({ assert }) => {
    const usage = memoryUsageSink()
    const fake = await fakeLlm({ usage })
    fake.script('{"total": "lots"}', 'still not json')

    try {
      await fake.extractReceipt({ image: await receiptPhoto(), categories: [] }, operator)
      assert.fail('Expected LlmOutputInvalidError')
    } catch (error) {
      assert.instanceOf(error, LlmOutputInvalidError)
      assert.equal((error as LlmOutputInvalidError).usage.attempts, 2)
    }
    assert.lengthOf(fake.requests, 2)
    assert.deepEqual(
      usage.entries.map((entry) => entry.status),
      ['invalid_output', 'invalid_output']
    )
  })

  test('test_classify_invalid_twice_degrades_to_no_suggestion', async ({ assert }) => {
    const fake = await fakeLlm()
    fake.script('nope', '{"results": "nope"}')

    const result = await fake.classifyTransactions(rows(2), operator)

    assert.isTrue(result.degraded)
    assert.deepEqual(
      result.data.suggestions.map((s) => [s.id, s.categorySlug]),
      [
        ['r1', null],
        ['r2', null],
      ]
    )
    assert.equal(result.usage.attempts, 2)
  })

  test('test_classify_is_chunked_by_batch_size', async ({ assert }) => {
    const usage = memoryUsageSink()
    const fake = await fakeLlm({ usage, settings: fakeLlmSettings({ classifyBatchSize: 2 }) })

    const result = await fake.classifyTransactions(rows(5), operator)

    assert.lengthOf(fake.requests, 3)
    assert.lengthOf(usage.entries, 3)
    assert.deepEqual(
      result.data.suggestions.map((s) => s.id),
      ['r1', 'r2', 'r3', 'r4', 'r5']
    )
    assert.deepEqual(
      result.data.suggestions.map((s) => s.categorySlug),
      ['groceries', 'subscriptions-games', 'groceries', 'subscriptions-games', 'groceries']
    )
  })

  test('test_classify_with_no_rows_makes_no_call', async ({ assert }) => {
    const fake = await fakeLlm()
    const result = await fake.classifyTransactions(rows(0), operator)
    assert.deepEqual(result.data.suggestions, [])
    assert.lengthOf(fake.requests, 0)
  })

  test('test_vendor_failure_is_recorded_and_rethrown', async ({ assert }) => {
    const usage = memoryUsageSink()
    const fake = await fakeLlm({ usage })
    fake.script(new LlmProviderError('upstream 529', 529))

    await assert.rejects(() => fake.classifyTransactions(rows(1), operator), LlmProviderError)
    assert.lengthOf(fake.requests, 1, 'vendor failures are not retried by the pipeline')
    assert.equal(usage.entries[0].status, 'error')
    assert.equal(usage.entries[0].errorMessage, 'upstream 529')
  })

  test('test_unexpected_failure_becomes_a_provider_error', async ({ assert }) => {
    const fake = await fakeLlm()
    fake.script(new TypeError('socket hang up'))
    await assert.rejects(() => fake.classifyTransactions(rows(1), operator), LlmProviderError)
  })

  test('test_quota_is_checked_for_households_only', async ({ assert }) => {
    const checked: number[] = []
    const fake = await fakeLlm({
      quota: {
        async assertLlmQuota(householdId) {
          checked.push(householdId)
          throw new LlmQuotaExceededError()
        },
      },
    })

    await fake.classifyTransactions(rows(1), operator)
    await assert.rejects(
      () => fake.classifyTransactions(rows(1), { householdId: 7, userId: 3 }),
      LlmQuotaExceededError
    )
    assert.deepEqual(checked, [7])
    assert.lengthOf(fake.requests, 1, 'a blocked call never reaches the provider')
  })

  test('test_usage_rows_carry_who_what_and_cost', async ({ assert }) => {
    const usage = memoryUsageSink()
    const fake = await fakeLlm({
      usage,
      settings: fakeLlmSettings({
        pricing: { fake: { inputUsdPerMTok: 1_000, outputUsdPerMTok: 1_000 } },
      }),
    })

    const result = await fake.classifyTransactions(rows(1), { householdId: 4, userId: 9 })

    const [entry] = usage.entries
    assert.include(entry, {
      householdId: 4,
      userId: 9,
      purpose: 'classify',
      provider: 'fake',
      model: 'fake',
      status: 'ok',
      errorMessage: null,
    })
    assert.isAbove(entry.costMicros, 0)
    assert.equal(result.usage.costMicros, entry.costMicros)
  })
})
