import { TAXONOMY } from '@monkimoney/shared'
import app from '@adonisjs/core/services/app'
import type { LlmCategoryOption, LlmUsageEntry } from '#llm/types'
import { FakeLlmProvider } from '#llm/providers/fake_llm_provider'
import type { LlmQuotaGuard, LlmUsageSink } from '#llm/llm_provider'
import { resolveLlmSettings, type LlmSettings, type LlmTuning } from '#llm/llm_settings'

/** Every category of the shared taxonomy, as the LLM sees them (English names). */
export const TAXONOMY_CATEGORIES: LlmCategoryOption[] = TAXONOMY.flatMap((group) =>
  group.categories.map((category) => ({
    slug: category.slug,
    name: category.nameEn,
    group: group.nameEn,
    kind: group.kind,
  }))
)

/** Records usage rows in memory (unit tests, no database). */
export function memoryUsageSink(): LlmUsageSink & { entries: LlmUsageEntry[] } {
  const entries: LlmUsageEntry[] = []
  return {
    entries,
    async record(entry) {
      entries.push(entry)
    },
  }
}

/** Fake-provider settings; `tuning` adjusts batch size, pricing... */
export function fakeLlmSettings(tuning: LlmTuning = {}): LlmSettings {
  return resolveLlmSettings({ provider: 'fake' }, tuning)
}

/** A fake provider loaded with tests/fixtures/llm. */
export async function fakeLlm(
  options: { settings?: LlmSettings; usage?: LlmUsageSink; quota?: LlmQuotaGuard } = {}
) {
  return FakeLlmProvider.fromFixtureDir(
    { settings: options.settings ?? fakeLlmSettings(), usage: options.usage, quota: options.quota },
    app.makePath('tests/fixtures/llm')
  )
}

/** A tiny valid PNG, as base64. */
export async function receiptPhoto(width = 40, height = 60) {
  const { default: sharp } = await import('sharp')
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 250, g: 250, b: 245 } },
  })
    .png()
    .toBuffer()
  return { base64: png.toString('base64'), mediaType: 'image/png' as const }
}
