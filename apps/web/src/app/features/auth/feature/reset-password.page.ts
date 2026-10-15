import { Component, computed, inject, input, signal } from '@angular/core'
import { FormField, form, minLength, required } from '@angular/forms/signals'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { serverFieldErrors } from '../../../core/api/server-errors'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { PASSWORD_MIN_LENGTH, formMessages } from '../../../core/i18n/form-messages'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { provideAuthScope } from '../auth.scope'

type State = 'form' | 'done' | 'invalid'

/**
 * Choose a new password from the emailed link (`/reset-password/:token`,
 * one hour, single use). Success signs out every device, this one included,
 * so the next step is logging in again.
 */
@Component({
  selector: 'app-reset-password-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    EmptyStateComponent,
    FormField,
    RouterLink,
    TextFieldComponent,
    TranslocoPipe,
  ],
  providers: [provideAuthScope()],
  template: `
    @switch (state()) {
      @case ('done') {
        <app-empty-state
          data-testid="reset.done"
          icon="circle-check"
          [title]="'auth.reset.done.title' | transloco"
          [body]="'auth.reset.done.body' | transloco"
        />
        <a appButton size="block" class="mt-auto" routerLink="/login">{{
          'auth.reset.done.action' | transloco
        }}</a>
      }
      @case ('invalid') {
        <app-empty-state
          data-testid="reset.invalid"
          icon="circle-alert"
          [title]="'auth.reset.invalid.title' | transloco"
          [body]="'auth.reset.invalid.body' | transloco"
        />
        <a appButton size="block" class="mt-auto" routerLink="/forgot-password">{{
          'auth.reset.invalid.action' | transloco
        }}</a>
      }
      @default {
        <form class="flex flex-1 flex-col" novalidate (submit)="submit($event)">
          <h1 class="text-title text-ink-1">{{ 'auth.reset.title' | transloco }}</h1>
          @if (failure(); as message) {
            <app-banner
              class="mt-6"
              status="critical"
              [message]="message.key | transloco: message.params ?? {}"
              [actionLabel]="offline() ? ('errors.retry' | transloco) : ''"
              (action)="submit()"
            />
          }
          <app-text-field
            class="mt-8"
            data-testid="reset.password"
            type="password"
            autocomplete="new-password"
            [label]="'auth.fields.newPassword' | transloco"
            [hint]="'auth.fields.passwordHint' | transloco"
            [formField]="resetForm.password"
            [error]="fieldErrors()['password'] ?? ''"
          />
          <button
            appButton
            type="submit"
            size="block"
            class="mt-auto"
            data-testid="reset.submit"
            [disabled]="resetForm().invalid()"
            [loading]="submitting()"
          >
            {{ 'auth.reset.submit' | transloco }}
          </button>
        </form>
      }
    }
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class ResetPasswordPage {
  private readonly api = inject(AuthApi)
  private readonly session = inject(SessionStore)

  /** Route param `:token` (component input binding). */
  readonly token = input.required<string>()

  private readonly messages = formMessages()
  protected readonly model = signal({ password: '' })
  protected readonly resetForm = form(this.model, (path) => {
    required(path.password, { message: () => this.messages.required() })
    minLength(path.password, PASSWORD_MIN_LENGTH, { message: () => this.messages.passwordMin() })
  })

  protected readonly state = signal<State>('form')
  protected readonly submitting = signal(false)
  protected readonly failure = signal<Message | null>(null)
  protected readonly offline = computed(() => this.failure()?.key === 'errors.offline')
  protected readonly fieldErrors = serverFieldErrors(this.model)

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault()
    if (this.resetForm().invalid() || this.submitting()) {
      return
    }
    this.submitting.set(true)
    this.failure.set(null)
    try {
      await this.api.resetPassword(this.token(), this.model().password)
      // Every session was revoked by the API, this one included.
      this.session.clear()
      this.state.set('done')
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation' && failure.fields['password']) {
        this.fieldErrors.set(failure.fields)
      } else if (failure.kind === 'http' || failure.kind === 'validation') {
        this.state.set('invalid')
      } else {
        this.failure.set(failureMessage(failure))
      }
    } finally {
      this.submitting.set(false)
    }
  }
}
