import { Component, computed, inject, signal } from '@angular/core'
import { FormField, form, minLength, required } from '@angular/forms/signals'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { serverFieldErrors } from '../../../core/api/server-errors'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { PASSWORD_MIN_LENGTH, formMessages } from '../../../core/i18n/form-messages'
import { ToastStore } from '../../../core/ui/toast.store'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { provideSettingsScope } from '../settings.scope'

/** Scoped keys used from TypeScript: t(settings.password.changed) */

/**
 * Change password with the current one (`PATCH /me`). The API logs out the
 * other devices and keeps this one. Temporary passwords handed out at setup
 * are changed here.
 */
@Component({
  selector: 'app-password-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    FormField,
    IconButtonComponent,
    RouterLink,
    TextFieldComponent,
    TranslocoPipe,
  ],
  providers: [provideSettingsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-4 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings"
        [label]="'settings.back' | transloco"
      ></a>
      <h1 class="text-heading text-ink-1">{{ 'settings.password.title' | transloco }}</h1>
    </header>
    <form class="flex flex-col gap-4 px-gutter pt-4 pb-8" novalidate (submit)="submit($event)">
      <p class="text-body text-ink-2">{{ 'settings.password.body' | transloco }}</p>
      @if (failure(); as message) {
        <app-banner status="critical" [message]="message.key | transloco: message.params ?? {}" />
      }
      <app-text-field
        data-testid="password.current"
        type="password"
        autocomplete="current-password"
        [label]="'settings.password.current' | transloco"
        [formField]="passwordForm.currentPassword"
        [error]="fieldErrors()['currentPassword'] ?? ''"
      />
      <app-text-field
        data-testid="password.new"
        type="password"
        autocomplete="new-password"
        [label]="'settings.password.new' | transloco"
        [hint]="'settings.password.hint' | transloco"
        [formField]="passwordForm.password"
        [error]="fieldErrors()['password'] ?? ''"
      />
      <button
        appButton
        type="submit"
        size="block"
        class="mt-4"
        data-testid="password.submit"
        [disabled]="!canSubmit()"
        [loading]="saving()"
      >
        {{ 'settings.password.submit' | transloco }}
      </button>
    </form>
  `,
})
export default class PasswordPage {
  private readonly api = inject(AuthApi)
  private readonly session = inject(SessionStore)
  private readonly router = inject(Router)
  private readonly toasts = inject(ToastStore)

  private readonly messages = formMessages()
  protected readonly model = signal({ currentPassword: '', password: '' })
  protected readonly passwordForm = form(this.model, (path) => {
    required(path.currentPassword, { message: () => this.messages.required() })
    required(path.password, { message: () => this.messages.required() })
    minLength(path.password, PASSWORD_MIN_LENGTH, { message: () => this.messages.passwordMin() })
  })

  protected readonly saving = signal(false)
  protected readonly failure = signal<Message | null>(null)
  protected readonly fieldErrors = serverFieldErrors(this.model)
  protected readonly canSubmit = computed(() => !this.passwordForm().invalid() && !this.saving())

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault()
    if (!this.canSubmit()) {
      return
    }
    this.saving.set(true)
    this.failure.set(null)
    const { currentPassword, password } = this.model()
    try {
      this.session.patchUser(await this.api.updateProfile({ currentPassword, password }))
      this.toasts.show({ messageKey: 'settings.password.changed', status: 'good' })
      await this.router.navigateByUrl('/settings')
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.fieldErrors.set(failure.fields)
      } else {
        this.failure.set(failureMessage(failure))
      }
    } finally {
      this.saving.set(false)
    }
  }
}
