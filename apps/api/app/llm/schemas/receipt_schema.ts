import vine from '@vinejs/vine'
import type { ReceiptExtraction } from '#llm/types'
import { LlmSchemaError, nonEmpty, toCents } from '#llm/schemas/schema_error'

/** Decimal amount as printed on the receipt; bounded to keep cents in int range. */
const amount = () => vine.number().min(-1_000_000).max(1_000_000)

/**
 * Expected answer (spelled out in prompts/receipt.ts): decimal amounts as
 * printed, every field but `confidence` nullable. Unreadable values
 * (impossible dates, unknown currency, slug outside the list) become null
 * instead of failing the whole receipt.
 */
const receiptValidator = vine.create({
  merchant: vine.string().trim().maxLength(120).nullable().optional(),
  date: vine.string().trim().maxLength(40).nullable().optional(),
  total: amount().nullable().optional(),
  currencyCode: vine.string().trim().maxLength(10).nullable().optional(),
  categorySlug: vine.string().trim().maxLength(80).nullable().optional(),
  items: vine
    .array(
      vine.object({
        description: vine.string().trim().minLength(1).maxLength(200),
        amount: amount(),
        quantity: vine.number().min(0).max(10_000).nullable().optional(),
      })
    )
    .maxLength(100)
    .nullable()
    .optional(),
  confidence: vine.number().min(0).max(1),
})

export interface ReceiptParseContext {
  allowedSlugs: Iterable<string>
}

export async function parseReceiptExtraction(
  raw: unknown,
  context: ReceiptParseContext
): Promise<ReceiptExtraction> {
  const [error, value] = await receiptValidator.tryValidate(raw)
  if (error) throw LlmSchemaError.fromValidation(error)

  const allowed = new Set(context.allowedSlugs)
  const slug = nonEmpty(value.categorySlug)
  return {
    merchant: nonEmpty(value.merchant),
    date: isoDateOrNull(value.date),
    totalCents: typeof value.total === 'number' ? toCents(value.total) : null,
    currencyCode: currencyOrNull(value.currencyCode),
    categorySlug: slug && allowed.has(slug) ? slug : null,
    items: (value.items ?? []).map((item) => ({
      description: item.description,
      amountCents: toCents(item.amount),
      quantity: item.quantity ?? null,
    })),
    confidence: value.confidence,
  }
}

function isoDateOrNull(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

function currencyOrNull(value: string | null | undefined): string | null {
  return value && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null
}
