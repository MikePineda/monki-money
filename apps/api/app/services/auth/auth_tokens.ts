import type User from '#models/user'
import encryption from '@adonisjs/core/services/encryption'

/**
 * Stateless, encrypted (AES-256-GCM with APP_KEY) tokens for emailed links.
 * Each carries a `purpose`, so a token minted for one flow is useless in
 * another, and an expiry. Rotating APP_KEY invalidates all of them.
 */
const VERIFY_EMAIL = { purpose: 'verify-email', expiresIn: '24 hours' }
const PASSWORD_RESET = { purpose: 'password-reset', expiresIn: '1 hour' }

interface VerifyEmailPayload {
  userId: number
  email: string
}

interface PasswordResetPayload {
  userId: number
  /** session_version at issue time: the reset bumps it, so the token works once. */
  sv: number
}

function isRecord<T extends object>(value: T | null | undefined): value is T {
  return typeof value === 'object' && value !== null
}

export function issueEmailVerificationToken(user: User): string {
  const payload: VerifyEmailPayload = { userId: user.id, email: user.email }
  return encryption.encrypt(payload, VERIFY_EMAIL)
}

/** The payload, or null when the token is tampered, expired or for another purpose. */
export function readEmailVerificationToken(token: string): VerifyEmailPayload | null {
  const payload = encryption.decrypt<Partial<VerifyEmailPayload> | null>(
    token,
    VERIFY_EMAIL.purpose
  )
  if (!isRecord(payload) || typeof payload.userId !== 'number') return null
  if (typeof payload.email !== 'string') return null
  return { userId: payload.userId, email: payload.email }
}

export function issuePasswordResetToken(user: User): string {
  const payload: PasswordResetPayload = { userId: user.id, sv: user.sessionVersion }
  return encryption.encrypt(payload, PASSWORD_RESET)
}

export function readPasswordResetToken(token: string): PasswordResetPayload | null {
  const payload = encryption.decrypt<Partial<PasswordResetPayload> | null>(
    token,
    PASSWORD_RESET.purpose
  )
  if (!isRecord(payload) || typeof payload.userId !== 'number') return null
  if (typeof payload.sv !== 'number') return null
  return { userId: payload.userId, sv: payload.sv }
}
