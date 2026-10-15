import { test } from '@japa/runner'
import { LlmSchemaError } from '#llm/schemas/schema_error'
import { parseMonthlyInsight } from '#llm/schemas/insight_schema'
import { parseClassifyOutput } from '#llm/schemas/classify_schema'
import { parseReceiptExtraction } from '#llm/schemas/receipt_schema'

const allowedSlugs = ['groceries', 'rent', 'salary']

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected a rejection')
}

test.group('LLM schemas: classify', () => {
  test('test_classify_keeps_known_slugs_and_nulls_unknown_ones', async ({ assert }) => {
    const output = await parseClassifyOutput(
      {
        results: [
          { id: 'r1', categorySlug: 'groceries', confidence: 0.9, payee: ' Woolworths ' },
          { id: 'r2', categorySlug: 'transfer-to-attacker', confidence: 0.99, payee: null },
        ],
      },
      { rowIds: ['r1', 'r2'], allowedSlugs }
    )

    assert.deepEqual(output.suggestions, [
      { id: 'r1', categorySlug: 'groceries', confidence: 0.9, payee: 'Woolworths' },
      { id: 'r2', categorySlug: null, confidence: 0, payee: null },
    ])
  })

  test('test_classify_returns_one_suggestion_per_input_row_in_input_order', async ({ assert }) => {
    const output = await parseClassifyOutput(
      {
        results: [
          { id: 'r3', categorySlug: 'rent', confidence: 0.8 },
          { id: 'ghost', categorySlug: 'rent', confidence: 0.8 },
          { id: 'r1', categorySlug: 'salary', confidence: 0.7 },
          { id: 'r1', categorySlug: 'rent', confidence: 0.6 },
        ],
      },
      { rowIds: ['r1', 'r2', 'r3'], allowedSlugs }
    )

    assert.deepEqual(output.suggestions, [
      { id: 'r1', categorySlug: 'salary', confidence: 0.7, payee: null },
      { id: 'r2', categorySlug: null, confidence: 0, payee: null },
      { id: 'r3', categorySlug: 'rent', confidence: 0.8, payee: null },
    ])
  })

  test('test_classify_accepts_a_bare_array_of_results', async ({ assert }) => {
    const output = await parseClassifyOutput([{ id: 'r1', categorySlug: 'rent', confidence: 1 }], {
      rowIds: ['r1'],
      allowedSlugs,
    })
    assert.equal(output.suggestions[0].categorySlug, 'rent')
  })

  test('test_classify_rejects_bad_shapes', async ({ assert }) => {
    const badShapes: unknown[] = [
      null,
      'groceries',
      { results: 'groceries' },
      { results: [{ categorySlug: 'rent', confidence: 0.5 }] },
      { results: [{ id: 'r1', categorySlug: 'rent', confidence: 1.5 }] },
      { results: [{ id: 'r1', categorySlug: 'rent', confidence: 'high' }] },
      { results: [{ id: 'r1', categorySlug: 42, confidence: 0.5 }] },
    ]

    for (const raw of badShapes) {
      const error = await rejection(parseClassifyOutput(raw, { rowIds: ['r1'], allowedSlugs }))
      assert.instanceOf(error, LlmSchemaError, JSON.stringify(raw))
      assert.isAbove((error as LlmSchemaError).issues.length, 0)
    }
  })
})

test.group('LLM schemas: receipt', () => {
  const valid = {
    merchant: 'Corner Grocer',
    date: '2026-09-14',
    total: 23.45,
    currencyCode: 'aud',
    categorySlug: 'groceries',
    items: [
      { description: 'Bananas 1kg', amount: 3.9, quantity: 1 },
      { description: 'Coffee beans', amount: 19.55, quantity: null },
    ],
    confidence: 0.9,
  }

  test('test_receipt_amounts_become_integer_cents', async ({ assert }) => {
    const receipt = await parseReceiptExtraction(valid, { allowedSlugs })

    assert.deepEqual(receipt, {
      merchant: 'Corner Grocer',
      date: '2026-09-14',
      totalCents: 2345,
      currencyCode: 'AUD',
      categorySlug: 'groceries',
      items: [
        { description: 'Bananas 1kg', amountCents: 390, quantity: 1 },
        { description: 'Coffee beans', amountCents: 1955, quantity: null },
      ],
      confidence: 0.9,
    })
  })

  test('test_receipt_unreadable_fields_become_null', async ({ assert }) => {
    const receipt = await parseReceiptExtraction(
      {
        ...valid,
        date: '2026-02-30',
        currencyCode: 'dollars',
        categorySlug: 'casino',
        merchant: ' ',
      },
      { allowedSlugs }
    )

    assert.isNull(receipt.date)
    assert.isNull(receipt.currencyCode)
    assert.isNull(receipt.categorySlug)
    assert.isNull(receipt.merchant)
  })

  test('test_receipt_missing_optional_fields_default_to_null_or_empty', async ({ assert }) => {
    const receipt = await parseReceiptExtraction({ total: 10, confidence: 0.4 }, { allowedSlugs })

    assert.deepEqual(receipt, {
      merchant: null,
      date: null,
      totalCents: 1000,
      currencyCode: null,
      categorySlug: null,
      items: [],
      confidence: 0.4,
    })
  })

  test('test_receipt_rejects_bad_shapes', async ({ assert }) => {
    for (const raw of [
      [],
      { ...valid, total: 'twenty' },
      { ...valid, items: 'bananas' },
      { ...valid, items: [{ amount: 1 }] },
      { ...valid, confidence: -1 },
    ]) {
      const error = await rejection(parseReceiptExtraction(raw, { allowedSlugs }))
      assert.instanceOf(error, LlmSchemaError, JSON.stringify(raw))
    }
  })
})

test.group('LLM schemas: insight', () => {
  const valid = {
    headline: 'Spending dipped 8% in September',
    body: 'You spent **less on dining out** than in August.',
    highlights: [
      { tone: 'positive', text: 'Restaurants down 30%' },
      { tone: 'warning', text: 'Groceries up 12%' },
    ],
  }

  test('test_insight_accepts_a_valid_answer', async ({ assert }) => {
    assert.deepEqual(await parseMonthlyInsight(valid), valid)
  })

  test('test_insight_rejects_bad_shapes', async ({ assert }) => {
    for (const raw of [
      { ...valid, headline: '' },
      { ...valid, headline: 'x'.repeat(200) },
      { ...valid, body: undefined },
      { ...valid, highlights: [{ tone: 'ecstatic', text: 'Wow' }] },
      { ...valid, highlights: Array.from({ length: 10 }, () => valid.highlights[0]) },
    ]) {
      const error = await rejection(parseMonthlyInsight(raw))
      assert.instanceOf(error, LlmSchemaError, JSON.stringify(raw))
    }
  })
})
