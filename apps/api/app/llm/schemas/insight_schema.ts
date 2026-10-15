import vine from '@vinejs/vine'
import { LlmSchemaError } from '#llm/schemas/schema_error'
import { INSIGHT_TONES, type MonthlyInsight } from '#llm/types'

/** Expected answer (spelled out in prompts/insight.ts). */
const insightValidator = vine.create({
  headline: vine.string().trim().minLength(1).maxLength(120),
  body: vine.string().trim().minLength(1).maxLength(2000),
  highlights: vine
    .array(
      vine.object({
        tone: vine.enum(INSIGHT_TONES),
        text: vine.string().trim().minLength(1).maxLength(200),
      })
    )
    .maxLength(5),
})

export async function parseMonthlyInsight(raw: unknown): Promise<MonthlyInsight> {
  const [error, value] = await insightValidator.tryValidate(raw)
  if (error) throw LlmSchemaError.fromValidation(error)
  return value
}
