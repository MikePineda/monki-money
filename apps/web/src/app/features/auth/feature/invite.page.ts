import { Component, OnInit, computed, inject, input, signal } from '@angular/core'
import { FormField, form, minLength, required } from '@angular/forms/signals'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { serverFieldErrors } from '../../../core/api/server-errors'
import { AuthApi, type InvitationPreview } from '../../../core/auth/auth.api'
import { clearPendingInvite, savePendingInvite } from '../../../core/auth/pending-invite'
import { SessionStore } from '../../../core/auth/session.store'
import { PASSWORD_MIN_LENGTH, formMessages } from '../../../core/i18n/form-messages'
import { WINDOW } from '../../../core/platform/window.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CardComponent } from '../../../shared/ui/card/card.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { provideAuthScope } from '../auth.scope'

/** Scoped keys used from TypeScript: t(auth.invite.full) */

type View =
  | 'loading'
  | 'invalid'
  | 'expired'
  | 'unavailable'
  | 'guest'
  | 'create'
  | 'join'
  | 'otherEmail'
  | 'alreadyIn'

/**
 * An invitation link (`/invite/:token`). Signed out: who invited whom to
 * which household, then "Create account" (in place, the account is born
 * verified) or "Log in" (the token waits in sessionStorage and login comes
 * back here). Signed in without a household: confirm with the password and
 * join. Signed in with one: the one-household rule, honestly. Unknown or
 * expired links say so.
 */
@Component({
  selector: 'app-invite-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    FormField,
    RouterLink,
    TextFieldComponent,
    TranslocoPipe,
  ],
  providers: [provideAuthScope()],
  template: `
    @switch (view()) {
      @case ('loading') {
        <p class="py-8 text-center text-body text-ink-2">{{ 'auth.invite.loading' | transloco }}</p>
      }
      @case ('invalid') {
        <app-empty-state
          data-testid="invite.invalid"
          icon="circle-alert"
          [title]="'auth.invite.invalid.title' | transloco"
          [body]="'auth.invite.invalid.body' | transloco"
        />
        <a appButton size="block" variant="secondary" class="mt-auto" [routerLink]="exitPath()">{{
          'auth.invite.exit' | transloco
        }}</a>
      }
      @case ('expired') {
        <app-empty-state
          data-testid="invite.expired"
          icon="circle-alert"
          [title]="'auth.invite.expired.title' | transloco"
          [body]="'auth.invite.expired.body' | transloco"
        />
        <a appButton size="block" variant="secondary" class="mt-auto" [routerLink]="exitPath()">{{
          'auth.invite.exit' | transloco
        }}</a>
      }
      @case ('alreadyIn') {
        <app-empty-state
          data-testid="invite.alreadyIn"
          icon="house"
          [title]="'auth.invite.alreadyIn.title' | transloco"
          [body]="'auth.invite.alreadyIn.body' | transloco"
        />
        <a appButton size="block" class="mt-auto" [routerLink]="exitPath()">{{
          'auth.invite.alreadyIn.action' | transloco
        }}</a>
      }
      @case ('unavailable') {
        <app-banner
          status="critical"
          [message]="failure()?.key ?? '' | transloco: failure()?.params ?? {}"
          [actionLabel]="'errors.retry' | transloco"
          (action)="load()"
        />
      }
      @default {
        <h1 class="text-title text-ink-1" data-testid="invite.title">
          {{ 'auth.invite.title' | transloco: { household: preview()?.householdName ?? '' } }}
        </h1>
        <app-card class="mt-6">
          <p class="text-body text-ink-1" data-testid="invite.from">
            @if (preview()?.inviterName; as inviter) {
              {{ 'auth.invite.from' | transloco: { inviter, email: preview()?.email ?? '' } }}
            } @else {
              {{ 'auth.invite.fromUnknown' | transloco: { email: preview()?.email ?? '' } }}
            }
          </p>
        </app-card>

        @if (failure(); as message) {
          <app-banner
            class="mt-6"
            data-testid="invite.error"
            status="critical"
            [message]="message.key | transloco: message.params ?? {}"
          />
        }

        @switch (view()) {
          @case ('guest') {
            <div class="mt-auto flex flex-col gap-2 pt-8">
              <button
                appButton
                type="button"
                size="block"
                data-testid="invite.create"
                (click)="view.set('create')"
              >
                {{ 'auth.invite.createAccount' | transloco }}
              </button>
              <a appButton variant="ghost" routerLink="/login" data-testid="invite.login">{{
                'auth.invite.login' | transloco
              }}</a>
            </div>
          }
          @case ('otherEmail') {
            <p class="mt-6 text-body text-ink-2" data-testid="invite.otherEmail">
              {{ 'auth.invite.otherEmail' | transloco: { email: preview()?.email ?? '' } }}
            </p>
            <div class="mt-auto flex flex-col gap-2 pt-8">
              <button
                appButton
                type="button"
                size="block"
                variant="secondary"
                icon="log-out"
                (click)="logoutAndStay()"
              >
                {{ 'auth.invite.logout' | transloco }}
              </button>
              <button
                appButton
                type="button"
                variant="ghost"
                data-testid="invite.notNow"
                (click)="setAside()"
              >
                {{ 'auth.invite.notNow' | transloco }}
              </button>
            </div>
          }
          @default {
            <form class="mt-8 flex flex-1 flex-col" novalidate (submit)="accept($event)">
              <div class="flex flex-col gap-4">
                @if (creating()) {
                  <app-text-field
                    data-testid="invite.name"
                    autocomplete="name"
                    [label]="'auth.fields.fullName' | transloco"
                    [formField]="acceptForm.fullName"
                    [error]="fieldErrors()['fullName'] ?? ''"
                  />
                } @else {
                  <p class="text-body text-ink-2">
                    {{ 'auth.invite.confirmPassword' | transloco }}
                  </p>
                }
                <app-text-field
                  data-testid="invite.password"
                  type="password"
                  [autocomplete]="creating() ? 'new-password' : 'current-password'"
                  [label]="'auth.fields.password' | transloco"
                  [hint]="creating() ? ('auth.fields.passwordHint' | transloco) : ''"
                  [formField]="acceptForm.password"
                  [error]="fieldErrors()['password'] ?? ''"
                />
              </div>
              <button
                appButton
                type="submit"
                size="block"
                class="mt-auto"
                data-testid="invite.accept"
                [disabled]="acceptForm().invalid()"
                [loading]="submitting()"
              >
                {{ 'auth.invite.accept' | transloco }}
              </button>
            </form>
          }
        }
      }
    }
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class InvitePage implements OnInit {
  private readonly api = inject(AuthApi)
  private readonly session = inject(SessionStore)
  private readonly router = inject(Router)
  private readonly window = inject(WINDOW)

  /** Route param `:token`. */
  readonly token = input.required<string>()

  protected readonly view = signal<View>('loading')
  protected readonly preview = signal<InvitationPreview | null>(null)
  protected readonly failure = signal<Message | null>(null)
  protected readonly submitting = signal(false)
  protected readonly exitPath = computed(() => this.session.homePath())
  protected readonly creating = computed(() => this.view() === 'create')

  private readonly messages = formMessages()
  protected readonly model = signal({ fullName: '', password: '' })
  protected readonly acceptForm = form(this.model, (path) => {
    required(path.fullName, {
      message: () => this.messages.required(),
      when: () => this.creating(),
    })
    required(path.password, { message: () => this.messages.required() })
    minLength(path.password, PASSWORD_MIN_LENGTH, {
      message: () => this.messages.passwordMin(),
      when: () => this.creating(),
    })
  })
  protected readonly fieldErrors = serverFieldErrors(this.model)

  ngOnInit(): void {
    void this.load()
  }

  protected async load(): Promise<void> {
    this.view.set('loading')
    this.failure.set(null)
    savePendingInvite(this.window, this.token())
    try {
      this.preview.set(await this.api.invitation(this.token()))
      this.view.set(this.signedInView())
    } catch (error) {
      const failure = toApiError(error)
      if (hasStatus(failure, 404) || hasStatus(failure, 410)) {
        clearPendingInvite(this.window)
        this.view.set(hasStatus(failure, 404) ? 'invalid' : 'expired')
      } else {
        this.failure.set(failureMessage(failure))
        this.view.set('unavailable')
      }
    }
  }

  protected async accept(event?: Event): Promise<void> {
    event?.preventDefault()
    if (this.acceptForm().invalid() || this.submitting()) {
      return
    }
    this.submitting.set(true)
    this.failure.set(null)
    const { fullName, password } = this.model()
    try {
      await this.api.acceptInvitation(
        this.token(),
        this.creating() ? { fullName: fullName.trim(), password } : { password }
      )
      clearPendingInvite(this.window)
      await this.session.load()
      await this.router.navigateByUrl(this.session.homePath())
    } catch (error) {
      this.handleAcceptFailure(error)
    } finally {
      this.submitting.set(false)
    }
  }

  /** Wrong account: sign out, keeping the invitation for the right one. */
  protected async logoutAndStay(): Promise<void> {
    await this.session.logout()
    savePendingInvite(this.window, this.token())
  }

  /** Not this account's invitation, and not now: forget it and go home. */
  protected async setAside(): Promise<void> {
    clearPendingInvite(this.window)
    await this.router.navigateByUrl(this.session.homePath())
  }

  private signedInView(): View {
    if (!this.session.isAuthenticated()) {
      return 'guest'
    }
    if (this.session.hasHousehold()) {
      clearPendingInvite(this.window)
      return 'alreadyIn'
    }
    return this.session.user()?.email === this.preview()?.email ? 'join' : 'otherEmail'
  }

  private handleAcceptFailure(error: unknown): void {
    const failure = toApiError(error)
    if (failure.kind === 'validation') {
      this.fieldErrors.set(failure.fields)
    } else if (hasStatus(failure, 409)) {
      clearPendingInvite(this.window)
      this.view.set('alreadyIn')
    } else if (hasStatus(failure, 410)) {
      clearPendingInvite(this.window)
      this.view.set('expired')
    } else if (hasStatus(failure, 402)) {
      this.failure.set({ key: 'auth.invite.full' })
    } else {
      this.failure.set(failureMessage(failure))
    }
  }
}
