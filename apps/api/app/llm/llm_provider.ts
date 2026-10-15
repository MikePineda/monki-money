import { costMicros } from '#llm/cost'
import { extractJson } from '#llm/json_extract'
import { buildReceiptPrompt } from '#llm/prompts/receipt'
import { buildInsightPrompt } from '#llm/prompts/insight'
import type { LlmSettings } from '#llm/llm_settings'
import { prepareReceiptImage } from '#llm/receipt_image'
import { buildClassifyPrompt } from '#llm/prompts/classify'
import { LlmSchemaError } from '#llm/schemas/schema_error'
import { parseMonthlyInsight } from '#llm/schemas/insight_schema'
import { buildRetryFeedback } from '#llm/prompts/retry_feedback'
import type { LlmPurpose, LlmUsageStatus } from '@monkimoney/shared'
import { parseReceiptExtraction } from '#llm/schemas/receipt_schema'
import { LlmOutputInvalidError, LlmProviderError } from '#llm/errors'
import { noSuggestion, parseClassifyOutput } from '#llm/schemas/classify_schema'
import type {
  CallOptions,
  ClassifyInput,
  ClassifyOutput,
  Completion,
  CompletionRequest,
  InsightInput,
  LlmCallUsage,
  LlmContentBlock,
  LlmMessage,
  LlmResult,
  LlmUsageEntry,
  MonthlyInsight,
  ReceiptExtraction,
  ReceiptInput,
} from '#llm/types'

/** Where every attempt is recorded (`llm_usage`, see usage_recorder.ts). */
export interface LlmUsageSink {
  record(entry: LlmUsageEntry): Promise<void>
}

/** Monthly cap check (EntitlementsService). Throws LlmQuotaExceededError. */
export interface LlmQuotaGuard {
  assertLlmQuota(householdId: number): Promise<void>
}

export interface LlmProviderDependencies {
  settings: LlmSettings
  usage?: LlmUsageSink
  quota?: LlmQuotaGuard
}

interface StructuredCall<T> {
  purpose: LlmPurpose
  model: string
  system: string
  content: LlmContentBlock[]
  parse(raw: unknown): Promise<T>
}

type Outcome<T> = { ok: true; value: T } | { ok: false; issues: string[] }

/** One answer + one retry with the issues attached. */
const MAX_ATTEMPTS = 2

/**
 * The LLM layer's entry point and container token (bound as a singleton in
 * providers/llm_provider.ts; inject it as `LlmProvider`). Subclasses only
 * implement `complete()`: one vendor round trip. Everything else is shared
 * here, so the fake exercises the same pipeline as the real provider:
 *
 * 1. quota check (households only; operator calls pass `householdId: null`);
 * 2. prompt with the schema in the system prompt and untrusted data in
 *    `<data>` (app/llm/prompts);
 * 3. JSON-in-text answer -> `extractJson` -> VineJS schema (app/llm/schemas);
 * 4. one retry with the validation issues, then LlmOutputInvalidError
 *    (classify degrades to "no suggestion" instead);
 * 5. one `llm_usage` row per attempt, with tokens, latency and cost.
 *
 * Vendor failures surface as LlmProviderError after the SDK's own retries.
 */
export abstract class LlmProvider {
  /** Stored in `llm_usage.provider`. */
  abstract readonly name: string

  /** False for the fake: no model is reached. */
  abstract readonly isLive: boolean

  protected readonly settings: LlmSettings
  readonly #usage?: LlmUsageSink
  readonly #quota?: LlmQuotaGuard

  constructor(dependencies: LlmProviderDependencies) {
    this.settings = dependencies.settings
    this.#usage = dependencies.usage
    this.#quota = dependencies.quota
  }

  /** Model used for text purposes (classify, insight). */
  get model() {
    return this.settings.model
  }

  /** Model used for receipts (images). */
  get visionModel() {
    return this.settings.visionModel
  }

  /** One vendor round trip. Throw LlmProviderError on vendor failures. */
  protected abstract complete(request: CompletionRequest): Promise<Completion>

  /**
   * Suggests a category per row, chunked by `classifyBatchSize` (one call per
   * chunk). A chunk whose answer stays invalid after the retry degrades to
   * "no suggestion" for its rows and flags the result as `degraded`.
   */
  async classifyTransactions(
    input: ClassifyInput,
    options: CallOptions
  ): Promise<LlmResult<ClassifyOutput>> {
    const model = this.settings.model
    if (input.rows.length === 0) {
      return { data: { suggestions: [] }, usage: emptyUsage(model), degraded: false }
    }
    await this.#assertQuota(options)

    const allowedSlugs = input.categories.map((category) => category.slug)
    const suggestions: ClassifyOutput['suggestions'] = []
    let usage = emptyUsage(model)
    let degraded = false

    for (const rows of chunks(input.rows, this.settings.classifyBatchSize)) {
      const prompt = buildClassifyPrompt({ rows, categories: input.categories })
      const rowIds = rows.map((row) => row.id)
      try {
        const result = await this.#structuredCall(
          {
            purpose: 'classify',
            model,
            system: prompt.system,
            content: [{ type: 'text', text: prompt.user }],
            parse: (raw) => parseClassifyOutput(raw, { rowIds, allowedSlugs }),
          },
          options
        )
        suggestions.push(...result.data.suggestions)
        usage = addUsage(usage, result.usage)
      } catch (error) {
        if (!(error instanceof LlmOutputInvalidError)) throw error
        degraded = true
        usage = addUsage(usage, error.usage)
        suggestions.push(...rowIds.map(noSuggestion))
      }
    }

    return { data: { suggestions }, usage, degraded }
  }

  /**
   * Reads a receipt photo (downscaled to <= 1600 px and re-encoded in memory,
   * never persisted). Invalid answers after the retry throw
   * LlmOutputInvalidError (422); a bad image throws FieldError('image').
   */
  async extractReceipt(
    input: ReceiptInput,
    options: CallOptions
  ): Promise<LlmResult<ReceiptExtraction>> {
    const image = await prepareReceiptImage(input.image)
    await this.#assertQuota(options)

    const allowedSlugs = input.categories.map((category) => category.slug)
    const prompt = buildReceiptPrompt({
      categories: input.categories,
      currencyCode: input.currencyCode,
    })
    const result = await this.#structuredCall(
      {
        purpose: 'receipt',
        model: this.settings.visionModel,
        system: prompt.system,
        content: [
          { type: 'image', mediaType: image.mediaType, base64: image.base64 },
          { type: 'text', text: prompt.user },
        ],
        parse: (raw) => parseReceiptExtraction(raw, { allowedSlugs }),
      },
      options
    )
    return { ...result, degraded: false }
  }

  /** Writes the month's summary in `options.locale` (default en). */
  async monthlyInsight(
    input: InsightInput,
    options: CallOptions
  ): Promise<LlmResult<MonthlyInsight>> {
    await this.#assertQuota(options)

    const prompt = buildInsightPrompt(input, options.locale ?? 'en')
    const result = await this.#structuredCall(
      {
        purpose: 'insight',
        model: this.settings.model,
        system: prompt.system,
        content: [{ type: 'text', text: prompt.user }],
        parse: parseMonthlyInsight,
      },
      options
    )
    return { ...result, degraded: false }
  }

  async #assertQuota(options: CallOptions) {
    if (options.householdId !== null && this.#quota) {
      await this.#quota.assertLlmQuota(options.householdId)
    }
  }

  async #structuredCall<T>(
    call: StructuredCall<T>,
    options: CallOptions
  ): Promise<{ data: T; usage: LlmCallUsage }> {
    const messages: LlmMessage[] = [{ role: 'user', content: call.content }]
    let usage = emptyUsage(call.model)
    let issues: string[] = []

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = performance.now()
      let completion: Completion
      try {
        completion = await this.complete({
          purpose: call.purpose,
          locale: options.locale ?? 'en',
          model: call.model,
          maxTokens: this.settings.maxTokens[call.purpose],
          system: call.system,
          messages,
        })
      } catch (error) {
        const failure =
          error instanceof LlmProviderError
            ? error
            : new LlmProviderError(messageOf(error), undefined, { cause: error })
        await this.#record(call, options, {
          model: call.model,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: elapsedSince(startedAt),
          status: 'error',
          errorMessage: failure.message,
        })
        throw failure
      }

      const attemptUsage: LlmCallUsage = {
        model: completion.model || call.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        latencyMs: elapsedSince(startedAt),
        attempts: 1,
        costMicros: costMicros(
          this.settings.pricing,
          completion.model || call.model,
          completion.inputTokens,
          completion.outputTokens
        ),
      }
      usage = addUsage(usage, attemptUsage)

      const outcome = await interpret(completion, call.parse)
      await this.#record(call, options, {
        ...attemptUsage,
        status: outcome.ok ? 'ok' : 'invalid_output',
        errorMessage: outcome.ok ? null : outcome.issues.join('; '),
      })
      if (outcome.ok) return { data: outcome.value, usage }

      issues = outcome.issues
      messages.push(
        {
          role: 'assistant',
          content: [{ type: 'text', text: completion.text.trim() || '(empty)' }],
        },
        { role: 'user', content: [{ type: 'text', text: buildRetryFeedback(issues) }] }
      )
    }

    throw new LlmOutputInvalidError(issues, usage)
  }

  async #record(
    call: StructuredCall<unknown>,
    options: CallOptions,
    attempt: Pick<
      LlmUsageEntry,
      'model' | 'inputTokens' | 'outputTokens' | 'latencyMs' | 'errorMessage'
    > & { status: LlmUsageStatus; costMicros?: number }
  ) {
    await this.#usage?.record({
      householdId: options.householdId,
      userId: options.userId,
      purpose: call.purpose,
      provider: this.name,
      model: attempt.model,
      inputTokens: attempt.inputTokens,
      outputTokens: attempt.outputTokens,
      latencyMs: attempt.latencyMs,
      status: attempt.status,
      errorMessage: attempt.errorMessage?.slice(0, 500) ?? null,
      costMicros: attempt.costMicros ?? 0,
    })
  }
}

async function interpret<T>(
  completion: Completion,
  parse: (raw: unknown) => Promise<T>
): Promise<Outcome<T>> {
  if (completion.stopReason === 'refusal') {
    return { ok: false, issues: ['The model declined to answer'] }
  }

  const extracted = extractJson(completion.text)
  if (!extracted.ok) {
    const issues = [extracted.reason]
    if (completion.stopReason === 'max_tokens') {
      issues.push('The answer was cut off by the token limit: answer with less text')
    }
    return { ok: false, issues }
  }

  try {
    return { ok: true, value: await parse(extracted.value) }
  } catch (error) {
    if (error instanceof LlmSchemaError) return { ok: false, issues: error.issues }
    throw error
  }
}

function emptyUsage(model: string): LlmCallUsage {
  return { model, inputTokens: 0, outputTokens: 0, latencyMs: 0, attempts: 0, costMicros: 0 }
}

function addUsage(total: LlmCallUsage, more: LlmCallUsage): LlmCallUsage {
  return {
    model: more.attempts > 0 ? more.model : total.model,
    inputTokens: total.inputTokens + more.inputTokens,
    outputTokens: total.outputTokens + more.outputTokens,
    latencyMs: total.latencyMs + more.latencyMs,
    attempts: total.attempts + more.attempts,
    costMicros: total.costMicros + more.costMicros,
  }
}

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  const step = Math.max(1, size)
  for (let index = 0; index < items.length; index += step) {
    yield items.slice(index, index + step)
  }
}

function elapsedSince(startedAt: number) {
  return Math.round(performance.now() - startedAt)
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
