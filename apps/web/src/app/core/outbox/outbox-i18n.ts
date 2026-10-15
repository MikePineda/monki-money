import { provideTranslocoScope } from '@jsverse/transloco'

/**
 * The `outbox` Transloco scope: the sync pill in the shell and the sheet it
 * opens. ("Synced N entries" is a global key, `sync.synced`: toasts render
 * on any screen.)
 */
export function provideOutboxI18n() {
  return provideTranslocoScope({
    scope: 'outbox',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
