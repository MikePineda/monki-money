import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco'
import { LATEST_REMINDER_TIME, isReminderTime, type NotificationSettings } from '@monkimoney/shared'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { SessionStore } from '../../../core/auth/session.store'
import { PushApi } from '../../../core/push/push.api'
import { PushService, type PushState } from '../../../core/push/push.service'
import { InstallService } from '../../../core/pwa/install.service'
import { ToastStore } from '../../../core/ui/toast.store'
import { IconComponent } from '../../../shared/icons/icon.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CardComponent } from '../../../shared/ui/card/card.component'
import { CheckboxComponent } from '../../../shared/ui/checkbox/checkbox.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'

type SectionState = PushState | 'loading'

let nextId = 0

/**
 * Settings → Notifications: Web Push on this device and what the person
 * wants to hear about. States:
 * - unsupported: the browser has no Push API (in Safari on iPhone and iPad
 *   it says that notifications need the installed app, Home Screen first);
 * - unavailable: the server has no key; denied: blocked, where to allow it;
 * - off: what the notifications are, the iOS note and "Turn on
 *   notifications" (the permission prompt comes from that tap);
 * - on: the summary and daily reminder switches (saved at once, rolled back
 *   when the API refuses), the reminder time in the household time zone,
 *   and "Turn off on this device".
 * The preferences belong to the person; "on" belongs to this device.
 * Scoped key used from TypeScript, declared for transloco-keys-manager:
 * t(notifications.enableFailed)
 */
@Component({
  selector: 'app-notifications-section',
  imports: [
    ButtonComponent,
    CardComponent,
    CheckboxComponent,
    IconComponent,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [
    provideTranslocoScope({
      scope: 'notifications',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  template: `
    <app-card class="gap-3!" data-testid="settings.notifications">
      <h2 class="text-body text-ink-1">{{ 'notifications.title' | transloco }}</h2>

      @switch (state()) {
        @case ('loading') {
          <div data-testid="notifications.loading" role="status" class="flex flex-col gap-2">
            <span class="sr-only">{{ 'notifications.loading' | transloco }}</span>
            <app-skeleton height="16px" />
            <app-skeleton width="60%" height="16px" />
          </div>
        }
        @case ('unsupported') {
          <p
            data-testid="notifications.unsupported"
            class="flex items-start gap-2 text-caption text-ink-2"
          >
            <app-icon name="info" [size]="16" class="mt-0.5 shrink-0" />
            <span>{{
              (install.showIosHint() ? 'notifications.unsupportedIos' : 'notifications.unsupported')
                | transloco
            }}</span>
          </p>
        }
        @case ('unavailable') {
          <p data-testid="notifications.unavailable" class="text-caption text-ink-2">
            {{ 'notifications.unavailable' | transloco }}
          </p>
        }
        @case ('denied') {
          <p
            data-testid="notifications.denied"
            class="flex items-start gap-2 text-caption text-ink-2"
          >
            <app-icon name="lock" [size]="16" class="mt-0.5 shrink-0" />
            <span>{{ 'notifications.denied' | transloco }}</span>
          </p>
        }
        @case ('off') {
          <p class="text-caption text-ink-2">{{ 'notifications.intro' | transloco }}</p>
          <p data-testid="notifications.iosHint" class="text-caption text-ink-3">
            {{ 'notifications.iosHint' | transloco }}
          </p>
          <button
            appButton
            type="button"
            variant="secondary"
            data-testid="notifications.enable"
            [loading]="busy()"
            (click)="enable()"
          >
            {{ 'notifications.enable' | transloco }}
          </button>
        }
        @case ('on') {
          <p
            data-testid="notifications.enabled"
            class="flex items-center gap-2 text-caption text-ink-2"
          >
            <app-icon name="circle-check" [size]="16" class="shrink-0 text-status-good" />
            <span>{{ 'notifications.enabled' | transloco }}</span>
          </p>
          <!-- Keyed by revision: a rolled-back switch is drawn again from the saved value. -->
          @for (current of preferences(); track current.revision) {
            <app-checkbox
              data-testid="notifications.summary"
              [checked]="current.summaryReady"
              (checkedChange)="change({ summaryReady: $event })"
            >
              <span class="flex flex-col">
                <span>{{ 'notifications.summary' | transloco }}</span>
                <span class="text-caption text-ink-3">{{
                  'notifications.summaryHint' | transloco
                }}</span>
              </span>
            </app-checkbox>
            <app-checkbox
              data-testid="notifications.reminder"
              [checked]="current.dailyReminder"
              (checkedChange)="change({ dailyReminder: $event })"
            >
              <span class="flex flex-col">
                <span>{{ 'notifications.reminder' | transloco }}</span>
                <span class="text-caption text-ink-3">{{
                  'notifications.reminderHint' | transloco
                }}</span>
              </span>
            </app-checkbox>
            @if (current.dailyReminder) {
              <div class="flex flex-col gap-1 pl-8">
                <div class="flex items-center justify-between gap-3">
                  <label [for]="timeId" class="text-body text-ink-1">{{
                    'notifications.reminderTime' | transloco
                  }}</label>
                  <input
                    type="time"
                    step="300"
                    min="00:00"
                    [max]="latestTime"
                    data-testid="notifications.reminderTime"
                    class="h-11 rounded-md border border-line-strong bg-surface-1 px-3 text-body text-ink-1 tabular-nums"
                    [id]="timeId"
                    [value]="current.reminderTime"
                    [attr.aria-describedby]="zoneId"
                    (change)="changeTime($event)"
                  />
                </div>
                <p [id]="zoneId" class="text-caption text-ink-3">
                  {{ 'notifications.timeZone' | transloco: { zone: timeZone() } }}
                </p>
              </div>
            }
          }
          <button
            appButton
            type="button"
            variant="link"
            class="-ml-3 self-start"
            data-testid="notifications.disable"
            [disabled]="busy()"
            (click)="disable()"
          >
            {{ 'notifications.disable' | transloco }}
          </button>
        }
      }
    </app-card>
  `,
})
export class NotificationsSectionComponent implements OnInit {
  private readonly push = inject(PushService)
  private readonly api = inject(PushApi)
  private readonly session = inject(SessionStore)
  private readonly toasts = inject(ToastStore)
  protected readonly install = inject(InstallService)

  protected readonly state = signal<SectionState>('loading')
  protected readonly settings = signal<NotificationSettings | null>(null)
  protected readonly busy = signal(false)
  /**
   * Bumped when a change is rolled back: a checkbox keeps the state the tap
   * gave it when the bound value ends where it started, so the switches are
   * drawn again.
   */
  private readonly revision = signal(0)
  protected readonly preferences = computed(() => {
    const settings = this.settings()
    return settings ? [{ ...settings, revision: this.revision() }] : []
  })
  protected readonly timeZone = computed(
    () => this.session.household()?.timezone.replaceAll('_', ' ') ?? ''
  )

  protected readonly latestTime = LATEST_REMINDER_TIME
  protected readonly timeId = `notifications-time-${nextId}`
  protected readonly zoneId = `notifications-zone-${nextId++}`

  async ngOnInit(): Promise<void> {
    let state: PushState
    try {
      state = await this.push.state()
    } catch {
      // A rotated key could not be registered: offer to turn it on again.
      state = 'off'
    }
    await this.show(state)
  }

  /** From the tap: the permission prompt must come from the gesture (iOS). */
  protected async enable(): Promise<void> {
    if (this.busy()) {
      return
    }
    this.busy.set(true)
    try {
      await this.show(await this.push.enable())
    } catch {
      this.toasts.show({ messageKey: 'notifications.enableFailed', status: 'critical' })
    } finally {
      this.busy.set(false)
    }
  }

  protected async disable(): Promise<void> {
    if (this.busy()) {
      return
    }
    this.busy.set(true)
    try {
      await this.show(await this.push.disable())
    } finally {
      this.busy.set(false)
    }
  }

  /** Saves one switch at once; the API's answer wins, a refusal rolls it back. */
  protected async change(changes: Partial<NotificationSettings>): Promise<void> {
    const previous = this.settings()
    if (!previous) {
      return
    }
    this.settings.set({ ...previous, ...changes })
    try {
      this.settings.set(await this.api.updateSettings(changes))
    } catch (error) {
      this.settings.set(previous)
      this.revision.update((value) => value + 1)
      const message = failureMessage(toApiError(error))
      this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
    }
  }

  /** A time after 23:30 becomes 23:30 (a later one could miss the last tick before midnight). */
  protected changeTime(event: Event): void {
    const input = event.target as HTMLInputElement
    const value = input.value > LATEST_REMINDER_TIME ? LATEST_REMINDER_TIME : input.value
    input.value = value || (this.settings()?.reminderTime ?? '')
    if (isReminderTime(value) && value !== this.settings()?.reminderTime) {
      void this.change({ reminderTime: value })
    }
  }

  private async show(state: PushState): Promise<void> {
    if (state === 'on' && !this.settings()) {
      try {
        this.settings.set(await this.api.settings())
      } catch (error) {
        const message = failureMessage(toApiError(error))
        this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
      }
    }
    if (state !== 'on') {
      this.settings.set(null)
    }
    this.state.set(state)
  }
}
