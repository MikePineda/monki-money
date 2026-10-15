import { Component, computed, inject, signal } from '@angular/core'
import { FormField, email, form, minLength, required } from '@angular/forms/signals'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { serverFieldErrors } from '../../../core/api/server-errors'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { PASSWORD_MIN_LENGTH, formMessages } from '../../../core/i18n/form-messages'
import { LangStore } from '../../../core/i18n/lang.store'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CheckboxComponent } from '../../../shared/ui/checkbox/checkbox.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { provideAuthScope } from '../auth.scope'

/** Scoped keys used from TypeScript: t(auth.signup.errors.closed) */

/**
 * Create an account (only routed while registration is open). The API
 * creates the household too and logs in; the next stop is "check your
 * email", then the onboarding wizard.
 */
@Component({
  selector: 'app-signup-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    CheckboxComponent,
    FormField,
    RouterLink,
    TextFieldComponent,
    TranslocoPipe,
  ],
  providers: [provideAuthScope()],
  template: `
    <form class="flex flex-1 flex-col" novalidate (submit)="submit($event)">
      <h1 class="text-title text-ink-1">{{ 'auth.signup.title' | transloco }}</h1>
      <p class="mt-2 text-body text-ink-2">{{ 'auth.signup.subtitle' | transloco }}</p>

      @if (failure(); as message) {
        <app-banner
          data-testid="signup.error"
          class="mt-6"
          status="critical"
          [message]="message.key | transloco: message.params ?? {}"
          [actionLabel]="offline() ? ('errors.retry' | transloco) : ''"
          (action)="submit()"
        />
      }

      <div class="mt-8 flex flex-col gap-4">
        <app-text-field
          data-testid="signup.name"
          autocomplete="name"
          [label]="'auth.fields.fullName' | transloco"
          [formField]="signupForm.fullName"
          [error]="fieldErrors()['fullName'] ?? ''"
        />
        <app-text-field
          data-testid="signup.email"
          type="email"
          autocomplete="email"
          inputmode="email"
          [label]="'auth.fields.email' | transloco"
          [formField]="signupForm.email"
          [error]="fieldErrors()['email'] ?? ''"
        />
        <app-text-field
          data-testid="signup.password"
          type="password"
          autocomplete="new-password"
          [label]="'auth.fields.password' | transloco"
          [hint]="'auth.fields.passwordHint' | transloco"
          [formField]="signupForm.password"
          [error]="fieldErrors()['password'] ?? ''"
        />
        <app-checkbox data-testid="signup.terms" [formField]="signupForm.terms">
          {{ 'auth.signup.terms' | transloco }}
          <a class="text-accent" routerLink="/legal/terms">{{
            'auth.signup.termsLink' | transloco
          }}</a>
          ·
          <a class="text-accent" routerLink="/legal/privacy">{{
            'auth.signup.privacyLink' | transloco
          }}</a>
        </app-checkbox>
      </div>

      <div class="mt-auto flex flex-col items-center gap-2 pt-8">
        <button
          appButton
          type="submit"
          size="block"
          data-testid="signup.submit"
          [disabled]="signupForm().invalid()"
          [loading]="submitting()"
        >
          {{ 'auth.signup.submit' | transloco }}
        </button>
        <p class="text-body text-ink-2">
          {{ 'auth.signup.haveAccount' | transloco }}
          <a class="text-accent" routerLink="/login">{{ 'auth.signup.login' | transloco }}</a>
        </p>
      </div>
    </form>
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class SignupPage {
  private readonly api = inject(AuthApi)
  private readonly session = inject(SessionStore)
  private readonly router = inject(Router)
  private readonly lang = inject(LangStore)

  private readonly messages = formMessages()
  protected readonly model = signal({ fullName: '', email: '', password: '', terms: false })
  protected readonly signupForm = form(this.model, (path) => {
    required(path.fullName, { message: () => this.messages.required() })
    required(path.email, { message: () => this.messages.required() })
    email(path.email, { message: () => this.messages.email() })
    required(path.password, { message: () => this.messages.required() })
    minLength(path.password, PASSWORD_MIN_LENGTH, { message: () => this.messages.passwordMin() })
    required(path.terms, { message: () => this.messages.required() })
  })

  protected readonly submitting = signal(false)
  protected readonly failure = signal<Message | null>(null)
  protected readonly offline = computed(() => this.failure()?.key === 'errors.offline')
  protected readonly fieldErrors = serverFieldErrors(this.model)

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault()
    if (this.signupForm().invalid() || this.submitting()) {
      return
    }
    this.submitting.set(true)
    this.failure.set(null)
    const { fullName, email: address, password } = this.model()
    try {
      await this.api.signup({
        fullName: fullName.trim(),
        email: address.trim().toLowerCase(),
        password,
        locale: this.lang.lang(),
      })
      await this.session.load()
      await this.router.navigateByUrl('/verify-email')
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.fieldErrors.set(failure.fields)
      } else if (failure.kind === 'forbidden') {
        this.failure.set({ key: 'auth.signup.errors.closed' })
      } else {
        this.failure.set(failureMessage(failure))
      }
    } finally {
      this.submitting.set(false)
    }
  }
}
