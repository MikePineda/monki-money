import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco'
import {
  EVERY_WEEKDAY,
  LATEST_REMINDER_TIME,
  isReminderTime,
  type NotificationSettings,
  type Weekday,
} from '@monkimoney/shared'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { SessionStore } from '../../../core/auth/session.store'
import { PushApi, type PushDevice } from '../../../core/push/push.api'
import { PushService, type PushState } from '../../../core/push/push.service'
import { InstallService } from '../../../core/pwa/install.service'
import { ToastStore } from '../../../core/ui/toast.store'
import { IconComponent } from '../../../shared/icons/icon.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CardComponent } from '../../../shared/ui/card/card.component'
import { CheckboxComponent } from '../../../shared/ui/checkbox/checkbox.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { relativeTime } from '../../../domain/relative-time'
import { toggleWeekday, weekdayNames } from '../../../domain/reminder-weekdays'
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
 *   when the API refuses), the reminder time in the household time zone and
 *   the weekdays it goes out on (at least one), and "Turn off on this
 *   device".
 * In every state the person's devices are listed (browser and platform,
 * last notification, this one marked) with a remove each; removing this
 * device turns notifications off here.
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
    ChipComponent,
    IconButtonComponent,
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
                <div
                  role="group"
                  data-testid="notifications.weekdays"
                  class="mt-2 flex flex-col gap-2"
                  [attr.aria-labelledby]="daysId"
                >
                  <span [id]="daysId" class="text-body text-ink-1">{{
                    'notifications.reminderDays' | transloco
                  }}</span>
                  <div class="flex flex-wrap gap-2">
                    @for (weekday of weekdays(); track weekday.day) {
                      <button
                        appChip
                        pressable
                        [selected]="current.reminderWeekdays.includes(weekday.day)"
                        [disabled]="isOnlyDay(current.reminderWeekdays, weekday.day)"
                        [attr.aria-label]="weekday.long"
                        [attr.data-testid]="'notifications.weekday.' + weekday.day"
                        (click)="changeWeekday(current.reminderWeekdays, weekday.day)"
                      >
                        {{ weekday.short }}
                      </button>
                    }
                  </div>
                </div>
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

      @if (state() !== 'loading' && devices().length > 0) {
        <section
          data-testid="notifications.devices"
          class="flex flex-col gap-1 border-t border-line pt-3"
          [attr.aria-labelledby]="devicesId"
        >
          <h3 [id]="devicesId" class="text-label text-ink-2">
            {{ 'notifications.devices.title' | transloco }}
          </h3>
          <ul class="flex flex-col">
            @for (device of devices(); track device.id) {
              @let name =
                device.browser && device.platform
                  ? ('notifications.devices.label'
                    | transloco: { browser: device.browser, platform: device.platform })
                  : (device.browser ??
                    device.platform ??
                    ('notifications.devices.unknown' | transloco));
              <li
                class="flex items-center gap-3 py-1"
                [attr.data-testid]="'notifications.device.' + device.id"
              >
                <app-icon name="smartphone" [size]="20" class="shrink-0 text-ink-2" />
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-body text-ink-1">
                    {{ name }}
                    @if (device.id === push.deviceId()) {
                      <span class="text-caption text-accent">
                        · {{ 'notifications.devices.thisDevice' | transloco }}</span
                      >
                    }
                  </span>
                  <span class="text-caption text-ink-3">
                    @if (device.lastUsedAt) {
                      {{
                        'notifications.devices.lastUsed'
                          | transloco: { when: lastUsed(device.lastUsedAt) }
                      }}
                    } @else {
                      {{ 'notifications.devices.neverUsed' | transloco }}
                    }
                  </span>
                </div>
                <button
                  appIconButton
                  type="button"
                  icon="delete"
                  data-testid="notifications.removeDevice"
                  [label]="'notifications.devices.remove' | transloco: { device: name }"
                  [disabled]="busy()"
                  (click)="removeDevice(device)"
                ></button>
              </li>
            }
          </ul>
        </section>
      }
    </app-card>
  `,
})
export class NotificationsSectionComponent implements OnInit {
  protected readonly push = inject(PushService)
  private readonly api = inject(PushApi)
  private readonly session = inject(SessionStore)
  private readonly toasts = inject(ToastStore)
  protected readonly install = inject(InstallService)
  private readonly locale = inject(APP_LOCALE)

  protected readonly state = signal<SectionState>('loading')
  protected readonly settings = signal<NotificationSettings | null>(null)
  protected readonly busy = signal(false)
  /** The person's devices in this household; empty until loaded (or when the API is unreachable). */
  protected readonly devices = signal<PushDevice[]>([])
  /** The picker's seven chips, Monday first, named in the reader's language. */
  protected readonly weekdays = computed(() => {
    const short = weekdayNames(this.locale(), 'short')
    const long = weekdayNames(this.locale(), 'long')
    return EVERY_WEEKDAY.map((day, index) => ({ day, short: short[index], long: long[index] }))
  })
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
  protected readonly zoneId = `notifications-zone-${nextId}`
  protected readonly daysId = `notifications-days-${nextId}`
  protected readonly devicesId = `notifications-devices-${nextId++}`

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

  /** Switches one weekday of the reminder; the last chosen one stays (its chip is disabled). */
  protected changeWeekday(days: Weekday[], day: Weekday): void {
    const next = toggleWeekday(days, day)
    if (next.length !== days.length) {
      void this.change({ reminderWeekdays: next })
    }
  }

  protected isOnlyDay(days: Weekday[], day: Weekday): boolean {
    return days.length === 1 && days[0] === day
  }

  /** "yesterday", "hace 2 horas". */
  protected lastUsed(timestamp: string): string {
    return relativeTime(timestamp, new Date(), this.locale())
  }

  /**
   * Forgets one of the person's devices. This one is turned off instead
   * (the browser unsubscribes too, or it would keep a subscription the API
   * no longer knows).
   */
  protected async removeDevice(device: PushDevice): Promise<void> {
    if (this.busy()) {
      return
    }
    if (device.id === this.push.deviceId()) {
      await this.disable()
      return
    }
    this.busy.set(true)
    try {
      await this.api.removeDevice(device.id)
      this.devices.update((list) => list.filter((listed) => listed.id !== device.id))
    } catch (error) {
      const message = failureMessage(toApiError(error))
      this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
    } finally {
      this.busy.set(false)
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
    await this.loadDevices()
  }

  /** After the state: a device that just registered is in the list. Best effort. */
  private async loadDevices(): Promise<void> {
    try {
      this.devices.set(await this.api.devices())
    } catch {
      this.devices.set([])
    }
  }
}
