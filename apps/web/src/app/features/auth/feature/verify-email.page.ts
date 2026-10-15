import { DOCUMENT, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { provideAuthScope } from '../auth.scope'

/** Scoped keys used from TypeScript: t(auth.verify.pending.sent, auth.verify.pending.codeInvalid) */

/** Seconds before "send a new email" can be used again. */
export const RESEND_COOLDOWN_SECONDS = 60

/** Digits in the emailed verification code. */
export const CODE_LENGTH = 6

/** Shown when the API turns a code down without its own message. */
const CODE_INVALID_KEY = 'auth.verify.pending.codeInvalid'

/** The digits of what was typed or pasted ("123 456", "123-456" → "123456"). */
function codeDigits(text: string): string {
  return text.replace(/\D/g, '')
}

type State = 'pending' | 'confirming' | 'confirmed' | 'invalid'

/**
 * Email verification, both halves:
 * - pending (`/verify-email`): "check your inbox", the 6-digit code from the
 *   same email (submitted as soon as six digits are typed or pasted),
 *   resend with a 60 s cooldown (a new link and a new code), and a session
 *   refresh whenever the app comes back to the foreground (the link may
 *   have been opened in another tab or app);
 * - confirmed (`/verify-email?token=`): posts the token, then continues to
 *   onboarding or the month (or to login when this browser is signed out).
 */
@Component({
  selector: 'app-verify-email-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    EmptyStateComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  providers: [provideAuthScope()],
  template: `
    @switch (state()) {
      @case ('confirming') {
        <p class="py-8 text-center text-body text-ink-2" data-testid="verify.confirming">
          {{ 'auth.verify.confirming' | transloco }}
        </p>
      }
      @case ('confirmed') {
        <app-empty-state
          data-testid="verify.confirmed"
          icon="circle-check"
          [title]="'auth.verify.confirmed.title' | transloco"
          [body]="'auth.verify.confirmed.body' | transloco"
        />
        <button
          appButton
          type="button"
          size="block"
          class="mt-auto"
          data-testid="verify.continue"
          (click)="continue()"
        >
          {{ 'auth.verify.confirmed.continue' | transloco }}
        </button>
      }
      @case ('invalid') {
        <app-empty-state
          data-testid="verify.invalid"
          icon="circle-alert"
          [title]="'auth.verify.invalid.title' | transloco"
          [body]="'auth.verify.invalid.body' | transloco"
        />
        <button appButton type="button" size="block" class="mt-auto" (click)="continue()">
          {{ 'auth.verify.invalid.action' | transloco }}
        </button>
      }
      @default {
        <h1 class="text-title text-ink-1" data-testid="verify.pending">
          {{ 'auth.verify.pending.title' | transloco }}
        </h1>
        <p class="mt-2 text-body text-ink-2">
          {{ 'auth.verify.pending.body' | transloco: { email: email() } }}
        </p>
        @if (notice(); as message) {
          <app-banner
            class="mt-6"
            data-testid="verify.notice"
            [status]="noticeStatus()"
            [message]="message.key | transloco: message.params ?? {}"
          />
        }
        <form class="mt-8 flex flex-col gap-4" novalidate (submit)="submitCode($event)">
          <app-text-field
            data-testid="verify.code"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            [label]="'auth.verify.pending.code' | transloco"
            [value]="code()"
            [error]="codeError()"
            (valueChange)="typeCode($event)"
          />
          <button
            appButton
            type="submit"
            size="block"
            data-testid="verify.codeSubmit"
            [disabled]="!codeComplete()"
            [loading]="verifying()"
          >
            {{ 'auth.verify.pending.confirm' | transloco }}
          </button>
        </form>
        <div class="mt-auto flex flex-col items-stretch gap-2 pt-8">
          <button
            appButton
            type="button"
            size="block"
            variant="secondary"
            data-testid="verify.resend"
            [disabled]="cooldown() > 0"
            [loading]="sending()"
            (click)="resend()"
          >
            @if (cooldown() > 0) {
              {{ 'auth.verify.pending.resendIn' | transloco: { seconds: cooldown() } }}
            } @else {
              {{ 'auth.verify.pending.resend' | transloco }}
            }
          </button>
          <button appButton type="button" variant="ghost" (click)="useAnotherAccount()">
            {{ 'auth.verify.pending.otherAccount' | transloco }}
          </button>
        </div>
      }
    }
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class VerifyEmailPage implements OnInit {
  private readonly api = inject(AuthApi)
  private readonly session = inject(SessionStore)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly document = inject(DOCUMENT)
  private readonly destroyRef = inject(DestroyRef)
  private readonly transloco = inject(TranslocoService)

  protected readonly state = signal<State>('pending')
  protected readonly email = computed(() => this.session.user()?.email ?? '')
  protected readonly cooldown = signal(0)
  protected readonly sending = signal(false)
  protected readonly notice = signal<Message | null>(null)
  protected readonly noticeStatus = computed(() =>
    this.notice()?.key === 'auth.verify.pending.sent' ? 'good' : 'critical'
  )
  protected readonly code = signal('')
  protected readonly codeError = signal('')
  protected readonly verifying = signal(false)
  protected readonly codeComplete = computed(() => codeDigits(this.code()).length === CODE_LENGTH)

  private timer: ReturnType<typeof setInterval> | undefined

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer())
  }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token')
    if (token) {
      void this.confirm(token)
      return
    }
    if (!this.session.isAuthenticated() || this.session.isVerified()) {
      void this.router.navigateByUrl(this.session.homePath())
      return
    }
    const onVisible = (): void => {
      if (this.document.visibilityState === 'visible') {
        void this.refresh()
      }
    }
    this.document.addEventListener('visibilitychange', onVisible)
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('visibilitychange', onVisible)
    )
  }

  protected async resend(): Promise<void> {
    if (this.cooldown() > 0 || this.sending()) {
      return
    }
    this.sending.set(true)
    this.notice.set(null)
    try {
      await this.api.resendVerification()
      this.notice.set({ key: 'auth.verify.pending.sent' })
      this.startCooldown()
    } catch (error) {
      this.notice.set(failureMessage(toApiError(error)))
    } finally {
      this.sending.set(false)
    }
  }

  /** Every keystroke or paste; six digits send the code at once. */
  protected typeCode(text: string): void {
    this.code.set(text)
    this.codeError.set('')
    if (this.codeComplete()) {
      void this.submitCode()
    }
  }

  protected async submitCode(event?: Event): Promise<void> {
    event?.preventDefault()
    if (!this.codeComplete() || this.verifying()) {
      return
    }
    this.verifying.set(true)
    this.notice.set(null)
    try {
      await this.api.verifyCode(codeDigits(this.code()))
      // Same ending as the link: refresh the session, then go where it belongs.
      await this.session.load()
      await this.router.navigateByUrl(this.session.homePath())
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.codeError.set(failure.fields['code'] ?? this.transloco.translate(CODE_INVALID_KEY))
      } else {
        this.notice.set(failureMessage(failure))
      }
    } finally {
      this.verifying.set(false)
    }
  }

  protected async continue(): Promise<void> {
    await this.router.navigateByUrl(this.session.homePath())
  }

  protected async useAnotherAccount(): Promise<void> {
    await this.session.logout()
  }

  private async confirm(token: string): Promise<void> {
    this.state.set('confirming')
    try {
      await this.api.verifyEmail(token)
      if (this.session.isAuthenticated()) {
        await this.session.load()
      }
      this.state.set('confirmed')
    } catch {
      this.state.set('invalid')
    }
  }

  /** The link was opened elsewhere: once the API says verified, move on. */
  private async refresh(): Promise<void> {
    await this.session.load()
    if (this.session.isVerified()) {
      await this.router.navigateByUrl(this.session.homePath())
    }
  }

  private startCooldown(): void {
    this.stopTimer()
    this.cooldown.set(RESEND_COOLDOWN_SECONDS)
    this.timer = setInterval(() => {
      const next = this.cooldown() - 1
      this.cooldown.set(Math.max(next, 0))
      if (next <= 0) {
        this.stopTimer()
      }
    }, 1000)
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
}
