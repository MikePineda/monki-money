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

/**
 * The smoke-test user (SMOKE_EMAIL / SMOKE_PASSWORD): a verified user alone
 * in its own "Smoke" household, so the post-deploy Bruno run never reads or
 * writes the real household.
 */
export interface SmokeUserInput {
  email: string
  password: string
}

/** What one run of the production bootstrap seeder creates. */
export interface SeedPlan {
  /** The real household; null when no SEED_* household variable is set. */
  household: BootstrapInput | null
  smoke: SmokeUserInput | null
}
