import vine from '@vinejs/vine'
import type { ClassifyOutput, ClassifySuggestion } from '#llm/types'
import { LlmSchemaError, isRecord, nonEmpty } from '#llm/schemas/schema_error'

/**
 * Expected answer (spelled out in prompts/classify.ts):
 * `{ "results": [{ "id", "categorySlug": string|null, "confidence": 0..1, "payee"?: string|null }] }`
 */
const classifyValidator = vine.create({
  results: vine
    .array(
      vine.object({
        id: vine.string().trim().minLength(1).maxLength(64),
        categorySlug: vine.string().trim().maxLength(80).nullable(),
        confidence: vine.number().min(0).max(1),
        payee: vine.string().trim().maxLength(120).nullable().optional(),
      })
    )
    .maxLength(1000),
})

export interface ClassifyParseContext {
  /** Ids of the rows sent in this request, in order. */
  rowIds: string[]
  /** Slugs the model was allowed to pick. */
  allowedSlugs: Iterable<string>
}

/**
 * Validates the model's answer and normalises it to exactly one suggestion
 * per requested row, in request order: unknown ids are ignored, the first
 * answer for an id wins, missing rows get "no suggestion", and a slug that
 * is not in the allowed list becomes null (confidence 0). The model can
 * therefore never introduce a category or a row of its own.
 */
export async function parseClassifyOutput(
  raw: unknown,
  context: ClassifyParseContext
): Promise<ClassifyOutput> {
  const [error, value] = await classifyValidator.tryValidate(normalise(raw))
  if (error) throw LlmSchemaError.fromValidation(error)

  const allowed = new Set(context.allowedSlugs)
  const byId = new Map<string, ClassifySuggestion>()
  for (const result of value.results) {
    if (byId.has(result.id)) continue
    const slug =
      result.categorySlug && allowed.has(result.categorySlug) ? result.categorySlug : null
    byId.set(result.id, {
      id: result.id,
      categorySlug: slug,
      confidence: slug ? result.confidence : 0,
      payee: nonEmpty(result.payee),
    })
  }

  return {
    suggestions: context.rowIds.map((id) => byId.get(id) ?? noSuggestion(id)),
  }
}

/** "The model had nothing usable for this row." */
export function noSuggestion(id: string): ClassifySuggestion {
  return { id, categorySlug: null, confidence: 0, payee: null }
}

/** Accepts a bare array and numeric ids (models echo "12" as 12). */
function normalise(raw: unknown): unknown {
  const container = Array.isArray(raw) ? { results: raw } : raw
  const results = isRecord(container) ? container['results'] : undefined
  if (!Array.isArray(results)) return container
  return {
    ...(container as Record<string, unknown>),
    results: results.map((result: unknown) =>
      isRecord(result) && typeof result['id'] === 'number'
        ? { ...result, id: String(result['id']) }
        : result
    ),
  }
}
