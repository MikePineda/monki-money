import type { ApplicationService } from '@adonisjs/core/types'
import {
  createTurnstileVerifier,
  TurnstileVerifier,
  type TurnstileSettings,
} from '#services/auth/turnstile_verifier'

/**
 * Binds the `TurnstileVerifier` token (an abstract class) to one shared
 * instance chosen by config/turnstile.ts: Cloudflare's siteverify when
 * TURNSTILE_SECRET is set, the no-op verifier otherwise. Controllers receive
 * it with `@inject()`; tests swap it with
 * `app.container.swap(TurnstileVerifier, ...)`.
 */
export default class TurnstileProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(TurnstileVerifier, () =>
      createTurnstileVerifier(this.app.config.get<TurnstileSettings>('turnstile'))
    )
  }
}
