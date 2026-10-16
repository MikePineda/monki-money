import VapidKeys from '#services/push/vapid_keys'
import type { ApplicationService } from '@adonisjs/core/types'
import { PushSender } from '#services/push/push_sender'

/**
 * Web Push bindings: one `VapidKeys` per process (the key pair is resolved
 * on first use and cached) and the `PushSender` token (an abstract class):
 * the real `WebPushSender` everywhere but the test suite, where nothing may
 * leave the process (`FakePushSender`; tests swap in a fresh one per test
 * with `fakePush()` from tests/helpers/push.ts).
 */
export default class PushProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(VapidKeys, async (resolver) => {
      // App code loads lazily, once the database provider has booted.
      const { default: AppSettings } = await import('#services/settings/app_settings')
      return new VapidKeys(
        this.app.config.get('push'),
        new AppSettings(),
        await resolver.make('logger')
      )
    })

    this.app.container.singleton(PushSender, async (resolver) => {
      if (this.app.inTest) {
        const { default: FakePushSender } = await import('#services/push/fake_push_sender')
        return new FakePushSender()
      }
      const { default: WebPushSender } = await import('#services/push/web_push_sender')
      return new WebPushSender(await resolver.make(VapidKeys))
    })
  }
}
