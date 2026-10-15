import { errors } from '@vinejs/vine'

/**
 * The model's JSON did not match the expected schema. `issues` are short
 * "field: message" strings from VineJS (never the model's text), fed back to
 * the model on the retry and logged in `llm_usage.error_message`.
 */
export class LlmSchemaError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid LLM output: ${issues.slice(0, 3).join('; ')}`)
  }

  /** Wraps a VineJS validation error; anything else is rethrown untouched. */
  static fromValidation(error: unknown): LlmSchemaError {
    if (error instanceof errors.E_VALIDATION_ERROR) {
      const messages = error.messages as Array<{ field: string; message: string }>
      return new LlmSchemaError(
        messages.slice(0, 10).map(({ field, message }) => `${field}: ${message}`)
      )
    }
    throw error
  }
}

/** Plain object check (arrays and null excluded). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trimmed non-empty string, else null. */
export function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Decimal amount (12.5) to integer cents (1250). */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}
