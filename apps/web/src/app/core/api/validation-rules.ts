import { isTuyauError } from './http-errors'

/**
 * The rule behind each field of a 422 (`{ month: 'noActivity' }`), first
 * one per field, for screens whose wording depends on which check failed
 * rather than on the server's message. Empty for anything else. Kept apart
 * from http-errors.ts, which the initial bundle carries, so only the lazy
 * screens that need it load it.
 */
export function validationRules(error: unknown): Record<string, string> {
  if (!isTuyauError(error) || error.status !== 422) {
    return {}
  }
  const body = error.response
  if (typeof body !== 'object' || body === null || !('errors' in body)) {
    return {}
  }
  const { errors } = body as { errors: unknown }
  const rules: Record<string, string> = {}
  for (const item of Array.isArray(errors) ? (errors as unknown[]) : []) {
    const { field, rule } = (item ?? {}) as { field?: unknown; rule?: unknown }
    if (typeof field === 'string' && typeof rule === 'string') {
      rules[field] ??= rule
    }
  }
  return rules
}
