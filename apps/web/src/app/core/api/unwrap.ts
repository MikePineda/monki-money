/**
 * Every API success body is `{ data }` at runtime. The generated types agree
 * for transformer results, but `GET /auth/me` (`ctx.serialize({ ... })` of a
 * plain object holding nullable transformer items) is typed without the
 * wrapper and with transformer item types. This reads the payload either way;
 * the caller states the wire shape it expects.
 */
export function unwrapData<T>(body: unknown): T {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    return (body as { data: T }).data
  }
  return body as T
}
