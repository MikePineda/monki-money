import type User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import UserNotificationSetting from '#models/user_notification_setting'
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '@monkimoney/shared'

/** A person's preferences: their row, or the defaults while they never saved one. */
export default class NotificationSettingsService {
  async of(user: User): Promise<NotificationSettings> {
    const row = await UserNotificationSetting.findBy('user_id', user.id)
    return row ? settingsOf(row) : { ...DEFAULT_NOTIFICATION_SETTINGS }
  }

  /** Saves the given fields (the rest keep their value or default) in one upsert. */
  async update(user: User, changes: Partial<NotificationSettings>): Promise<NotificationSettings> {
    const now = new Date()
    const columns = {
      ...(changes.summaryReady === undefined ? {} : { summary_ready: changes.summaryReady }),
      ...(changes.dailyReminder === undefined ? {} : { daily_reminder: changes.dailyReminder }),
      ...(changes.reminderTime === undefined ? {} : { reminder_time: changes.reminderTime }),
    }
    const insert = db
      .knexQuery()
      .table(UserNotificationSetting.table)
      .insert({
        user_id: user.id,
        summary_ready: DEFAULT_NOTIFICATION_SETTINGS.summaryReady,
        daily_reminder: DEFAULT_NOTIFICATION_SETTINGS.dailyReminder,
        reminder_time: DEFAULT_NOTIFICATION_SETTINGS.reminderTime,
        ...columns,
        created_at: now,
        updated_at: now,
      })
      .onConflict('user_id')
    await (Object.keys(columns).length > 0
      ? insert.merge([...Object.keys(columns), 'updated_at'])
      : insert.ignore())
    return this.of(user)
  }
}

export function settingsOf(row: UserNotificationSetting): NotificationSettings {
  return {
    summaryReady: row.summaryReady,
    dailyReminder: row.dailyReminder,
    reminderTime: row.reminderTime,
  }
}
