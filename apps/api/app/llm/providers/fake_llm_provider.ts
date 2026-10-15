import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Locale } from '@monkimoney/shared'
import { LlmProviderError } from '#llm/errors'
import { readDataBlock } from '#llm/prompts/untrusted_data'
import type { Completion, CompletionRequest } from '#llm/types'
import { LlmProvider, type LlmProviderDependencies } from '#llm/llm_provider'

interface ClassifyRule {
  /** Case-insensitive substring of the description or merchant. */
  match: string
  categorySlug: string | null
  confidence: number
  payee?: string | null
}

/** Shapes of tests/fixtures/llm/{classify,receipt,insight}.json. */
export interface FakeLlmFixtures {
  classify: { rules: ClassifyRule[] }
  /** A model answer (decimal amounts), validated like a real one. */
  receipt: Record<string, unknown>
  /** Model answers per locale. */
  insight: Partial<Record<Locale, Record<string, unknown>>>
}

/** A scripted answer: raw model text, or an error thrown by the "vendor". */
export type FakeAnswer = string | Error

/**
 * Deterministic stand-in for a model, selected with LLM_PROVIDER=fake or an
 * empty LLM_API_KEY. It answers in text exactly like a model would, so the
 * shared pipeline (JSON extraction, schema validation, retry, usage rows)
 * runs unchanged:
 *
 * - classify: reads the rows from the request's `<data>` block and applies
 *   the fixture rules (first matching rule wins, otherwise no category);
 * - receipt / insight: returns the fixture answer (insight per locale).
 *
 * Without fixtures (the production image ships no tests/), classify answers
 * "no suggestion" and receipts/insights fail with LlmProviderError: a real
 * user never sees synthetic data. Tests can `script()` raw answers or errors
 * and read `requests`.
 */
export class FakeLlmProvider extends LlmProvider {
  readonly name = 'fake'
  readonly isLive = false

  /** Every request received, in order. */
  readonly requests: CompletionRequest[] = []

  readonly #fixtures: FakeLlmFixtures | null
  #script: FakeAnswer[] = []

  constructor(dependencies: LlmProviderDependencies, fixtures: FakeLlmFixtures | null) {
    super(dependencies)
    this.#fixtures = fixtures
  }

  /** Loads the fixtures from `dir`; missing files mean "no fixtures". */
  static async fromFixtureDir(
    dependencies: LlmProviderDependencies,
    dir: string
  ): Promise<FakeLlmProvider> {
    return new FakeLlmProvider(dependencies, await loadFixtures(dir))
  }

  get hasFixtures() {
    return this.#fixtures !== null
  }

  /** The next round trips answer with these, in order, before the fixtures. */
  script(...answers: FakeAnswer[]): this {
    this.#script.push(...answers)
    return this
  }

  protected async complete(request: CompletionRequest): Promise<Completion> {
    this.requests.push(request)
    const scripted = this.#script.shift()
    if (scripted instanceof Error) throw scripted

    const text = scripted ?? this.#answer(request)
    const prompt = request.system + request.messages.map(textOf).join('\n')
    return {
      text,
      model: request.model,
      inputTokens: estimateTokens(prompt),
      outputTokens: estimateTokens(text),
      stopReason: 'end_turn',
    }
  }

  #answer(request: CompletionRequest): string {
    const fixtures = this.#fixtures
    if (!fixtures) {
      if (request.purpose === 'classify') return JSON.stringify({ results: [] })
      throw new LlmProviderError('No LLM is configured (LLM_API_KEY is empty)')
    }

    switch (request.purpose) {
      case 'classify':
        return JSON.stringify({ results: classifyByRules(request, fixtures.classify.rules) })
      case 'receipt':
        return JSON.stringify(fixtures.receipt)
      case 'insight':
        return JSON.stringify(fixtures.insight[request.locale] ?? fixtures.insight.en)
    }
  }
}

function classifyByRules(request: CompletionRequest, rules: ClassifyRule[]) {
  const data = readDataBlock(textOf(request.messages[0])) as {
    transactions: Array<{ id: string; description: string; merchant?: string | null }>
  }
  return data.transactions.map((row) => {
    const haystack = `${row.description} ${row.merchant ?? ''}`.toLowerCase()
    const rule = rules.find((candidate) => haystack.includes(candidate.match.toLowerCase()))
    return {
      id: row.id,
      categorySlug: rule?.categorySlug ?? null,
      confidence: rule?.confidence ?? 0,
      payee: rule?.payee ?? null,
    }
  })
}

function textOf(message: CompletionRequest['messages'][number]): string {
  return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n')
}

/** Rough and deterministic: about four characters per token. */
function estimateTokens(text: string) {
  return Math.ceil(text.length / 4)
}

async function loadFixtures(dir: string): Promise<FakeLlmFixtures | null> {
  try {
    const [classify, receipt, insight] = await Promise.all(
      ['classify.json', 'receipt.json', 'insight.json'].map(async (file) =>
        JSON.parse(await readFile(join(dir, file), 'utf8'))
      )
    )
    return { classify, receipt, insight }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
