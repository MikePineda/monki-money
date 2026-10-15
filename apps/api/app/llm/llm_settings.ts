import type { Secret } from '@adonisjs/core/helpers'
import type { LlmPurpose } from '@monkimoney/shared'

/**
 * Pure resolution of the LLM configuration (config/llm.ts feeds it from
 * env). Rules:
 *
 * - LLM_PROVIDER=fake, or an empty LLM_API_KEY, selects the fake provider:
 *   no network call ever leaves the process and the app keeps working.
 * - `anthropic-compatible` (default) talks to any Anthropic-compatible
 *   endpoint; without LLM_BASE_URL it targets MiniMax with `MiniMax-M3`.
 * - `anthropic` uses the SDK's default endpoint and a Claude model.
 * - LLM_VISION_MODEL defaults to LLM_MODEL (MiniMax-M3 reads images).
 */

export type LlmProviderName = 'anthropic-compatible' | 'anthropic' | 'fake'

/** List price in USD per million tokens. */
export interface LlmModelPrice {
  inputUsdPerMTok: number
  outputUsdPerMTok: number
}

export type LlmPricing = Record<string, LlmModelPrice>

export interface LlmSettings {
  provider: LlmProviderName
  baseUrl: string | undefined
  apiKey: Secret<string> | undefined
  model: string
  visionModel: string
  /** Per HTTP attempt; the SDK retries timeouts too. */
  timeoutMs: number
  /** SDK-level retries (429, 5xx, network). Not the invalid-output retry. */
  maxRetries: number
  maxTokens: Record<LlmPurpose, number>
  /** Rows per classify request (each chunk is one call). */
  classifyBatchSize: number
  /** Overrides the plan's `llmCallsPerMonth` for every household. */
  monthlyCapOverride: number | null
  pricing: LlmPricing
}

export interface LlmEnvInput {
  provider?: LlmProviderName
  baseUrl?: string
  apiKey?: Secret<string>
  model?: string
  visionModel?: string
  monthlyCapOverride?: number
}

export type LlmTuning = Partial<
  Pick<LlmSettings, 'timeoutMs' | 'maxRetries' | 'maxTokens' | 'classifyBatchSize' | 'pricing'>
>

/** Model id recorded for fake calls, so they are never priced as a real model. */
export const FAKE_MODEL = 'fake'

const PROVIDER_DEFAULTS: Record<
  Exclude<LlmProviderName, 'fake'>,
  { baseUrl?: string; model: string }
> = {
  // Vendor API endpoint (not one of our domains).
  'anthropic-compatible': { baseUrl: 'https://api.minimax.io/anthropic', model: 'MiniMax-M3' },
  'anthropic': { baseUrl: undefined, model: 'claude-opus-5-5' },
}

const DEFAULT_TUNING: Required<LlmTuning> = {
  timeoutMs: 60_000,
  maxRetries: 2,
  // Room for the model's own reasoning: thinking-capable models spend part
  // of max_tokens before the JSON (neither vendor lets us switch it off
  // portably, so we never send `thinking`).
  maxTokens: { classify: 8192, receipt: 4096, insight: 4096 },
  classifyBatchSize: 40,
  pricing: {},
}

export function resolveLlmSettings(input: LlmEnvInput, tuning: LlmTuning = {}): LlmSettings {
  const requested = input.provider ?? 'anthropic-compatible'
  const hasKey = Boolean(input.apiKey?.release().trim())
  const provider: LlmProviderName = requested === 'fake' || !hasKey ? 'fake' : requested
  const tuned = { ...DEFAULT_TUNING, ...tuning }

  if (provider === 'fake') {
    return {
      ...tuned,
      provider,
      baseUrl: undefined,
      apiKey: undefined,
      model: FAKE_MODEL,
      visionModel: FAKE_MODEL,
      monthlyCapOverride: input.monthlyCapOverride ?? null,
    }
  }

  const defaults = PROVIDER_DEFAULTS[provider]
  const model = input.model?.trim() || defaults.model
  return {
    ...tuned,
    provider,
    baseUrl: input.baseUrl?.trim() || defaults.baseUrl,
    apiKey: input.apiKey,
    model,
    visionModel: input.visionModel?.trim() || model,
    monthlyCapOverride: input.monthlyCapOverride ?? null,
  }
}
