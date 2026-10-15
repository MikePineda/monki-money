/**
 * Shapes stored in `households.settings` (jsonb) and the plan limits the API
 * exposes through `GET /api/v1/auth/me`.
 */

/** Per-household settings. Every key is optional so old rows stay valid. */
export interface HouseholdSettings {
  /** Feature flags switched on for this household (e.g. beta features). */
  flags?: string[]
}

/** Limits of the household's plan (`config/plans.ts` in the API). */
export interface Entitlements {
  llmCallsPerMonth: number
  maxAccounts: number
  maxMembers: number
  importsPerMonth: number
}
