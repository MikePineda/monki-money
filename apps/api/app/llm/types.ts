import type { Locale, LlmPurpose, LlmUsageStatus } from '@monkimoney/shared'

/**
 * DTOs of the LLM layer. Callers (import classification, receipt scanning,
 * monthly insights) only ever see these; vendor SDK types stay inside the
 * providers. Money is integer cents, dates are 'YYYY-MM-DD' strings.
 */

/** Who the call is for. `householdId: null` = operator call (no quota). */
export interface CallOptions {
  householdId: number | null
  userId: number | null
  /** Output language where the answer is prose (insights). Default 'en'. */
  locale?: Locale
}

/** A category the model may pick, by its stable slug. */
export interface LlmCategoryOption {
  slug: string
  name: string
  group?: string | null
  kind?: 'expense' | 'income'
}

/* ----------------------------- classify ------------------------------ */

export interface ClassifyRow {
  /** Caller's id for the row (an import row id); echoed back. */
  id: string
  date: string
  /** Negative = money out of the account. */
  amountCents: number
  /** Raw bank description (untrusted). */
  description: string
  merchant?: string | null
  /** The bank's own category, when the export carries one. */
  bankCategory?: string | null
}

export interface ClassifyInput {
  rows: ClassifyRow[]
  categories: LlmCategoryOption[]
}

export interface ClassifySuggestion {
  id: string
  /** One of the provided slugs, or null (no confident pick). */
  categorySlug: string | null
  /** 0..1; 0 whenever `categorySlug` is null. */
  confidence: number
  /** Clean merchant name, when the model could tell. */
  payee: string | null
}

export interface ClassifyOutput {
  /** One suggestion per input row, in input order. */
  suggestions: ClassifySuggestion[]
}

/* ------------------------------ receipt ------------------------------ */

export const RECEIPT_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
export type ReceiptMediaType = (typeof RECEIPT_MEDIA_TYPES)[number]

export interface ReceiptImage {
  /** Base64 of the image bytes (no `data:` prefix). Never persisted. */
  base64: string
  mediaType: ReceiptMediaType
}

export interface ReceiptInput {
  image: ReceiptImage
  categories: LlmCategoryOption[]
  /** Household currency, a hint when the receipt shows none. */
  currencyCode?: string
}

export interface ReceiptLine {
  description: string
  amountCents: number
  quantity: number | null
}

export interface ReceiptExtraction {
  merchant: string | null
  date: string | null
  totalCents: number | null
  currencyCode: string | null
  categorySlug: string | null
  items: ReceiptLine[]
  confidence: number
}

/* ------------------------------ insight ------------------------------ */

export interface InsightTotals {
  incomeCents: number
  expenseCents: number
  netCents: number
}

export interface InsightCategoryLine {
  slug: string
  name: string
  /** Side of the line; amounts are positive on their own side. */
  kind?: 'expense' | 'income'
  amountCents: number
  previousAmountCents?: number | null
}

export interface InsightInput {
  /** 'YYYY-MM'. */
  month: string
  currencyCode: string
  totals: InsightTotals
  previousTotals?: InsightTotals | null
  byCategory: InsightCategoryLine[]
}

export const INSIGHT_TONES = ['positive', 'neutral', 'warning'] as const
export type InsightTone = (typeof INSIGHT_TONES)[number]

export interface InsightHighlight {
  tone: InsightTone
  text: string
}

export interface MonthlyInsight {
  headline: string
  /** Short Markdown body in the requested locale. */
  body: string
  highlights: InsightHighlight[]
}

/* ------------------------------ results ------------------------------ */

/** Usage of one public call, summed over its attempts and chunks. */
export interface LlmCallUsage {
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  /** Provider round trips (retries and classify chunks included). */
  attempts: number
  /** Micro-dollars (USD x 1e6) from the pricing table in config/llm.ts. */
  costMicros: number
}

export interface LlmResult<T> {
  data: T
  usage: LlmCallUsage
  /**
   * True when (part of) the answer was unusable even after the retry and
   * the layer fell back to "no suggestion" (classify only; the other
   * purposes throw LlmOutputInvalidError instead).
   */
  degraded: boolean
}

/* --------------------- provider-facing (internal) -------------------- */

export type LlmContentBlock =
  { type: 'text'; text: string } | { type: 'image'; mediaType: ReceiptMediaType; base64: string }

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: LlmContentBlock[]
}

/** One round trip to a provider, vendor-neutral. */
export interface CompletionRequest {
  purpose: LlmPurpose
  locale: Locale
  model: string
  maxTokens: number
  system: string
  messages: LlmMessage[]
}

export interface Completion {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
  /** 'end_turn', 'max_tokens', 'refusal'... or null when unknown. */
  stopReason: string | null
}

/** One `llm_usage` row. */
export interface LlmUsageEntry {
  householdId: number | null
  userId: number | null
  purpose: LlmPurpose
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  status: LlmUsageStatus
  errorMessage: string | null
  costMicros: number
}
