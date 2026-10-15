import { Component, computed, inject, signal, viewChild } from '@angular/core'
import { FormField, email, form, required } from '@angular/forms/signals'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, retryMinutes, type Message } from '../../../core/api/error-messages'
import { toApiError, type ApiError } from '../../../core/api/http-errors'
import { afterSignInUrl } from '../../../core/auth/after-sign-in'
import { AuthApi } from '../../../core/auth/auth.api'
import { ConfigStore } from '../../../core/auth/config.store'
import { SessionStore } from '../../../core/auth/session.store'
import { formMessages } from '../../../core/i18n/form-messages'
import { WINDOW } from '../../../core/platform/window.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { provideAuthScope } from '../auth.scope'
import { TurnstileGate, isTurnstileRejection } from '../ui/turnstile-gate'
import { TurnstileWidgetComponent } from '../ui/turnstile-widget.component'

/**
 * Scoped keys used from TypeScript:
 * t(auth.login.errors.throttled, auth.login.errors.credentials, auth.turnstile.rejected)
 */

/**
 * Log in (DESIGN mock `login`). One generic message for wrong credentials
 * (never says whether the email exists), the throttle wait when the API
 * blocks, and a retry that keeps what was typed when there is no network.
 * "Create account" shows only while the API says registration is open.
 * With a Turnstile site key the form also waits for the bot check.
 */
@Component({
  selector: 'app-login-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    FormField,
    RouterLink,
    TextFieldComponent,
    TranslocoPipe,
    TurnstileWidgetComponent,
  ],
  providers: [provideAuthScope(), TurnstileGate],
  template: `
    <form class="flex flex-1 flex-col" novalidate (submit)="submit($event)">
      <h1 class="text-title text-ink-1">{{ 'auth.login.title' | transloco }}</h1>

      @if (failure(); as message) {
        <app-banner
          data-testid="login.error"
          class="mt-6"
          status="critical"
          [message]="message.key | transloco: message.params ?? {}"
          [actionLabel]="offline() ? ('errors.retry' | transloco) : ''"
          (action)="submit()"
        />
      }

      <div class="mt-8 flex flex-col gap-4">
        <app-text-field
          data-testid="login.email"
          type="email"
          autocomplete="email"
          inputmode="email"
          [label]="'auth.fields.email' | transloco"
          [formField]="loginForm.email"
        />
        <app-text-field
          data-testid="login.password"
          type="password"
          autocomplete="current-password"
          [label]="'auth.fields.password' | transloco"
          [formField]="loginForm.password"
        />
        <a
          appButton
          variant="link"
          class="-mr-3 self-end"
          data-testid="login.forgot"
          routerLink="/forgot-password"
          >{{ 'auth.login.forgot' | transloco }}</a
        >
        @if (gate.siteKey(); as siteKey) {
          <app-turnstile-widget
            data-testid="login.turnstile"
            [siteKey]="siteKey"
            [token]="gate.token()"
            [rejected]="gate.rejected()"
            (tokenChange)="gate.setToken($event)"
          />
        }
      </div>

      <div class="mt-auto flex flex-col items-center gap-2 pt-8">
        <button
          appButton
          type="submit"
          size="block"
          data-testid="login.submit"
          [disabled]="loginForm().invalid() || gate.waiting()"
          [loading]="submitting()"
        >
          {{ 'auth.login.submit' | transloco }}
        </button>
        @if (config.registrationOpen()) {
          <p class="text-body text-ink-2">
            {{ 'auth.login.newHere' | transloco }}
            <a class="text-accent" data-testid="login.signup" routerLink="/signup">{{
              'auth.login.createAccount' | transloco
            }}</a>
          </p>
        }
      </div>
    </form>
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class LoginPage {
  private readonly api = inject(AuthApi)
  private readonly session = inject(SessionStore)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly window = inject(WINDOW)
  protected readonly config = inject(ConfigStore)
  protected readonly gate = inject(TurnstileGate)
  private readonly turnstile = viewChild(TurnstileWidgetComponent)

  private readonly messages = formMessages()
  protected readonly model = signal({ email: '', password: '' })
  protected readonly loginForm = form(this.model, (path) => {
    required(path.email, { message: () => this.messages.required() })
    email(path.email, { message: () => this.messages.email() })
    required(path.password, { message: () => this.messages.required() })
  })

  protected readonly submitting = signal(false)
  protected readonly failure = signal<Message | null>(null)
  protected readonly offline = computed(() => this.failure()?.key === 'errors.offline')

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault()
    if (this.loginForm().invalid() || this.gate.waiting() || this.submitting()) {
      return
    }
    this.submitting.set(true)
    this.failure.set(null)
    this.gate.rejected.set(false)
    const { email: address, password } = this.model()
    try {
      await this.api.login({
        email: address.trim().toLowerCase(),
        password,
        ...this.gate.field(),
      })
      await this.session.load()
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl')
      await this.router.navigateByUrl(
        afterSignInUrl(this.window, returnUrl, this.session.homePath())
      )
    } catch (error) {
      // Turnstile tokens are single use: every failed attempt needs a new one.
      this.turnstile()?.reset()
      this.failure.set(this.messageFor(toApiError(error)))
    } finally {
      this.submitting.set(false)
    }
  }

  private messageFor(failure: ApiError): Message | null {
    if (isTurnstileRejection(failure)) {
      return this.gate.reject() ? null : { key: 'auth.turnstile.rejected' }
    }
    switch (failure.kind) {
      case 'throttled':
        return {
          key: 'auth.login.errors.throttled',
          params: { minutes: retryMinutes(failure.retryAfterSeconds) },
        }
      case 'http':
      case 'validation':
      case 'unauthorized':
        return { key: 'auth.login.errors.credentials' }
      default:
        return failureMessage(failure)
    }
  }
}
