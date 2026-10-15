import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import { LlmProviderError } from '#llm/errors'
import type { Completion, CompletionRequest, LlmMessage } from '#llm/types'
import { LlmProvider, type LlmProviderDependencies } from '#llm/llm_provider'

/** Test seam: a custom `fetch` (the SDK's own option). */
export type AnthropicTransport = Pick<ClientOptions, 'fetch'>

/**
 * Any Anthropic Messages API endpoint through the official SDK: MiniMax's
 * Anthropic-compatible API in production (`LLM_BASE_URL`, `MiniMax-M3`) or
 * Anthropic itself (`LLM_PROVIDER=anthropic`).
 *
 * Portability rules: the request carries only `model`, `max_tokens`,
 * `system` and `messages`. No `thinking`, `top_k`, `stop_sequences`,
 * `output_config`, `tools` or `tool_choice` (MiniMax ignores some and
 * rejects `output_config.effort: none`); no sampling parameters (current
 * Claude models reject them). Structured output is JSON in text, validated
 * by the shared pipeline in LlmProvider. Images go as base64 blocks.
 */
export class AnthropicCompatibleProvider extends LlmProvider {
  readonly name: string
  readonly isLive = true

  readonly #client: Anthropic

  constructor(dependencies: LlmProviderDependencies, transport: AnthropicTransport = {}) {
    super(dependencies)
    const { settings } = dependencies
    const apiKey = settings.apiKey?.release()
    if (!apiKey) throw new Error('AnthropicCompatibleProvider needs LLM_API_KEY')

    this.name = settings.provider
    this.#client = new Anthropic({
      apiKey,
      // Never pick up ANTHROPIC_AUTH_TOKEN (or a local profile) from the environment.
      authToken: null,
      baseURL: settings.baseUrl,
      timeout: settings.timeoutMs,
      maxRetries: settings.maxRetries,
      fetch: transport.fetch,
    })
  }

  protected async complete(request: CompletionRequest): Promise<Completion> {
    let response: Anthropic.Message
    try {
      response = await this.#client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: request.messages.map(toMessageParam),
      })
    } catch (error) {
      if (error instanceof Anthropic.APIError) throw toProviderError(error)
      throw error
    }

    // Thinking blocks (if the model emits any) are never part of the answer.
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
    return {
      text,
      model: response.model || request.model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      stopReason: response.stop_reason ?? null,
    }
  }
}

function toMessageParam(message: LlmMessage): Anthropic.MessageParam {
  return {
    role: message.role,
    content: message.content.map((block): Anthropic.ContentBlockParam =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : {
            type: 'image',
            source: { type: 'base64', media_type: block.mediaType, data: block.base64 },
          }
    ),
  }
}

/** Typed SDK errors to one error of ours; the message never carries the key. */
function toProviderError(error: InstanceType<typeof Anthropic.APIError>): LlmProviderError {
  const kind =
    error instanceof Anthropic.APIConnectionTimeoutError
      ? 'timed out'
      : error instanceof Anthropic.APIConnectionError
        ? 'unreachable'
        : `answered HTTP ${error.status}`
  const detail = error.message.replace(/\s+/g, ' ').slice(0, 300)
  return new LlmProviderError(`LLM provider ${kind}: ${detail}`, error.status ?? undefined, {
    cause: error,
  })
}
