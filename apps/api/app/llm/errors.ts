import { Exception } from '@adonisjs/core/exceptions'
import type { LlmCallUsage } from '#llm/types'

/**
 * Errors of the LLM layer. They render through the global handler like the
 * domain errors (`{ message, code }`, message from errors.<code>):
 *
 * - LlmQuotaExceededError (402): the household used its monthly calls.
 * - LlmOutputInvalidError (422): the answer stayed unusable after the retry.
 * - LlmProviderError (503): the vendor failed (network, auth, 5xx, timeout).
 *   Callers that can live without the LLM (classification) catch it and
 *   degrade to rules only.
 */

export class LlmQuotaExceededError extends Exception {
  static override status = 402
  static override code = 'E_LLM_QUOTA_EXCEEDED'
  static override message = 'Monthly AI quota reached'
}

export class LlmOutputInvalidError extends Exception {
  static override status = 422
  static override code = 'E_LLM_OUTPUT_INVALID'

  constructor(
    /** Why the last answer was rejected (no model text, safe to log). */
    readonly issues: string[],
    /** Tokens already spent on the rejected attempts. */
    readonly usage: LlmCallUsage
  ) {
    super(`The AI answer was not usable: ${issues.slice(0, 3).join('; ')}`)
  }
}

export class LlmProviderError extends Exception {
  static override status = 503
  static override code = 'E_LLM_UNAVAILABLE'

  constructor(
    message: string,
    /** HTTP status from the vendor, undefined for network errors and timeouts. */
    readonly upstreamStatus?: number,
    options?: { cause?: unknown }
  ) {
    super(message, { cause: options?.cause })
  }
}
