import type User from '#models/user'
import type { Locale, MemberRole } from '@monkimoney/shared'

export interface CreateHouseholdInput {
  owner: User
  name: string
  locale: Locale
  timezone?: string
  currencyCode?: string
  /** Seed the shared category taxonomy (default true). */
  withTaxonomy?: boolean
}

/** `POST /households`: a household for a user who has none. */
export interface NewHouseholdInput {
  name: string
  /** Default: the user's locale (also the language of the seeded taxonomy). */
  locale?: Locale
  /** Default: Australia/Brisbane. */
  timezone?: string
  /** Default: AUD. */
  currencyCode?: string
}

export interface AddMemberInput {
  user: User
  role: MemberRole
  displayName?: string | null
}

export interface UpdateHouseholdInput {
  name?: string
  locale?: Locale
  timezone?: string
}
