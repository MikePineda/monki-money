/**
 * True when `error` is Postgres' unique_violation (23505) on `constraint`:
 * the insert lost a race against an identical one (a client retry with the
 * same idempotency key).
 */
export function isUniqueViolationOn(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, constraint: violated } = error as { code?: unknown; constraint?: unknown }
  return code === '23505' && violated === constraint
}
