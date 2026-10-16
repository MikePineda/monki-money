import {
  type ApplicationConfig,
  Injector,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { provideServiceWorker } from '@angular/service-worker'
import { routes } from './app.routes'
import { provideAuth } from './core/auth/auth.providers'
import { provideI18n } from './core/i18n/i18n.providers'
import { InstallService } from './core/pwa/install.service'
import { UpdateService } from './core/pwa/update.service'
import { ThemeStore } from './core/theme/theme.store'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideI18n(),
    // GET /auth/me before the first route resolves (guards read the session).
    provideAuth(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => {
      // Theme first (theme-boot.js already painted it; this keeps it in sync),
      // then the PWA listeners: update checks and the install prompt.
      inject(ThemeStore)
      inject(UpdateService).start()
      inject(InstallService).start()
      // The offline outbox (it syncs once the session is known) is not
      // needed to paint the first screen: its chunk, with the month store
      // and the ledger API it drags along, loads beside the first route
      // instead of inside the initial bundle. Bootstrap does not wait for it.
      const injector = inject(Injector)
      void import('./core/outbox/outbox.store').then(({ OutboxStore }) =>
        injector.get(OutboxStore).start()
      )
    }),
  ],
}
