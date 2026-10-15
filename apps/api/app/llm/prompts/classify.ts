import type { ClassifyInput } from '#llm/types'
import { UNTRUSTED_DATA_RULE, dataBlock, jsonOnlyInstruction } from '#llm/prompts/untrusted_data'

/** Static (cacheable) system prompt; the schema mirrors schemas/classify_schema.ts. */
const SYSTEM = [
  'You categorise bank transactions for a household budgeting app.',
  'Amounts are integer cents: negative means money left the account, positive means money came in.',
  '',
  'Task: for every transaction in the data, choose the single best category from the',
  'categories listed in the same data, identified by its slug.',
  '',
  'Rules:',
  '- Use only a categorySlug that appears in the provided categories. If none fits or you are unsure, use null.',
  '- confidence is a number from 0 to 1 that reflects how sure you are.',
  '- payee is the clean merchant or counterparty name (for example "Woolworths"), or null.',
  '- Return exactly one result per transaction id and never invent ids.',
  "- Transfers between the household's own accounts are not a category: use null.",
  '',
  UNTRUSTED_DATA_RULE,
  '',
  jsonOnlyInstruction(
    '{"results":[{"id":"<transaction id>","categorySlug":"<slug>" or null,"confidence":0.0,"payee":"<name>" or null}]}'
  ),
].join('\n')

export function buildClassifyPrompt(input: ClassifyInput) {
  const data = {
    categories: input.categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      group: category.group ?? null,
      kind: category.kind ?? null,
    })),
    transactions: input.rows,
  }
  return {
    system: SYSTEM,
    user: `Classify every transaction below.\n${dataBlock(data)}`,
  }
}
