/**
 * DTOs of the bank import pipeline. Everything here is plain data: the
 * pipeline is pure (no Lucid, no I/O, `today` injected), so the import
 * service maps database rows to these shapes and back. Field names follow
 * the `import_rows` / `transactions` / `merchant_rules` columns in camelCase.
 * Money is integer cents, dates are `YYYY-MM-DD` strings.
 */

import {
  IMPORT_RESOLUTIONS,
  RULE_MATCH_TYPES,
  SUGGESTION_SOURCES,
  type AccountKind,
  type ImportResolution,
  type ImportRowReason,
  type ImportSource,
  type RuleMatchType,
  type SuggestionSource,
} from '@monkimoney/shared'

/**
 * The closed sets live in `@monkimoney/shared` (native Postgres enums of
 * `import_batches` / `import_rows` / `merchant_rules`); re-exported here
 * under the pipeline's names.
 */
export { RULE_MATCH_TYPES, SUGGESTION_SOURCES }
export type { ImportSource, RuleMatchType, SuggestionSource }

/** Final state of an import row (`import_rows.resolution`). */
export const RESOLUTIONS = IMPORT_RESOLUTIONS
export type Resolution = ImportResolution

/** One CSV data row, decoded and typed but not interpreted yet. */
export interface ParsedRow {
  /** 0-based position among the data rows, in file order (NAB exports newest first). */
  rowIndex: number
  accountNumber: string
  /** Bank posting date (NAB `Date` column). */
  bankDate: string
  amountCents: number
  /** Running balance after this row; null when the bank left it empty. */
  balanceCents: number | null
  transactionType: string
  /** Details exactly as written in the file (trimmed): the hash input. */
  detailsRaw: string
  /** Details with HTML entities decoded (`&amp;` -> `&`). */
  details: string
  nabCategory: string | null
  nabMerchant: string | null
  /** Settlement date; null while the bank still shows the row as pending. */
  processedOn: string | null
  isPending: boolean
  /** Original cells keyed by column (`import_rows.raw`). Never render it as HTML. */
  raw: Readonly<Record<string, string>>
}

/** A parsed row enriched for staging: one `import_rows` record. */
export interface StagedRow extends ParsedRow {
  accountId: number
  /** 1-based rank among the rows of the file that are identical on every other hashed field. */
  occurrence: number
  externalHash: string
  /** Effective (purchase) date: the `dd/mm` token of the details, else the bank date. */
  date: string
  descriptionNormalized: string
  /** Base merchant key (`grocermart`). */
  merchantKey: string
  /** Full merchant key (`grocermart northvale village`), the pattern learned rules use. */
  merchantFullKey: string
  cardSuffix: string | null
  /** Dated after the injected `today`: always reviewed, never auto-matched. */
  isFutureDated: boolean
  /** Payer from the account owner, then the card holder, then the fallback user. */
  suggestedPaidByUserId: number | null
}

/**
 * An existing ledger transaction an import row may be the bank's copy of:
 * a manual/receipt/telegram entry without a linked import row, or a
 * transaction created from a row that was still pending at the bank.
 */
export interface CandidateTx {
  id: number
  accountId: number
  amountCents: number
  date: string
  payee: string | null
  description: string | null
  cardSuffix: string | null
  paidByUserId: number | null
  source: 'manual' | 'import' | 'receipt' | 'telegram'
  status: 'pending' | 'cleared'
}

/** Points a candidate earned, kept for the review screen. */
export interface ScoredCandidate {
  transactionId: number
  score: number
  points: { date: number; similarity: number; samePerson: number; unique: number }
}

export interface MatchResult {
  resolution: 'auto_matched' | 'needs_confirmation' | 'new'
  /** Best candidate; null when the row is new. */
  transactionId: number | null
  score: number | null
  /** The match is a pending import: upgrade it with this row and supersede its old import row. */
  upgradesPending: boolean
  /** Every eligible candidate, best first. */
  candidates: ScoredCandidate[]
}

/** A household rule (`merchant_rules`), learned or created by hand. */
export interface MerchantRule {
  id: number
  matchType: RuleMatchType
  pattern: string
  categoryId: number | null
  transferAccountId: number | null
  paidByUserId: number | null
  payeeOverride: string | null
  priority: number
  createdBy: 'user' | 'system'
}

/** What a category suggester looks at (no account numbers, no balances). */
export interface SuggestionInput {
  /** Effective date of the row. */
  date: string
  merchantKey: string
  merchantFullKey: string
  details: string
  descriptionNormalized: string
  nabCategory: string | null
  nabMerchant: string | null
  amountCents: number
}

export interface Suggestion {
  source: SuggestionSource
  categoryId: number | null
  /** 0..1 */
  confidence: number
  needsReview: boolean
  ruleId: number | null
  payee: string | null
  paidByUserId: number | null
}

/** A movement in another account of the household that may be the other side of a transfer. */
export interface TransferLeg {
  accountId: number
  amountCents: number
  date: string
  /** Existing ledger transaction, when the leg is already in the ledger. */
  transactionId: number | null
  /** Staged row of another batch of the same upload, when the leg is being imported too. */
  externalHash: string | null
}

/** A household account as transfer detection sees it (the importing one included). */
export interface HouseholdAccount {
  id: number
  institution: string | null
  kind: AccountKind
  isActive: boolean
  /** Null for a joint account. */
  ownerUserId: number | null
}

export interface TransferDetection {
  /** Why the row is an internal transfer. */
  signal: 'rule' | 'bank_category' | 'linked_account_memo'
  /** `out`: money leaves the imported account. */
  direction: 'out' | 'in'
  /** The other account; null when it must be picked in the review screen. */
  counterpartAccountId: number | null
  oppositeLeg: TransferLeg | null
  ruleId: number | null
  /**
   * The other account is only the one plausible account at the bank, not
   * a leg or a rule: proposed, but a person must check it.
   */
  guessed: boolean
}

/** Why a row ended up where it did (review screen hints; `IMPORT_ROW_REASONS`). */
export type ResolutionReason = ImportRowReason

/** A staged row after the resolver chain: what `import_rows` stores before the user decides. */
export interface ResolvedRow {
  row: StagedRow
  resolution: Resolution
  matchTransactionId: number | null
  matchScore: number | null
  upgradesPendingTransaction: boolean
  transfer: TransferDetection | null
  suggestion: Suggestion | null
  paidByUserId: number | null
  needsReview: boolean
  reasons: ResolutionReason[]
  /** A step settled the row; later steps leave it alone. */
  settled: boolean
}

/** Everything the resolver needs from the database, loaded by the import service. */
export interface ResolverContext {
  /** `external_hash` values already stored for this account, whatever their resolution. */
  existingHashes: ReadonlySet<string>
  /** Possible bank copies in this account (filtered again by `isMatchCandidate`). */
  candidates: readonly CandidateTx[]
  /** Movements in the household's other accounts, for the opposite leg of transfers. */
  transferLegs: readonly TransferLeg[]
  rules: readonly MerchantRule[]
  /** Every account of the household: an internal transfer's only possible counterpart. */
  accounts: readonly HouseholdAccount[]
}
