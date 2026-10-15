import { Component, computed, inject, output, signal } from '@angular/core'
import { FormField, email, form, required } from '@angular/forms/signals'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { serverFieldErrors } from '../../../core/api/server-errors'
import { HouseholdApi } from '../../../core/household/household.api'
import { formMessages } from '../../../core/i18n/form-messages'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'

/** Scoped keys used from TypeScript: t(onboarding.invite.full) */

/**
 * Step 4: invite the partner by email (the link is only ever emailed), or
 * "Later". Either way the wizard ends here.
 */
@Component({
  selector: 'app-invite-step',
  imports: [BannerComponent, ButtonComponent, FormField, TextFieldComponent, TranslocoPipe],
  template: `
    <form class="flex flex-1 flex-col" novalidate (submit)="send($event)">
      <h1 class="text-title text-ink-1">{{ 'onboarding.invite.title' | transloco }}</h1>
      <p class="mt-2 text-body text-ink-2">{{ 'onboarding.invite.body' | transloco }}</p>

      @if (sentTo(); as address) {
        <app-banner
          class="mt-6"
          data-testid="onboarding.inviteSent"
          status="good"
          [message]="'onboarding.invite.sent' | transloco: { email: address }"
        />
      } @else {
        @if (failure(); as message) {
          <app-banner
            class="mt-6"
            status="critical"
            [message]="message.key | transloco: message.params ?? {}"
          />
        }
        <app-text-field
          class="mt-8"
          data-testid="onboarding.inviteEmail"
          type="email"
          autocomplete="off"
          inputmode="email"
          [label]="'onboarding.invite.email' | transloco"
          [formField]="inviteForm.email"
          [error]="fieldErrors()['email'] ?? ''"
        />
      }

      <div class="mt-auto flex flex-col gap-2 pt-8">
        @if (sentTo()) {
          <button
            appButton
            type="button"
            size="block"
            data-testid="onboarding.finish"
            (click)="done.emit()"
          >
            {{ 'onboarding.invite.finish' | transloco }}
          </button>
        } @else {
          <button
            appButton
            type="submit"
            size="block"
            icon="send"
            data-testid="onboarding.inviteSend"
            [disabled]="inviteForm().invalid()"
            [loading]="sending()"
          >
            {{ 'onboarding.invite.send' | transloco }}
          </button>
          <button
            appButton
            type="button"
            variant="ghost"
            data-testid="onboarding.later"
            (click)="done.emit()"
          >
            {{ 'onboarding.invite.later' | transloco }}
          </button>
        }
      </div>
    </form>
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export class InviteStepComponent {
  private readonly households = inject(HouseholdApi)

  readonly done = output<void>()

  private readonly messages = formMessages()
  protected readonly model = signal({ email: '' })
  protected readonly inviteForm = form(this.model, (path) => {
    required(path.email, { message: () => this.messages.required() })
    email(path.email, { message: () => this.messages.email() })
  })
  protected readonly sending = signal(false)
  protected readonly failure = signal<Message | null>(null)
  protected readonly fieldErrors = serverFieldErrors(this.model)
  protected readonly sentTo = signal<string | null>(null)
  protected readonly canSend = computed(() => !this.inviteForm().invalid() && !this.sending())

  protected async send(event?: Event): Promise<void> {
    event?.preventDefault()
    if (!this.canSend()) {
      return
    }
    this.sending.set(true)
    this.failure.set(null)
    const address = this.model().email.trim().toLowerCase()
    try {
      await this.households.invite(address)
      this.sentTo.set(address)
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.fieldErrors.set(failure.fields)
      } else if (hasStatus(failure, 402)) {
        this.failure.set({ key: 'onboarding.invite.full' })
      } else {
        this.failure.set(failureMessage(failure))
      }
    } finally {
      this.sending.set(false)
    }
  }
}
