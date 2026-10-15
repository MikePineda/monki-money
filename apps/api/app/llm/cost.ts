import type { LlmPricing } from '#llm/llm_settings'

/**
 * Cost of one call in micro-dollars (USD x 1e6), stored in
 * `llm_usage.cost_micros`. With prices in USD per million tokens the
 * conversion factors cancel out: micros = tokens x price. Models missing
 * from the pricing table (config/llm.ts) cost 0, the fake included.
 */
export function costMicros(
  pricing: LlmPricing,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const wanted = model.toLowerCase()
  const price = Object.entries(pricing).find(([name]) => name.toLowerCase() === wanted)?.[1]
  if (!price) return 0
  return Math.round(inputTokens * price.inputUsdPerMTok + outputTokens * price.outputUsdPerMTok)
}
