import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

/** Minutes an emailed verification code stays valid. */
export const VERIFICATION_CODE_TTL_MINUTES = 15

/** Wrong attempts that invalidate the code (the user must ask for a new one). */
export const VERIFICATION_CODE_MAX_ATTEMPTS = 5

/** Six random digits, zero-padded ("004217"). */
export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * What the database stores (hex sha256). Bound to the user id, so a code
 * hash leaked from one row says nothing about another user's code.
 */
export function hashVerificationCode(userId: number, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex')
}

/** Constant-time comparison of a typed code against the stored hash. */
export function verificationCodeMatches(userId: number, code: string, storedHash: string) {
  const typed = Buffer.from(hashVerificationCode(userId, code), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return typed.length === stored.length && timingSafeEqual(typed, stored)
}
