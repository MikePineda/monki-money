import User from '#models/user'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { UserNotificationSettingSchema } from '#database/schema'

/**
 * A person's push notification preferences; no row = the defaults
 * (`DEFAULT_NOTIFICATION_SETTINGS` in @monkimoney/shared).
 */
export default class UserNotificationSetting extends UserNotificationSettingSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
