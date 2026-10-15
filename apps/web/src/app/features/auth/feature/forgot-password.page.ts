import { Component, computed, inject, signal, viewChild } from '@angular/core'
import { FormField, email, form, required } from '@angular/forms/signals'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { AuthApi } from '../../../core/auth/auth.api'
import { formMessages } from '../../../core/i18n/form-messages'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { provideAuthScope } from '../auth.scope'
import { TurnstileGate, isTurnstileRejection } from '../ui/turnstile-gate'
import { TurnstileWidgetComponent } from '../ui/turnstile-widget.component'

/** Scoped keys used from TypeScript: t(auth.turnstile.rejected) */

/**
 * Request a password reset link. The answer is the same whether or not the
 * address has an account (the API never tells), so the confirmation says
 * "if an account exists". With a Turnstile site key the form also waits
 * for the bot check.
 */
@Component({
  selector: 'app-forgot-password-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    EmptyStateComponent,
    FormField,
    RouterLink,
    TextFieldComponent,
    TranslocoPipe,
    TurnstileWidgetComponent,
  ],
  providers: [provideAuthScope(), TurnstileGate],
  template: `
    @if (sentTo(); as address) {
      <app-empty-state
        data-testid="forgot.sent"
        icon="inbox"
        [title]="'auth.forgot.sent.title' | transloco"
        [body]="'auth.forgot.sent.body' | transloco: { email: address }"
      />
      <a appButton size="block" variant="secondary" class="mt-auto" routerLink="/login">{{
        'auth.forgot.back' | transloco
      }}</a>
    } @else {
      <form class="flex flex-1 flex-col" novalidate (submit)="submit($event)">
        <h1 class="text-title text-ink-1">{{ 'auth.forgot.title' | transloco }}</h1>
        <p class="mt-2 text-body text-ink-2">{{ 'auth.forgot.body' | transloco }}</p>
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
          data-testid="forgot.email"
          type="email"
          autocomplete="email"
          inputmode="email"
          [label]="'auth.fields.email' | transloco"
          [formField]="forgotForm.email"
        />
        @if (gate.siteKey(); as siteKey) {
          <app-turnstile-widget
            class="mt-6"
            data-testid="forgot.turnstile"
            [siteKey]="siteKey"
            [token]="gate.token()"
            [rejected]="gate.rejected()"
            (tokenChange)="gate.setToken($event)"
          />
        }
        <div class="mt-auto flex flex-col gap-2 pt-8">
          <button
            appButton
            type="submit"
            size="block"
            data-testid="forgot.submit"
            [disabled]="forgotForm().invalid() || gate.waiting()"
            [loading]="submitting()"
          >
            {{ 'auth.forgot.submit' | transloco }}
          </button>
          <a appButton variant="ghost" routerLink="/login">{{ 'auth.forgot.back' | transloco }}</a>
        </div>
      </form>
    }
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class ForgotPasswordPage {
  private readonly api = inject(AuthApi)
  protected readonly gate = inject(TurnstileGate)
  private readonly turnstile = viewChild(TurnstileWidgetComponent)

  private readonly messages = formMessages()
  protected readonly model = signal({ email: '' })
  protected readonly forgotForm = form(this.model, (path) => {
    required(path.email, { message: () => this.messages.required() })
    email(path.email, { message: () => this.messages.email() })
  })

  protected readonly submitting = signal(false)
  protected readonly failure = signal<Message | null>(null)
  protected readonly offline = computed(() => this.failure()?.key === 'errors.offline')
  protected readonly sentTo = signal<string | null>(null)

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault()
    if (this.forgotForm().invalid() || this.gate.waiting() || this.submitting()) {
      return
    }
    this.submitting.set(true)
    this.failure.set(null)
    this.gate.rejected.set(false)
    const address = this.model().email.trim().toLowerCase()
    try {
      await this.api.forgotPassword({ email: address, ...this.gate.field() })
      this.sentTo.set(address)
    } catch (error) {
      // Turnstile tokens are single use: every failed attempt needs a new one.
      this.turnstile()?.reset()
      const failure = toApiError(error)
      if (isTurnstileRejection(failure)) {
        if (!this.gate.reject()) {
          this.failure.set({ key: 'auth.turnstile.rejected' })
        }
      } else {
        this.failure.set(failureMessage(failure))
      }
    } finally {
      this.submitting.set(false)
    }
  }
}
