import { I18n } from '@adonisjs/i18n'
import Household from '#models/household'
import i18nManager from '@adonisjs/i18n/services/main'
import type { NextFn } from '@adonisjs/core/types/http'
import { resolveLocale } from '#domain/i18n/resolve_locale'
import { type HttpContext, RequestValidator } from '@adonisjs/core/http'

/**
 * Shares a request-scoped `ctx.i18n`. Locale: user preference ->
 * Accept-Language -> current household -> APP_DEFAULT_LOCALE. Runs after
 * silent auth, so a logged-in user's preference is known.
 */
export default class DetectUserLocaleMiddleware {
  /**
   * VineJS messages of `request.validateUsing` come from
   * resources/lang/<locale>/validator.json.
   */
  static {
    RequestValidator.messagesProvider = (ctx) => {
      return ctx.i18n.createMessagesProvider()
    }
  }

  protected async householdLocale(ctx: HttpContext) {
    const householdId = ctx.auth.user?.currentHouseholdId
    if (!householdId) return null
    const household = await Household.find(householdId)
    return household?.locale ?? null
  }

  async handle(ctx: HttpContext, next: NextFn) {
    const supported = i18nManager.supportedLocales()
    const userLocale = ctx.auth.user?.locale ?? null
    const browserLocale = i18nManager.getSupportedLocaleFor(ctx.request.languages())

    const locale = resolveLocale({
      userLocale,
      browserLocale,
      // Only queried when neither the user nor the browser decide.
      householdLocale:
        (userLocale && supported.includes(userLocale)) || browserLocale
          ? null
          : await this.householdLocale(ctx),
      defaultLocale: i18nManager.defaultLocale,
      supported,
    })

    ctx.i18n = i18nManager.locale(locale)
    ctx.containerResolver.bindValue(I18n, ctx.i18n)
    ctx.response.header('Content-Language', locale)

    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    i18n: I18n
  }
}
