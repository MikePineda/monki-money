import { DOCUMENT, Component, Injector, OnInit, computed, inject, signal } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { Observable } from 'rxjs'
import type { Invitation, Member } from '../../../core/api/api-types'
import { failureMessage } from '../../../core/api/error-messages'
import { hasStatus, toApiError, type ApiError } from '../../../core/api/http-errors'
import { AuthApi } from '../../../core/auth/auth.api'
import { canInvite, canManageHousehold } from '../../../core/auth/entitlements'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { LangStore } from '../../../core/i18n/lang.store'
import { downloadBlob } from '../../../core/platform/download'
import { InstallService } from '../../../core/pwa/install.service'
import { UpdateService } from '../../../core/pwa/update.service'
import { ThemeStore, type ThemePreference } from '../../../core/theme/theme.store'
import { ToastStore } from '../../../core/ui/toast.store'
import { formatDay } from '../../../domain/dates'
import type { AppLang } from '../../../domain/locale'
import { initial } from '../../../domain/people'
import { supportedTimeZones } from '../../../domain/time-zones'
import { IconComponent } from '../../../shared/icons/icon.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CardComponent } from '../../../shared/ui/card/card.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { PersonDotComponent } from '../../../shared/ui/person-dot/person-dot.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { provideSettingsScope } from '../settings.scope'
import {
  DeleteHouseholdSheetComponent,
  type DeleteHouseholdSheetData,
  type DeleteOutcome,
} from '../ui/delete-household-sheet.component'
import {
  LeaveHouseholdSheetComponent,
  type LeaveHouseholdSheetData,
} from '../ui/leave-household-sheet.component'
import { SettingsRowComponent } from '../ui/settings-row.component'
import { TextInputSheetComponent, type TextInputSheetData } from '../ui/text-input-sheet.component'

/**
 * Scoped keys used from TypeScript. translateSignal() adds the "settings."
 * scope prefix itself (relative keys below); toasts, sheet titles and role
 * labels take full keys. Declared for transloco-keys-manager:
 * t(settings.appearance.light, settings.appearance.dark, settings.appearance.system)
 * t(settings.profile.languages.en, settings.profile.languages.es, settings.profile.language)
 * t(settings.profile.nameSheet.title, settings.profile.nameSheet.label, settings.save)
 * t(settings.household.nameSheet.title, settings.household.nameSheet.label)
 * t(settings.household.timezone, settings.household.roles.owner, settings.household.roles.member)
 * t(settings.household.invite.sheetTitle, settings.household.invite.email)
 * t(settings.household.invite.send, settings.household.invite.sent, settings.household.invite.full)
 * t(settings.app.upToDate, settings.app.updateFailed, settings.app.updateUnsupported)
 * t(settings.danger.sheet.wrongPassword, settings.errors.invalid)
 * t(settings.danger.leaveSheet.ownerCannot)
 */
const THEME_KEYS = ['appearance.light', 'appearance.dark', 'appearance.system']
const LANGUAGE_KEYS = ['profile.languages.en', 'profile.languages.es']

/**
 * Settings (DESIGN mock `settings`), one scrolling page of cards: profile
 * (name, language, password), appearance, the household (name, time zone,
 * members, invitations), accounts, the app (install, version, updates),
 * legal, and the danger zone (the owner exports or deletes, a member
 * leaves). Every change saves at once; owner-only controls are hidden from
 * members (the API enforces the same rule).
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    ButtonComponent,
    CardComponent,
    IconButtonComponent,
    IconComponent,
    PersonDotComponent,
    RouterLink,
    SegmentedControlComponent,
    SettingsRowComponent,
    TranslocoPipe,
  ],
  providers: [provideSettingsScope()],
  template: `
    <header class="flex h-14 items-center pr-1 pl-4">
      <h1 class="text-title text-ink-1">{{ 'settings.title' | transloco }}</h1>
    </header>

    <div class="flex flex-col gap-4 px-gutter pt-2 pb-8">
      <!-- Profile -->
      <app-card class="gap-0! overflow-hidden p-0!" data-testid="settings.profile">
        <button
          type="button"
          class="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
          data-testid="settings.name"
          [attr.aria-label]="'settings.profile.editName' | transloco"
          (click)="editName()"
        >
          <span
            class="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-body-strong text-ink-1"
            aria-hidden="true"
            >{{ initial() }}</span
          >
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-body text-ink-1" data-testid="settings.fullName">{{
              user()?.fullName
            }}</span>
            <span class="truncate text-caption text-ink-3">{{ user()?.email }}</span>
          </span>
          <app-icon name="pencil" class="text-ink-2" />
        </button>
        <button
          appSettingsRow
          type="button"
          data-testid="settings.language"
          [value]="languageName()"
          (click)="chooseLanguage()"
        >
          {{ 'settings.profile.language' | transloco }}
        </button>
        <a appSettingsRow data-testid="settings.password" routerLink="/settings/password">
          {{ 'settings.profile.password' | transloco }}
        </a>
      </app-card>

      <!-- Appearance -->
      <app-card class="gap-3!">
        <h2 class="text-body text-ink-1">{{ 'settings.appearance.title' | transloco }}</h2>
        <app-segmented-control
          data-testid="settings.theme"
          [label]="'settings.appearance.title' | transloco"
          [options]="themeOptions()"
          [value]="themePreference()"
          (valueChange)="setTheme($event)"
        />
      </app-card>

      <!-- Household -->
      @if (household(); as home) {
        <app-card class="gap-0! overflow-hidden p-0!" data-testid="settings.household">
          @if (isOwner()) {
            <button
              appSettingsRow
              type="button"
              trailing="pencil"
              data-testid="settings.householdName"
              (click)="editHouseholdName()"
            >
              {{ home.name }}
            </button>
            <button
              appSettingsRow
              type="button"
              data-testid="settings.timezone"
              [value]="home.timezone"
              (click)="chooseTimeZone()"
            >
              {{ 'settings.household.timezone' | transloco }}
            </button>
          } @else {
            <div class="flex flex-col gap-0.5 px-4 py-3">
              <p class="text-body text-ink-1">{{ home.name }}</p>
              <p class="text-caption text-ink-3">{{ home.currencyCode }} · {{ home.timezone }}</p>
            </div>
          }

          <ul class="border-t border-line" data-testid="settings.members">
            @for (row of memberRows(); track row.member.id) {
              <li
                class="flex h-12 items-center gap-3 px-4 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line"
              >
                <app-person-dot [person]="row.person" />
                <span class="min-w-0 flex-1 truncate text-body text-ink-1">
                  {{ row.member.fullName }}
                  @if (row.isYou) {
                    <span class="text-ink-3">· {{ 'settings.household.you' | transloco }}</span>
                  }
                </span>
                <span class="text-body text-ink-2">{{ row.roleKey | transloco }}</span>
              </li>
            }
          </ul>

          @if (isOwner() && invitationRows().length > 0) {
            <p class="border-t border-line px-4 pt-3 text-eyebrow text-ink-2 uppercase">
              {{ 'settings.household.invite.pending' | transloco }}
            </p>
            <ul data-testid="settings.invitations">
              @for (row of invitationRows(); track row.invitation.id) {
                <li class="flex items-center gap-1 py-1 pr-1 pl-4">
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-body text-ink-1">{{ row.invitation.email }}</span>
                    <span class="text-caption text-ink-3">{{
                      'settings.household.invite.expires' | transloco: { date: row.expires }
                    }}</span>
                  </span>
                  <button
                    appIconButton
                    type="button"
                    icon="send"
                    data-testid="settings.invitationResend"
                    [label]="'settings.household.invite.resend' | transloco"
                    [disabled]="busy()"
                    (click)="resend(row.invitation)"
                  ></button>
                  <button
                    appIconButton
                    type="button"
                    icon="x"
                    data-testid="settings.invitationRevoke"
                    [label]="'settings.household.invite.revoke' | transloco"
                    [disabled]="busy()"
                    (click)="revoke(row.invitation)"
                  ></button>
                </li>
              }
            </ul>
          }

          @if (canInvite()) {
            <div class="border-t border-line p-4">
              <button
                appButton
                type="button"
                variant="secondary"
                icon="user-plus"
                class="w-full"
                data-testid="settings.invite"
                (click)="invite()"
              >
                {{ 'settings.household.invite.action' | transloco }}
              </button>
            </div>
          }
        </app-card>
      }

      <!-- Accounts and plan -->
      <app-card class="gap-0! overflow-hidden p-0!">
        <a appSettingsRow data-testid="settings.accounts" routerLink="/settings/accounts">
          {{ 'settings.accounts.title' | transloco }}
        </a>
        <a appSettingsRow data-testid="settings.categories" routerLink="/categories">
          {{ 'settings.categories.title' | transloco }}
        </a>
        <a appSettingsRow data-testid="settings.goals" routerLink="/goals">
          {{ 'settings.goals.title' | transloco }}
        </a>
        <a appSettingsRow data-testid="settings.import" routerLink="/import">
          {{ 'settings.import.title' | transloco }}
        </a>
        <a appSettingsRow data-testid="settings.rules" routerLink="/settings/rules">
          {{ 'settings.rules.title' | transloco }}
        </a>
        @if (showUpgrade()) {
          <a appSettingsRow data-testid="settings.upgrade" routerLink="/upgrade">
            {{ 'settings.upgrade.row' | transloco }}
          </a>
        }
      </app-card>

      <!-- App -->
      <app-card class="gap-0! overflow-hidden p-0!" data-testid="settings.app">
        @if (install.canPrompt()) {
          <button
            appSettingsRow
            type="button"
            trailing="download"
            data-testid="settings.install"
            (click)="promptInstall()"
          >
            {{ 'settings.app.install' | transloco }}
          </button>
        } @else if (install.installed()) {
          <div appSettingsRow [trailing]="null" [value]="'settings.app.installed' | transloco">
            {{ 'settings.app.install' | transloco }}
          </div>
        } @else if (install.showIosHint()) {
          <div class="flex flex-col gap-0.5 px-4 py-3">
            <p class="text-body text-ink-1">{{ 'settings.app.install' | transloco }}</p>
            <p class="text-caption text-ink-3">{{ 'settings.app.iosHint' | transloco }}</p>
          </div>
        }
        <div appSettingsRow data-testid="settings.version" [trailing]="null" [value]="version()">
          {{ 'settings.app.version' | transloco }}
        </div>
        <button
          appSettingsRow
          type="button"
          trailing="refresh-cw"
          data-testid="settings.checkUpdate"
          (click)="checkForUpdate()"
        >
          {{ 'settings.app.checkUpdate' | transloco }}
        </button>
      </app-card>

      <!-- Legal -->
      <app-card class="gap-0! overflow-hidden p-0!">
        <a appSettingsRow routerLink="/legal/terms">{{ 'settings.legal.terms' | transloco }}</a>
        <a appSettingsRow routerLink="/legal/privacy">{{ 'settings.legal.privacy' | transloco }}</a>
      </app-card>

      <!-- Danger zone -->
      @if (isOwner()) {
        <app-card class="gap-3!" data-testid="settings.danger">
          <h2 class="text-body text-ink-1">{{ 'settings.danger.title' | transloco }}</h2>
          <p class="text-caption text-ink-3">{{ 'settings.danger.body' | transloco }}</p>
          <button
            appButton
            type="button"
            variant="secondary"
            icon="download"
            data-testid="settings.export"
            [loading]="busy()"
            (click)="exportData()"
          >
            {{ 'settings.danger.export' | transloco }}
          </button>
          <button
            appButton
            type="button"
            variant="destructive"
            data-testid="settings.delete"
            (click)="deleteHousehold()"
          >
            {{ 'settings.danger.delete' | transloco }}
          </button>
        </app-card>
      } @else if (isMember()) {
        <app-card class="gap-3!" data-testid="settings.danger">
          <h2 class="text-body text-ink-1">{{ 'settings.danger.title' | transloco }}</h2>
          <p class="text-caption text-ink-3">{{ 'settings.danger.memberBody' | transloco }}</p>
          <button
            appButton
            type="button"
            variant="destructive"
            icon="log-out"
            data-testid="settings.leave"
            (click)="leaveHousehold()"
          >
            {{ 'settings.danger.leave' | transloco }}
          </button>
        </app-card>
      }

      <button
        appButton
        type="button"
        variant="secondary"
        icon="log-out"
        class="w-full"
        data-testid="settings.logout"
        (click)="logout()"
      >
        {{ 'settings.logout' | transloco }}
      </button>
    </div>
  `,
})
export default class SettingsPage implements OnInit {
  protected readonly session = inject(SessionStore)
  private readonly auth = inject(AuthApi)
  private readonly households = inject(HouseholdApi)
  private readonly theme = inject(ThemeStore)
  private readonly lang = inject(LangStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly toasts = inject(ToastStore)
  private readonly transloco = inject(TranslocoService)
  private readonly injector = inject(Injector)
  private readonly document = inject(DOCUMENT)
  private readonly locale = inject(APP_LOCALE)
  protected readonly install = inject(InstallService)
  private readonly updates = inject(UpdateService)
  private readonly router = inject(Router)

  private readonly themeLabels = translateSignal(THEME_KEYS)
  private readonly languageLabels = translateSignal(LANGUAGE_KEYS)

  protected readonly user = this.session.user
  protected readonly household = this.session.household
  protected readonly isOwner = computed(() => canManageHousehold(this.session.role()))
  protected readonly isMember = computed(() => this.session.role() === 'member')
  protected readonly initial = computed(() => initial(this.user()?.fullName ?? ''))
  protected readonly showUpgrade = computed(() => this.session.hasFlag('billing'))

  protected readonly members = signal<Member[]>([])
  protected readonly invitations = signal<Invitation[]>([])
  protected readonly version = signal('')
  protected readonly busy = signal(false)

  protected readonly canInvite = computed(() =>
    canInvite(this.session.role(), this.members().length, this.session.entitlements())
  )

  protected readonly memberRows = computed(() => {
    const youId = this.user()?.id
    return this.members().map((member, index) => ({
      member,
      isYou: member.userId === youId,
      person: index === 0 ? ('a' as const) : ('b' as const),
      roleKey:
        member.role === 'owner'
          ? 'settings.household.roles.owner'
          : 'settings.household.roles.member',
    }))
  })

  protected readonly invitationRows = computed(() => {
    const household = this.household()
    return this.invitations().map((invitation) => ({
      invitation,
      expires: household
        ? formatDay(invitation.expiresAt, this.locale(), household.timezone)
        : invitation.expiresAt,
    }))
  })

  protected readonly languageName = computed(() => {
    const [en = '', es = ''] = this.languageLabels()
    return this.lang.lang() === 'es' ? es : en
  })

  protected readonly themeOptions = computed<SegmentOption<ThemePreference>[]>(() => {
    const [light = '', dark = '', system = ''] = this.themeLabels()
    return [
      { value: 'light', label: light },
      { value: 'dark', label: dark },
      { value: 'system', label: system },
    ]
  })
  protected readonly themePreference = this.theme.preference

  async ngOnInit(): Promise<void> {
    void this.loadVersion()
    await this.loadHousehold()
  }

  protected setTheme(preference: ThemePreference): void {
    this.theme.setPreference(preference)
  }

  protected chooseLanguage(): void {
    const [en = '', es = ''] = this.languageLabels()
    openSelectSheet<AppLang>(this.sheets, {
      title: this.t('settings.profile.language'),
      options: [
        { value: 'en', label: en },
        { value: 'es', label: es },
      ],
      selected: this.lang.lang(),
    }).subscribe((lang) => {
      if (lang) {
        this.lang.setLang(lang)
      }
    })
  }

  protected editName(): void {
    this.openTextSheet({
      title: this.t('settings.profile.nameSheet.title'),
      label: this.t('settings.profile.nameSheet.label'),
      submitLabel: this.t('settings.save'),
      value: this.user()?.fullName ?? '',
      testId: 'settings.nameSheet',
    }).subscribe((fullName) => {
      if (fullName) {
        void this.save(async () => {
          this.session.patchUser(await this.auth.updateProfile({ fullName }))
        })
      }
    })
  }

  protected editHouseholdName(): void {
    this.openTextSheet({
      title: this.t('settings.household.nameSheet.title'),
      label: this.t('settings.household.nameSheet.label'),
      submitLabel: this.t('settings.save'),
      value: this.household()?.name ?? '',
      testId: 'settings.householdSheet',
    }).subscribe((name) => {
      if (name) {
        void this.save(async () => {
          this.session.patchHousehold(await this.households.update({ name }))
        })
      }
    })
  }

  protected chooseTimeZone(): void {
    openSelectSheet(this.sheets, {
      title: this.t('settings.household.timezone'),
      options: supportedTimeZones().map((zone) => ({
        value: zone,
        label: zone.replaceAll('_', ' '),
      })),
      selected: this.household()?.timezone ?? null,
    }).subscribe((timezone) => {
      if (timezone) {
        void this.save(async () => {
          this.session.patchHousehold(await this.households.update({ timezone }))
        })
      }
    })
  }

  protected invite(): void {
    this.openTextSheet({
      title: this.t('settings.household.invite.sheetTitle'),
      label: this.t('settings.household.invite.email'),
      submitLabel: this.t('settings.household.invite.send'),
      type: 'email',
      testId: 'settings.inviteSheet',
    }).subscribe((email) => {
      if (email) {
        void this.save(async () => {
          await this.households.invite(email)
          this.toasts.show({
            messageKey: 'settings.household.invite.sent',
            params: { email },
            status: 'good',
          })
          await this.loadHousehold()
        })
      }
    })
  }

  protected resend(invitation: Invitation): void {
    void this.save(async () => {
      await this.households.resendInvitation(invitation.id)
      this.toasts.show({
        messageKey: 'settings.household.invite.sent',
        params: { email: invitation.email },
        status: 'good',
      })
      await this.loadHousehold()
    })
  }

  protected revoke(invitation: Invitation): void {
    void this.save(async () => {
      await this.households.revokeInvitation(invitation.id)
      this.invitations.update((list) => list.filter((item) => item.id !== invitation.id))
    })
  }

  protected async promptInstall(): Promise<void> {
    await this.install.prompt()
  }

  protected async checkForUpdate(): Promise<void> {
    const result = await this.updates.checkNow()
    const keys = {
      latest: 'settings.app.upToDate',
      failed: 'settings.app.updateFailed',
      unsupported: 'settings.app.updateUnsupported',
    }
    // A found version announces itself with the "Update" toast.
    if (result !== 'found') {
      this.toasts.show({ messageKey: keys[result] })
    }
  }

  protected exportData(): void {
    void this.save(async () => {
      const blob = await this.households.export()
      const date = new Date().toISOString().slice(0, 10)
      downloadBlob(this.document, blob, `monkimoney-export-${date}.json`)
    })
  }

  protected deleteHousehold(): void {
    const household = this.household()
    if (!household) {
      return
    }
    const data: DeleteHouseholdSheetData = {
      householdName: household.name,
      confirm: (password) => this.scheduleDeletion(password),
    }
    this.sheets.open<boolean>(DeleteHouseholdSheetComponent, { data, injector: this.injector })
  }

  protected leaveHousehold(): void {
    const household = this.household()
    if (!household) {
      return
    }
    const data: LeaveHouseholdSheetData = {
      householdName: household.name,
      confirm: () => this.leave(),
    }
    this.sheets.open<boolean>(LeaveHouseholdSheetComponent, { data, injector: this.injector })
  }

  protected async logout(): Promise<void> {
    await this.session.logout()
  }

  private async scheduleDeletion(password: string): Promise<DeleteOutcome> {
    try {
      await this.households.scheduleDeletion(password)
      this.sheets.closeAll()
      // The session now says "pending deletion": go where it belongs.
      await this.session.load()
      return null
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        return {
          field: 'password',
          message: failure.fields['password'] ?? this.t('settings.danger.sheet.wrongPassword'),
        }
      }
      const message = failureMessage(failure)
      return { field: 'general', message: this.t(message.key, message.params) }
    }
  }

  /** Leaves, then goes where the session now belongs: creating a household. */
  private async leave(): Promise<string | null> {
    try {
      await this.households.leave()
    } catch (error) {
      const failure = toApiError(error)
      // 422 E_OWNER_CANNOT_LEAVE: only if the role changed under this screen.
      if (failure.kind === 'validation') {
        return this.t('settings.danger.leaveSheet.ownerCannot')
      }
      const message = failureMessage(failure)
      return this.t(message.key, message.params)
    }
    this.sheets.closeAll()
    await this.session.load()
    await this.router.navigateByUrl(this.session.homePath())
    return null
  }

  private openTextSheet(data: TextInputSheetData): Observable<string | undefined> {
    return this.sheets.open<string>(TextInputSheetComponent, { data, injector: this.injector })
      .closed
  }

  private async loadHousehold(): Promise<void> {
    try {
      const [members, invitations] = await Promise.all([
        this.households.members(),
        this.isOwner() ? this.households.invitations() : Promise.resolve([]),
      ])
      this.members.set(members)
      this.invitations.set(invitations)
    } catch (error) {
      this.showFailure(toApiError(error))
    }
  }

  private async loadVersion(): Promise<void> {
    try {
      this.version.set((await this.auth.health()).version)
    } catch {
      this.version.set('')
    }
  }

  /** Runs one change; a failure becomes a toast and the page keeps its state. */
  private async save(change: () => Promise<void>): Promise<void> {
    if (this.busy()) {
      return
    }
    this.busy.set(true)
    try {
      await change()
    } catch (error) {
      this.showFailure(toApiError(error))
    } finally {
      this.busy.set(false)
    }
  }

  private showFailure(failure: ApiError): void {
    if (failure.kind === 'unauthorized') {
      return
    }
    const fieldMessage =
      failure.kind === 'validation' ? Object.values(failure.fields)[0] : undefined
    if (fieldMessage) {
      this.toasts.show({
        messageKey: 'settings.errors.invalid',
        params: { message: fieldMessage },
        status: 'critical',
      })
    } else if (hasStatus(failure, 402)) {
      this.toasts.show({ messageKey: 'settings.household.invite.full', status: 'critical' })
    } else {
      const message = failureMessage(failure)
      this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
    }
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}
