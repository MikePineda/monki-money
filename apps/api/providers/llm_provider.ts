import { LlmProvider } from '#llm/llm_provider'
import type { LlmSettings } from '#llm/llm_settings'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Binds the `LlmProvider` token (an abstract class) to one shared instance
 * chosen by config/llm.ts: the Anthropic-compatible SDK provider (MiniMax or
 * Anthropic) or the fake. Usage rows and the monthly quota are wired here,
 * so every caller gets them. Services receive it with `@inject()`; tests
 * swap it with `app.container.swap(LlmProvider, ...)`.
 */
export default class LlmServiceProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(LlmProvider, async (resolver) => {
      // App code loads lazily, once the database provider has booted.
      const { createLlmProvider } = await import('#llm/create_llm_provider')
      const { default: LlmUsageRecorder } = await import('#llm/usage_recorder')
      const { default: EntitlementsService } =
        await import('#services/entitlements/entitlements_service')

      return createLlmProvider(
        this.app.config.get<LlmSettings>('llm'),
        {
          usage: await resolver.make(LlmUsageRecorder),
          quota: await resolver.make(EntitlementsService),
        },
        // Present in dev and tests only; the production image ships no tests/.
        this.app.makePath('tests/fixtures/llm')
      )
    })
  }

  async ready() {
    const settings = this.app.config.get<LlmSettings>('llm')
    if (this.app.inProduction && settings.provider === 'fake') {
      const logger = await this.app.container.make('logger')
      logger.warn('LLM disabled: LLM_API_KEY is empty or LLM_PROVIDER=fake (no AI calls are made)')
    }
  }
}
