import type { Locale, Theme } from '@monkimoney/shared'

export interface SignupInput {
  fullName: string
  /** Already lowercased by the validator. */
  email: string
  password: string
  locale: Locale
  householdName?: string
}

export interface UpdateProfileInput {
  fullName?: string
  locale?: Locale
  theme?: Theme
  password?: string
  currentPassword?: string
}

export interface AcceptInvitationInput {
  /** Needed only when the invitee has no account yet. */
  fullName?: string
  /** New password (new account) or the current one (existing account). */
  password?: string
}
