import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * `node ace push:test --user <id>`: sends a test notification ("Notifications
 * work", in the person's language, opening Settings) to every device the
 * person registered in their current household, through the real sender.
 * Prints one line per device (id, browser, outcome); a device the push
 * service no longer knows (404/410) is deleted, as in any send. Exits 1 when
 * no device got it. Ignores the notification preferences and the scheduler.
 */
export default class PushTest extends BaseCommand {
  static override commandName = 'push:test'
  static override description = 'Send a test push notification to every device of a user'
  static override options: CommandOptions = { startApp: true }

  @flags.number({ description: 'User id (required)' })
  declare user?: number

  override async run() {
    // App code is imported lazily, after the app (and its providers) booted.
    const { default: User } = await import('#models/user')
    const { default: Clock } = await import('#services/clock')
    const { default: PushNotifier } = await import('#services/push/push_notifier')
    const { testPayload } = await import('#services/push/push_messages')

    if (this.user === undefined) return this.fail('--user <id> is required')
    const user = await User.find(this.user)
    if (!user) return this.fail(`User ${this.user} not found`)
    if (!user.currentHouseholdId) return this.fail(`User ${user.id} has no household`)

    const notifier = await this.app.container.make(PushNotifier)
    const devices = await notifier.devicesOf(user.id, user.currentHouseholdId)
    if (devices.length === 0) {
      return this.fail(
        `User ${user.id} has no device subscribed in household ${user.currentHouseholdId}`
      )
    }

    const clock = await this.app.container.make(Clock)
    const deliveries = await notifier.deliver(
      devices,
      testPayload(user.locale),
      { ttlSeconds: 60 * 60 },
      clock.now()
    )
    for (const { subscription, delivery } of deliveries) {
      const device = `device ${subscription.id} (${subscription.userAgent ?? 'unknown browser'})`
      const what =
        delivery.status === 'sent'
          ? 'sent'
          : delivery.status === 'gone'
            ? `gone (${delivery.statusCode}), subscription deleted`
            : `failed (${delivery.error})`
      this.logger.log(`${device}: ${what}`)
    }
    if (!deliveries.some(({ delivery }) => delivery.status === 'sent')) this.exitCode = 1
  }

  protected fail(message: string) {
    this.logger.error(message)
    this.exitCode = 1
  }
}
