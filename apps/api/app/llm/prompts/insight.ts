import type { Locale } from '@monkimoney/shared'
import type { InsightInput } from '#llm/types'
import { UNTRUSTED_DATA_RULE, dataBlock, jsonOnlyInstruction } from '#llm/prompts/untrusted_data'

/** Output language per supported locale (a third language = one entry). */
const LANGUAGE: Record<Locale, string> = {
  en: 'English (Australia)',
  es: 'Spanish (Mexico)',
}

/** Static (cacheable) system prompt; the schema mirrors schemas/insight_schema.ts. */
const SYSTEM = [
  "You write a short, friendly monthly summary of a couple's shared household finances.",
  '',
  'Rules:',
  '- Write in the language requested in the message (outside the data).',
  '- Use only the numbers in the data. Amounts are integer cents in the given currency:',
  '  present them as money (for example 123456 cents in AUD is $1,234.56).',
  '- Compare with the previous month when it is provided; never invent figures.',
  '- No financial, legal or tax advice and no judgement about either person.',
  '- headline: one sentence, at most 120 characters.',
  '- body: at most 2000 characters of Markdown (bold and lists only; no headings, links or images).',
  '- highlights: at most 5 short facts, each with a tone of positive, neutral or warning.',
  '',
  UNTRUSTED_DATA_RULE,
  '',
  jsonOnlyInstruction(
    '{"headline":"<text>","body":"<markdown>","highlights":[{"tone":"positive" or "neutral" or "warning","text":"<text>"}]}'
  ),
].join('\n')

export function buildInsightPrompt(input: InsightInput, locale: Locale) {
  return {
    system: SYSTEM,
    user: `Write the summary in ${LANGUAGE[locale]}.\n${dataBlock(input)}`,
  }
}
