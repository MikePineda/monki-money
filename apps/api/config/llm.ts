import env from '#start/env'
import { resolveLlmSettings, type LlmPricing } from '#llm/llm_settings'

/**
 * LLM layer configuration (see docs/llm.md).
 *
 * - LLM_PROVIDER: anthropic-compatible (default) | anthropic | fake.
 *   An empty LLM_API_KEY always means `fake`: no network, the app works.
 * - LLM_BASE_URL / LLM_MODEL / LLM_VISION_MODEL: endpoint and models
 *   (defaults: MiniMax's Anthropic-compatible API with MiniMax-M3, which also
 *   reads images).
 * - LLM_MONTHLY_CAP_OVERRIDE: calls per household per month for every plan.
 */

/**
 * List prices in USD per million tokens, for `llm_usage.cost_micros`.
 * Unknown models are recorded at cost 0, so add a row when switching models.
 */
const pricing: LlmPricing = {
  // MiniMax pricing page, standard tier (prompts up to 512k tokens), checked 2026-10-15.
  'MiniMax-M3': { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 },
  // Anthropic list prices, checked 2026-10-15.
  'claude-opus-5-5': { inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
  'claude-sonnet-5-5': { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  'claude-haiku-5-5': { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 },
}

const llmConfig = resolveLlmSettings(
  {
    provider: env.get('LLM_PROVIDER'),
    baseUrl: env.get('LLM_BASE_URL'),
    apiKey: env.get('LLM_API_KEY'),
    model: env.get('LLM_MODEL'),
    visionModel: env.get('LLM_VISION_MODEL'),
    monthlyCapOverride: env.get('LLM_MONTHLY_CAP_OVERRIDE'),
  },
  {
    timeoutMs: 60_000,
    maxRetries: 2,
    maxTokens: { classify: 8192, receipt: 4096, insight: 4096 },
    classifyBatchSize: 40,
    pricing,
  }
)

export default llmConfig
