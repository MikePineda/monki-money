import LlmUsage from '#models/llm_usage'
import { inject } from '@adonisjs/core'
import { Logger } from '@adonisjs/core/logger'
import type { LlmUsageEntry } from '#llm/types'
import type { LlmUsageSink } from '#llm/llm_provider'

/**
 * Writes one `llm_usage` row per LLM attempt (cost already computed by the
 * pipeline from config/llm.ts). Rows feed the monthly quota and the cost
 * reports. A failed insert is logged and swallowed: the tokens are already
 * spent, so losing the answer as well would be the worse outcome.
 */
@inject()
export default class LlmUsageRecorder implements LlmUsageSink {
  constructor(protected logger: Logger) {}

  async record(entry: LlmUsageEntry): Promise<void> {
    try {
      await LlmUsage.create({
        householdId: entry.householdId,
        userId: entry.userId,
        purpose: entry.purpose,
        provider: entry.provider.slice(0, 40),
        model: entry.model.slice(0, 120),
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        latencyMs: entry.latencyMs,
        status: entry.status,
        errorMessage: entry.errorMessage?.slice(0, 500) ?? null,
        costMicros: entry.costMicros,
      })
    } catch (error) {
      this.logger.error(
        { err: error, householdId: entry.householdId, purpose: entry.purpose },
        'could not record LLM usage'
      )
    }
  }
}
