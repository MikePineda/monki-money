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
