import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * `node ace push:rotate-keys --force`: replaces the generated VAPID key pair
 * stored in `app_settings` with a fresh one and deletes every push
 * subscription in the same transaction (a subscription is bound to the key
 * it was made with: it can never be delivered again). Prints how many
 * devices must subscribe again; each does by itself the next time its
 * person opens Settings (the web notices the new key). Refuses without
 * `--force`, and while VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY pin a pair (that
 * pair is rotated in the environment). Other running processes keep the
 * pair they cached until the service is reloaded (docs/RUNBOOK.md).
 */
export default class PushRotateKeys extends BaseCommand {
  static override commandName = 'push:rotate-keys'
  static override description =
    'Replace the stored VAPID key pair and delete every push subscription'
  static override options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Confirm: every device must turn notifications on again' })
  declare force?: boolean

  override async run() {
    // App code is imported lazily, after the app (and its providers) booted.
    const { default: db } = await import('@adonisjs/lucid/services/db')
    const { default: VapidKeys } = await import('#services/push/vapid_keys')
    const { default: PushSubscription } = await import('#models/push_subscription')

    const keys = await this.app.container.make(VapidKeys)
    if (keys.pinnedByEnv) {
      return this.fail(
        'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set and win over the stored pair: ' +
          'rotate them in the environment instead (docs/RUNBOOK.md, "Push notifications")'
      )
    }

    if (!this.force) {
      const [{ total }] = await db.from(PushSubscription.table).count('* as total')
      return this.fail(
        `This replaces the VAPID key pair and deletes all ${Number(total)} push subscriptions ` +
          '(every device must turn notifications on again). Run it again with --force.'
      )
    }

    const dropped = await db.transaction(async (trx) => {
      await keys.replaceStored(trx)
      const deleted = await trx.from(PushSubscription.table).delete().returning('id')
      return deleted.length
    })
    keys.forget()

    this.logger.success(
      `Stored a new VAPID key pair and deleted ${dropped} push subscription${dropped === 1 ? '' : 's'}: ` +
        `${dropped} device${dropped === 1 ? '' : 's'} must subscribe again ` +
        '(each does when its person opens Settings).'
    )
    this.logger.info(
      'Reload the service now (Dokploy: application-reload): every running process cached the old pair.'
    )
  }

  protected fail(message: string) {
    this.logger.error(message)
    this.exitCode = 1
  }
}
