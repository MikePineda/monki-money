import { Injectable, computed, inject, signal } from '@angular/core'
import type { PublicConfig } from '@monkimoney/shared'
import { AuthApi } from './auth.api'

/**
 * The public runtime config (`GET /api/v1/config`): whether sign-up is open,
 * the build version. Fetched once on first need; a failure is not cached so
 * the next screen can try again.
 */
@Injectable({ providedIn: 'root' })
export class ConfigStore {
  private readonly api = inject(AuthApi)
  private pending: Promise<PublicConfig | null> | null = null
  private readonly _config = signal<PublicConfig | null>(null)

  readonly config = this._config.asReadonly()
  readonly registrationOpen = computed(() => this._config()?.registrationOpen === true)

  load(): Promise<PublicConfig | null> {
    this.pending ??= this.api.config().then(
      (config) => {
        this._config.set(config)
        return config
      },
      () => {
        this.pending = null
        return null
      }
    )
    return this.pending
  }
}
