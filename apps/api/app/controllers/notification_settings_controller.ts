import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import type { NotificationSettings } from '@monkimoney/shared'
import { updateNotificationSettingsValidator } from '#validators/push'
import NotificationSettingsService from '#services/push/notification_settings_service'

/** The signed-in person's push notification preferences (defaults until saved). */
@inject()
export default class NotificationSettingsController {
  constructor(protected settings: NotificationSettingsService) {}

  /** GET /me/notifications */
  async show(ctx: HttpContext): Promise<{ data: NotificationSettings }> {
    return { data: await this.settings.of(ctx.auth.getUserOrFail()) }
  }

  /**
   * PATCH /me/notifications { summaryReady?, dailyReminder?, reminderTime? ('HH:mm'),
   * reminderWeekdays? (ISO weekdays, Monday 1) }
   */
  async update(ctx: HttpContext): Promise<{ data: NotificationSettings }> {
    const changes = await ctx.request.validateUsing(updateNotificationSettingsValidator)

    return { data: await this.settings.update(ctx.auth.getUserOrFail(), changes) }
  }
}
