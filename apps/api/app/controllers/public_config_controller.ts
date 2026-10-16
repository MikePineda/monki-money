import env from '#start/env'
import { inject } from '@adonisjs/core'
import type { PublicConfig } from '@monkimoney/shared'
import VapidKeys from '#services/push/vapid_keys'
import i18nManager from '@adonisjs/i18n/services/main'
import { currentBuildInfo } from '#services/build_info'

/**
 * Runtime configuration the SPA needs before anyone logs in. Everything here
 * is public by definition; never add a secret.
 */
@inject()
export default class PublicConfigController {
  constructor(protected vapid: VapidKeys) {}

  async show(): Promise<{ data: PublicConfig }> {
    const { version } = await currentBuildInfo()

    return {
      data: {
        registrationOpen: env.get('REGISTRATION_OPEN'),
        version,
        turnstileSiteKey: env.get('TURNSTILE_SITE_KEY') ?? null,
        sentryDsnWeb: env.get('SENTRY_DSN_WEB') ?? null,
        defaultLocale: i18nManager.defaultLocale,
        vapidPublicKey: await this.vapid.publicKey(),
      },
    }
  }
}
