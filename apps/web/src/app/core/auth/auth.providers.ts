import {
  Injector,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  type EnvironmentProviders,
} from '@angular/core'
import type { Locale, Theme } from '@monkimoney/shared'
import { LANG_PERSISTENCE, type LangPersistence } from '../i18n/lang.store'
import { HOUSEHOLD_TIME_ZONE } from '../platform/time-zone.token'
import { THEME_PERSISTENCE, type ThemePersistence } from '../theme/theme.store'
import { AuthApi } from './auth.api'
import { SessionStore } from './session.store'

/**
 * Saves a preference on the user's profile (`PATCH /me`) when someone is
 * signed in; a guest's choice stays on the device. Resolved lazily: the
 * theme and language stores exist before the session store does.
 */
async function savePreference(
  injector: Injector,
  body: { theme: Theme } | { locale: Locale }
): Promise<void> {
  const session = injector.get(SessionStore)
  if (!session.isAuthenticated()) {
    return
  }
  try {
    session.patchUser(await injector.get(AuthApi).updateProfile(body))
  } catch {
    // The choice still applies on this device; the next boot re-syncs it.
  }
}

/**
 * The session: `GET /auth/me` before the first route resolves (or, without
 * an answer, the session this device kept: SessionStore.boot), theme and
 * language persisted on the profile, and "today" in the household's time
 * zone (the device's until a household is known).
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => inject(SessionStore).boot()),
    {
      provide: THEME_PERSISTENCE,
      useFactory: (): ThemePersistence => {
        const injector = inject(Injector)
        return { save: (theme) => savePreference(injector, { theme }) }
      },
    },
    {
      provide: LANG_PERSISTENCE,
      useFactory: (): LangPersistence => {
        const injector = inject(Injector)
        return { save: (locale) => savePreference(injector, { locale }) }
      },
    },
    {
      provide: HOUSEHOLD_TIME_ZONE,
      useFactory: () => {
        const session = inject(SessionStore)
        return () =>
          session.household()?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      },
    },
  ])
}
