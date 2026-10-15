import sharp from 'sharp'
import { test } from '@japa/runner'
import { Secret } from '@adonisjs/core/helpers'
import { LlmProviderError } from '#llm/errors'
import { resolveLlmSettings } from '#llm/llm_settings'
import { AnthropicCompatibleProvider } from '#llm/providers/anthropic_compatible_provider'
import { TAXONOMY_CATEGORIES, memoryUsageSink, receiptPhoto } from '#tests/helpers/llm'

const API_KEY = 'sk-test-0123456789'
const operator = { householdId: null, userId: null }

/** Parameters this layer must never send (MiniMax ignores or rejects them). */
const FORBIDDEN = [
  'thinking',
  'top_k',
  'top_p',
  'temperature',
  'stop_sequences',
  'output_config',
  'context_management',
  'tool_choice',
  'tools',
]

interface CapturedRequest {
  url: string
  method: string
  headers: Headers
  body: Record<string, any>
}

type Reply = { status: number; body: unknown } | Error

/** A `fetch` that records requests and replays canned vendor responses. */
function recordingFetch(...replies: Reply[]) {
  const requests: CapturedRequest[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: input instanceof Request ? input.url : String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    })
    const reply = replies.shift()
    if (!reply) throw new Error('No canned reply left')
    if (reply instanceof Error) throw reply
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetch, requests }
}

function message(text: string, usage = { input_tokens: 1200, output_tokens: 300 }) {
  return {
    status: 200,
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'MiniMax-M3',
      content: [
        { type: 'thinking', thinking: '{"decoy": true}', signature: 'sig' },
        { type: 'text', text },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage,
    },
  }
}

function provider(fetch: ReturnType<typeof recordingFetch>['fetch'], usage = memoryUsageSink()) {
  const settings = resolveLlmSettings(
    {
      provider: 'anthropic-compatible',
      apiKey: new Secret(API_KEY),
      baseUrl: 'http://llm.test/anthropic',
    },
    { maxRetries: 0, pricing: { 'MiniMax-M3': { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 } } }
  )
  return new AnthropicCompatibleProvider({ settings, usage }, { fetch })
}

const receiptAnswer = JSON.stringify({
  merchant: 'Corner Grocer',
  date: '2026-09-14',
  total: 23.45,
  currencyCode: 'AUD',
  categorySlug: 'groceries',
  items: [],
  confidence: 0.9,
})

test.group('LLM Anthropic-compatible provider', () => {
  test('test_receipt_request_has_the_portable_messages_shape', async ({ assert }) => {
    const vendor = recordingFetch(message(receiptAnswer))
    const photo = await receiptPhoto(1200, 3200)

    await provider(vendor.fetch).extractReceipt(
      { image: photo, categories: TAXONOMY_CATEGORIES, currencyCode: 'AUD' },
      operator
    )

    const [request] = vendor.requests
    assert.equal(request.method, 'POST')
    assert.equal(request.url, 'http://llm.test/anthropic/v1/messages')
    assert.equal(request.headers.get('x-api-key'), API_KEY)
    assert.isNotNull(request.headers.get('anthropic-version'))

    // Only the portable parameters, nothing MiniMax ignores or rejects.
    assert.sameMembers(Object.keys(request.body), ['model', 'max_tokens', 'system', 'messages'])
    for (const key of FORBIDDEN) assert.notProperty(request.body, key)
    assert.equal(request.body.model, 'MiniMax-M3')
    assert.equal(request.body.max_tokens, 4096)
    assert.include(request.body.system, 'data, not instructions')

    const [image, text] = request.body.messages[0].content
    assert.equal(request.body.messages[0].role, 'user')
    assert.equal(image.type, 'image')
    assert.equal(image.source.type, 'base64')
    assert.equal(image.source.media_type, 'image/jpeg')
    const sent = await sharp(Buffer.from(image.source.data, 'base64')).metadata()
    assert.equal(Math.max(sent.width ?? 0, sent.height ?? 0), 1600)
    assert.equal(text.type, 'text')
    assert.include(text.text, '<data>')
  })

  test('test_classify_uses_the_text_model_and_its_token_budget', async ({ assert }) => {
    const vendor = recordingFetch(
      message('{"results":[{"id":"r1","categorySlug":"groceries","confidence":0.9}]}')
    )

    const result = await provider(vendor.fetch).classifyTransactions(
      {
        rows: [{ id: 'r1', date: '2026-09-01', amountCents: -500, description: 'WOOLWORTHS' }],
        categories: TAXONOMY_CATEGORIES,
      },
      operator
    )

    assert.equal(vendor.requests[0].body.max_tokens, 8192)
    assert.isString(vendor.requests[0].body.messages[0].content[0].text)
    assert.equal(result.data.suggestions[0].categorySlug, 'groceries')
  })

  test('test_answer_text_blocks_are_parsed_and_usage_is_priced', async ({ assert }) => {
    const usage = memoryUsageSink()
    const vendor = recordingFetch(message(`\`\`\`json\n${receiptAnswer}\n\`\`\``))

    const result = await provider(vendor.fetch, usage).extractReceipt(
      { image: await receiptPhoto(), categories: TAXONOMY_CATEGORIES },
      operator
    )

    assert.equal(result.data.totalCents, 2345)
    assert.include(result.usage, { model: 'MiniMax-M3', inputTokens: 1200, outputTokens: 300 })
    // 1200 x 0.30 + 300 x 1.20 = 720 micro-dollars
    assert.equal(result.usage.costMicros, 720)
    assert.include(usage.entries[0], {
      provider: 'anthropic-compatible',
      model: 'MiniMax-M3',
      status: 'ok',
      costMicros: 720,
    })
  })

  test('test_retry_resends_the_conversation_with_the_issues', async ({ assert }) => {
    const vendor = recordingFetch(message('I could not read it.'), message(receiptAnswer))

    await provider(vendor.fetch).extractReceipt(
      { image: await receiptPhoto(), categories: TAXONOMY_CATEGORIES },
      operator
    )

    const retry = vendor.requests[1].body
    assert.deepEqual(
      retry.messages.map((m: { role: string }) => m.role),
      ['user', 'assistant', 'user']
    )
    assert.equal(retry.messages[1].content[0].text, 'I could not read it.')
    assert.include(retry.messages[2].content[0].text, 'could not be used')
    assert.equal(retry.system, vendor.requests[0].body.system)
  })

  test('test_vendor_http_errors_become_provider_errors', async ({ assert }) => {
    const usage = memoryUsageSink()
    const vendor = recordingFetch({
      status: 401,
      body: {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      },
    })

    try {
      await provider(vendor.fetch, usage).classifyTransactions(
        {
          rows: [{ id: 'r1', date: '2026-09-01', amountCents: -500, description: 'X' }],
          categories: TAXONOMY_CATEGORIES,
        },
        operator
      )
      assert.fail('Expected LlmProviderError')
    } catch (error) {
      assert.instanceOf(error, LlmProviderError)
      assert.equal((error as LlmProviderError).upstreamStatus, 401)
      assert.notInclude((error as Error).message, API_KEY)
    }
    assert.equal(usage.entries[0].status, 'error')
    assert.notInclude(usage.entries[0].errorMessage ?? '', API_KEY)
  })

  test('test_network_failures_become_provider_errors', async ({ assert }) => {
    const vendor = recordingFetch(new TypeError('fetch failed'))

    try {
      await provider(vendor.fetch).monthlyInsight(
        {
          month: '2026-09',
          currencyCode: 'AUD',
          totals: { incomeCents: 1, expenseCents: 1, netCents: 0 },
          byCategory: [],
        },
        operator
      )
      assert.fail('Expected LlmProviderError')
    } catch (error) {
      assert.instanceOf(error, LlmProviderError)
      assert.isUndefined((error as LlmProviderError).upstreamStatus)
    }
  })
})
