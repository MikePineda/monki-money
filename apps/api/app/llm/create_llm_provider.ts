import type { LlmSettings } from '#llm/llm_settings'
import { FakeLlmProvider } from '#llm/providers/fake_llm_provider'
import type { LlmProvider, LlmProviderDependencies } from '#llm/llm_provider'
import { AnthropicCompatibleProvider } from '#llm/providers/anthropic_compatible_provider'

/**
 * Strategy selection: `settings.provider` is already resolved (an empty key
 * means 'fake', see llm_settings.ts). The fake reads its fixtures from
 * `fixturesDir` when present (dev, tests) and answers "nothing" otherwise.
 */
export async function createLlmProvider(
  settings: LlmSettings,
  dependencies: Omit<LlmProviderDependencies, 'settings'>,
  fixturesDir: string
): Promise<LlmProvider> {
  if (settings.provider === 'fake') {
    return FakeLlmProvider.fromFixtureDir({ ...dependencies, settings }, fixturesDir)
  }
  return new AnthropicCompatibleProvider({ ...dependencies, settings })
}
