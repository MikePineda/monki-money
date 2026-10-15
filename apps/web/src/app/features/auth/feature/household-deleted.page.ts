import { Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { canManageHousehold } from '../../../core/auth/entitlements'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { ToastStore } from '../../../core/ui/toast.store'
import { formatDay } from '../../../domain/dates'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { provideAuthScope } from '../auth.scope'

/**
 * Scoped keys used from TypeScript:
 * t(auth.deleted.body, auth.deleted.memberBody, auth.deleted.restored, auth.deleted.expired)
 */

/**
 * The household is scheduled for deletion (30-day window). The owner can
 * restore it; a member is told who can. Everything else in the app is
 * closed meanwhile (the API answers 403 for every other household route).
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
      <button appButton type="button" variant="ghost" (click)="session.logout()">
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

  protected readonly isOwner = computed(() => canManageHousehold(this.session.role()))
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
}
