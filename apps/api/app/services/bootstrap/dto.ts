import type { Locale } from '@monkimoney/shared'

export interface BootstrapUserInput {
  email: string
  fullName: string
  password: string
  /** Suffix of this person's card on the joint everyday account. */
  cardSuffix: string | null
}

/** Everything the production bootstrap creates (see .env.example, SEED_*). */
export interface BootstrapInput {
  householdName: string
  locale: Locale
  owner: BootstrapUserInput
  member: BootstrapUserInput | null
  /** Bank account number of the joint everyday account (CSV "Account Number"). */
  jointAccountNumber: string | null
}
