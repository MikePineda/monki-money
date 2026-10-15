import { Injectable, inject } from '@angular/core'
import type { Translation, TranslocoLoader } from '@jsverse/transloco'
import { WINDOW } from '../platform/window.token'

/**
 * Loads the global catalogues from /i18n/{lang}.json with fetch (no
 * HttpClient in the bundle). The API serves /i18n/* with no-cache and the
 * service worker prefetches them with the build. Feature scopes do not come
 * through here: they ship inline loaders (`import()` of their own JSON).
 */
@Injectable({ providedIn: 'root' })
export class TranslocoFetchLoader implements TranslocoLoader {
  private readonly window = inject(WINDOW)

  async getTranslation(lang: string): Promise<Translation> {
    const response = await this.window.fetch(`/i18n/${lang}.json`)
    if (!response.ok) {
      throw new Error(`Could not load the "${lang}" catalogue (${response.status})`)
    }
    return (await response.json()) as Translation
  }
}
