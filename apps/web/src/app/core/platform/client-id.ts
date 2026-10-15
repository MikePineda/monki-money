/**
 * A fresh idempotency key (uuid v4) for a create request. `randomUUID` only
 * exists in secure contexts (https, localhost); a phone trying a dev build
 * over the LAN gets the getRandomValues version instead.
 */
export function newClientId(): string {
  const crypto = globalThis.crypto
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
