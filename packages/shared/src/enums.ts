/**
 * Closed sets of values shared by the API and the web app. The ones backed
 * by a native Postgres enum are listed in `POSTGRES_ENUMS`; a functional
 * test in the API asserts the database types carry exactly these literals.
 * Adding a value means a new (additive) migration with `ALTER TYPE ... ADD
 * VALUE`, never editing an old migration.
 */

/** UI and content languages. The first one is the default. */
export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export const HOUSEHOLD_PLANS = ['free', 'pro'] as const
export type HouseholdPlan = (typeof HOUSEHOLD_PLANS)[number]

export const HOUSEHOLD_STATUSES = ['active', 'pending_deletion', 'suspended'] as const
export type HouseholdStatus = (typeof HOUSEHOLD_STATUSES)[number]

export const MEMBER_ROLES = ['owner', 'member'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const ACCOUNT_KINDS = ['transaction', 'savings', 'wallet', 'cash', 'other'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const CATEGORY_GROUP_KINDS = ['expense', 'income'] as const
export type CategoryGroupKind = (typeof CATEGORY_GROUP_KINDS)[number]

/** What an LLM call was for (one row of `llm_usage` per call). */
export const LLM_PURPOSES = ['classify', 'receipt', 'insight'] as const
export type LlmPurpose = (typeof LLM_PURPOSES)[number]

/** Outcome of one LLM call: answered, failed, or answered with unusable output. */
export const LLM_USAGE_STATUSES = ['ok', 'error', 'invalid_output'] as const
export type LlmUsageStatus = (typeof LLM_USAGE_STATUSES)[number]

/**
 * Native Postgres enum types, by type name. Migrations hardcode the same
 * literals (migrations are immutable history); the API test
 * `test_native_enums_match_shared_enums` keeps both in sync.
 */
export const POSTGRES_ENUMS = {
  household_plan: HOUSEHOLD_PLANS,
  household_status: HOUSEHOLD_STATUSES,
  member_role: MEMBER_ROLES,
  user_theme: THEMES,
  account_kind: ACCOUNT_KINDS,
  category_group_kind: CATEGORY_GROUP_KINDS,
  llm_purpose: LLM_PURPOSES,
  llm_usage_status: LLM_USAGE_STATUSES,
} as const satisfies Record<string, readonly string[]>
