/**
 * What Tuyau throws (TuyauHTTPError / TuyauNetworkError), recognised by shape
 * so this module does not pull the client into the initial bundle (the
 * client itself is loaded lazily, see api.ts). Kept apart from http-errors.ts
 * so the session store, which only needs `isClientErrorAnswer`, keeps the
 * full error mapping out of the initial bundle too.
 */
export interface TuyauLikeError {
  kind: 'http' | 'network'
  status?: number
  response?: unknown
  rawResponse?: { headers?: { get(name: string): string | null } }
}

export function isTuyauError(error: unknown): error is TuyauLikeError {
  if (!(error instanceof Error) || !('kind' in error)) {
    return false
  }
  const { kind } = error as { kind: unknown }
  return kind === 'http' || kind === 'network'
}

/**
 * The API answered with a 4xx: it is up (it refused the request, or the
 * session is gone). Anything else (no network, a 5xx, an unknown failure)
 * means the API could not be reached.
 */
export function isClientErrorAnswer(error: unknown): boolean {
  if (!isTuyauError(error) || error.kind !== 'http' || error.status === undefined) {
    return false
  }
  return error.status >= 400 && error.status < 500
}
