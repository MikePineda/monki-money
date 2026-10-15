import {
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { provideServiceWorker } from '@angular/service-worker'
import { routes } from './app.routes'
import { provideI18n } from './core/i18n/i18n.providers'
import { InstallService } from './core/pwa/install.service'
import { UpdateService } from './core/pwa/update.service'
import { ThemeStore } from './core/theme/theme.store'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideI18n(),
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
    }),
  ],
}
