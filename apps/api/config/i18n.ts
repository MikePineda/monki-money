import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { LOCALES } from '@monkimoney/shared'
import { defineConfig, formatters, loaders } from '@adonisjs/i18n'

/**
 * Server-side translations: validation messages, error messages, emails and
 * the names of system categories. Catalogs live in `resources/lang/<locale>/`
 * (validator.json, messages.json, errors.json, categories.json) and a test
 * keeps every locale in parity. Adding a language = a folder + LOCALES entry.
 */
const i18nConfig = defineConfig({
  defaultLocale: env.get('APP_DEFAULT_LOCALE') ?? 'en',
  supportedLocales: [...LOCALES],
  formatter: formatters.icu(),

  loaders: [
    loaders.fs({
      location: app.languageFilesPath(),
    }),
  ],
})

export default i18nConfig
