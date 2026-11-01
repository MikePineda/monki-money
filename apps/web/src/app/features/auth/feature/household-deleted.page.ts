import { Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { firstValueFrom } from 'rxjs'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { canManageHousehold } from '../../../core/auth/entitlements'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { ToastStore } from '../../../core/ui/toast.store'
import { formatDay } from '../../../domain/dates'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { openConfirmSheet } from '../../../shared/ui/confirm-sheet/confirm-sheet.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { provideAuthScope } from '../auth.scope'

/**
 * Scoped keys used from TypeScript:
 * t(auth.deleted.body, auth.deleted.memberBody, auth.deleted.restored, auth.deleted.expired)
 * t(auth.deleted.leaveSheet.title, auth.deleted.leaveSheet.body, auth.deleted.leaveSheet.confirm)
 * t(auth.deleted.leaveSheet.cancel, auth.deleted.ownerCannot)
 */

/**
 * The household is scheduled for deletion (30-day window). The owner can
 * restore it; a member is told who can, and may leave it instead (asked
 * first; then on to creating or joining another household). Everything
 * else in the app is closed meanwhile (the API answers 403 for every other
 * household route).
 */
@Component({
  selector: 'app-household-deleted-page',
  imports: [BannerComponent, ButtonComponent, EmptyStateComponent, TranslocoPipe],
  providers: [provideAuthScope()],
  template: `
    <app-empty-state
      data-testid="deleted.state"
      icon="trash-2"
      [title]="'auth.deleted.title' | transloco: { name: name() }"
      [body]="bodyKey() | transloco: { date: date() }"
    />
    @if (failure(); as message) {
      <app-banner status="critical" [message]="message.key | transloco: message.params ?? {}" />
    }
    <div class="mt-auto flex flex-col gap-2 pt-8">
      @if (isOwner()) {
        <button
          appButton
          type="button"
          size="block"
          icon="refresh-cw"
          data-testid="deleted.restore"
          [loading]="restoring()"
          (click)="restore()"
        >
          {{ 'auth.deleted.restore' | transloco }}
        </button>
      }
      @if (canLeave()) {
        <button
          appButton
          type="button"
          size="block"
          variant="secondary"
          icon="log-out"
          data-testid="deleted.leave"
          [loading]="leaving()"
          (click)="leave()"
        >
          {{ 'auth.deleted.leave' | transloco }}
        </button>
      }
      <button
        appButton
        type="button"
        variant="ghost"
        data-testid="deleted.logout"
        (click)="session.logout()"
      >
        {{ 'auth.deleted.logout' | transloco }}
      </button>
    </div>
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class HouseholdDeletedPage {
  protected readonly session = inject(SessionStore)
  private readonly households = inject(HouseholdApi)
  private readonly router = inject(Router)
  private readonly toasts = inject(ToastStore)
  private readonly locale = inject(APP_LOCALE)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)

  protected readonly isOwner = computed(() => canManageHousehold(this.session.role()))
  /** Owners cannot leave (422 `E_OWNER_CANNOT_LEAVE`); a handover is closed while pending deletion. */
  protected readonly canLeave = computed(() => this.session.role() !== null && !this.isOwner())
  protected readonly bodyKey = computed(() =>
    this.isOwner() ? 'auth.deleted.body' : 'auth.deleted.memberBody'
  )
  protected readonly name = computed(() => this.session.household()?.name ?? '')
  protected readonly date = computed(() => {
    const household = this.session.household()
    return household?.deletionScheduledAt
      ? formatDay(household.deletionScheduledAt, this.locale(), household.timezone)
      : ''
  })

  protected readonly restoring = signal(false)
  protected readonly leaving = signal(false)
  protected readonly failure = signal<Message | null>(null)

  protected async restore(): Promise<void> {
    this.restoring.set(true)
    this.failure.set(null)
    try {
      await this.households.restore()
      await this.session.load()
      this.toasts.show({ messageKey: 'auth.deleted.restored', status: 'good' })
      await this.router.navigateByUrl(this.session.homePath())
    } catch (error) {
      const failure = toApiError(error)
      this.failure.set(
        hasStatus(failure, 410) ? { key: 'auth.deleted.expired' } : failureMessage(failure)
      )
    } finally {
      this.restoring.set(false)
    }
  }

  /** Asks first; leaving drops the membership, then the session says "no household". */
  protected async leave(): Promise<void> {
    if (this.leaving()) {
      return
    }
    const name = this.name()
    const confirmed = await firstValueFrom(
      openConfirmSheet(this.sheets, {
        title: this.t('auth.deleted.leaveSheet.title', { name }),
        body: this.t('auth.deleted.leaveSheet.body', { name }),
        confirmLabel: this.t('auth.deleted.leaveSheet.confirm'),
        cancelLabel: this.t('auth.deleted.leaveSheet.cancel'),
        destructive: true,
      })
    )
    if (!confirmed) {
      return
    }
    this.leaving.set(true)
    this.failure.set(null)
    try {
      await this.households.leave()
      await this.session.load()
      await this.router.navigateByUrl(this.session.homePath())
    } catch (error) {
      const failure = toApiError(error)
      // 422 E_OWNER_CANNOT_LEAVE: only if the role changed under this screen.
      this.failure.set(
        failure.kind === 'validation'
          ? { key: 'auth.deleted.ownerCannot' }
          : failureMessage(failure)
      )
    } finally {
      this.leaving.set(false)
    }
  }

  private t(key: string, params?: Record<string, string>): string {
    return this.transloco.translate(key, params)
  }
}
