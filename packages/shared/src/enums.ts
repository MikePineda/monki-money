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
 * What a ledger row is. Expenses are stored negative and income positive;
 * a transfer is two `transfer` rows (one per account, opposite signs) linked
 * by a `transfers` row, and never counts as income or expense.
 */
export const TRANSACTION_KINDS = ['expense', 'income', 'transfer'] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

/** Kinds a person enters directly; transfers have their own endpoint. */
export const ENTRY_KINDS = ['expense', 'income'] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

/** `pending` counts toward the available balance only, `cleared` toward both. */
export const TRANSACTION_STATUSES = ['pending', 'cleared'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

/** Where a ledger row came from. */
export const TRANSACTION_SOURCES = ['manual', 'import', 'receipt', 'telegram'] as const
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number]

/** Bank export formats the importer reads (one `BankCsvParser` each). */
export const IMPORT_SOURCES = ['nab_csv'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

/**
 * Lifecycle of an import batch (one per account and upload): `staged` while
 * the rows wait for review (at most one per account), then `completed` by
 * confirm or `cancelled`.
 */
export const IMPORT_BATCH_STATUSES = ['staged', 'completed', 'cancelled'] as const
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number]

/**
 * What an imported bank row is. `duplicate` rows are counted but never
 * stored (their hash already is); `superseded` marks the row of a pending
 * movement once its posted copy took over the transaction.
 */
export const IMPORT_RESOLUTIONS = [
  'new',
  'auto_matched',
  'needs_confirmation',
  'duplicate',
  'transfer_leg',
  'ignored',
  'superseded',
] as const
export type ImportResolution = (typeof IMPORT_RESOLUTIONS)[number]

/**
 * What a person may decide for a row before confirming: create it (`new`),
 * link it to an existing transaction (`auto_matched`), make it a transfer
 * leg (`transfer_leg`) or skip it for good (`ignored`).
 */
export const IMPORT_DECISIONS = ['new', 'auto_matched', 'transfer_leg', 'ignored'] as const
export type ImportDecision = (typeof IMPORT_DECISIONS)[number]

/** Where a category suggestion came from. */
export const SUGGESTION_SOURCES = ['rule', 'nab_map', 'llm', 'none'] as const
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number]

/**
 * How a merchant rule matches a bank row: the normalized merchant key
 * (`merchant`), a whole-word text (`contains`) or a regular expression.
 */
export const RULE_MATCH_TYPES = ['merchant', 'contains', 'regex'] as const
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number]

/** Who wrote a merchant rule: the person, the importer (learned) or the app's defaults. */
export const RULE_ORIGINS = ['user', 'learned', 'system'] as const
export type RuleOrigin = (typeof RULE_ORIGINS)[number]

/**
 * Lifecycle of a savings goal: `reached` is set by a person (the API stamps
 * `reachedAt`), `archived` hides it without deleting its history.
 */
export const GOAL_STATUSES = ['active', 'reached', 'archived'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

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
  transaction_kind: TRANSACTION_KINDS,
  transaction_status: TRANSACTION_STATUSES,
  transaction_source: TRANSACTION_SOURCES,
  llm_purpose: LLM_PURPOSES,
  llm_usage_status: LLM_USAGE_STATUSES,
  goal_status: GOAL_STATUSES,
  import_source: IMPORT_SOURCES,
  import_batch_status: IMPORT_BATCH_STATUSES,
  import_resolution: IMPORT_RESOLUTIONS,
  suggestion_source: SUGGESTION_SOURCES,
  rule_match_type: RULE_MATCH_TYPES,
  rule_origin: RULE_ORIGINS,
} as const satisfies Record<string, readonly string[]>
