import { test } from '@japa/runner'
import type { ClassifyInput } from '#llm/types'
import { LlmProviderError } from '#llm/errors'
import { FakeLlmProvider } from '#llm/providers/fake_llm_provider'
import {
  TAXONOMY_CATEGORIES,
  fakeLlm,
  fakeLlmSettings,
  memoryUsageSink,
  receiptPhoto,
} from '#tests/helpers/llm'

const operator = { householdId: null, userId: null }

const input: ClassifyInput = {
  rows: [
    { id: 'a', date: '2026-09-01', amountCents: -4520, description: 'WOOLWORTHS 4412 BRISBANE' },
    { id: 'b', date: '2026-09-02', amountCents: -360, description: 'TRANSLINK FARE' },
    { id: 'c', date: '2026-09-03', amountCents: -999, description: 'SOMETHING UNKNOWN' },
  ],
  categories: TAXONOMY_CATEGORIES,
}

test.group('LLM fake provider', () => {
  test('test_fake_classify_is_deterministic', async ({ assert }) => {
    const fake = await fakeLlm()

    const first = await fake.classifyTransactions(input, operator)
    const second = await fake.classifyTransactions(input, operator)

    assert.deepEqual(first, second)
    assert.isFalse(first.degraded)
    assert.deepEqual(first.data.suggestions, [
      { id: 'a', categorySlug: 'groceries', confidence: 0.94, payee: 'Woolworths' },
      { id: 'b', categorySlug: 'public-transport', confidence: 0.97, payee: 'Translink' },
      { id: 'c', categorySlug: null, confidence: 0, payee: null },
    ])
    assert.equal(first.usage.model, 'fake')
    assert.equal(first.usage.attempts, 1)
    assert.isAbove(first.usage.inputTokens, 0)
  })

  test('test_fake_classify_never_returns_a_slug_the_household_lacks', async ({ assert }) => {
    const fake = await fakeLlm()
    const result = await fake.classifyTransactions(
      { ...input, categories: [{ slug: 'rent', name: 'Rent' }] },
      operator
    )
    assert.isTrue(result.data.suggestions.every((s) => s.categorySlug === null))
  })

  test('test_fake_receipt_returns_the_fixture_in_cents', async ({ assert }) => {
    const fake = await fakeLlm()
    const result = await fake.extractReceipt(
      { image: await receiptPhoto(), categories: TAXONOMY_CATEGORIES, currencyCode: 'AUD' },
      operator
    )

    assert.equal(result.data.merchant, 'Corner Grocer')
    assert.equal(result.data.totalCents, 2345)
    assert.equal(result.data.categorySlug, 'groceries')
    assert.deepEqual(
      result.data.items.map((item) => item.amountCents),
      [390, 1655, 300]
    )
    // The image reached the provider re-encoded as JPEG, before the text.
    const [image, text] = fake.requests[0].messages[0].content
    assert.equal(image.type, 'image')
    assert.equal(image.type === 'image' && image.mediaType, 'image/jpeg')
    assert.equal(text.type, 'text')
  })

  test('test_fake_insight_answers_in_the_requested_locale', async ({ assert }) => {
    const fake = await fakeLlm()
    const insight = {
      month: '2026-09',
      currencyCode: 'AUD',
      totals: { incomeCents: 600000, expenseCents: 380000, netCents: 220000 },
      byCategory: [],
    }

    const en = await fake.monthlyInsight(insight, { ...operator, locale: 'en' })
    const es = await fake.monthlyInsight(insight, { ...operator, locale: 'es' })

    assert.match(en.data.headline, /income/)
    assert.match(es.data.headline, /ingresos/)
    assert.lengthOf(es.data.highlights, 3)
  })

  test('test_fake_without_fixtures_never_invents_data', async ({ assert }) => {
    const usage = memoryUsageSink()
    const fake = new FakeLlmProvider({ settings: fakeLlmSettings(), usage }, null)

    const classified = await fake.classifyTransactions(input, operator)
    assert.isTrue(classified.data.suggestions.every((s) => s.categorySlug === null))

    await assert.rejects(
      async () => fake.extractReceipt({ image: await receiptPhoto(), categories: [] }, operator),
      LlmProviderError
    )
    assert.equal(usage.entries.at(-1)?.status, 'error')
  })
})
