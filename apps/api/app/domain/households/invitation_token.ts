import { createHash, randomBytes } from 'node:crypto'

/** Days an invitation link stays valid. */
export const INVITATION_TTL_DAYS = 7

/** 32 random bytes, base64url (43 chars): travels only in the email/link. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url')
}

/** What the database stores and looks up (hex sha256). */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
