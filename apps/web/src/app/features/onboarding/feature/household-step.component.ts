import { Component, computed, inject, output, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { serverFieldErrors } from '../../../core/api/server-errors'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { formMessages } from '../../../core/i18n/form-messages'
import { firstName } from '../../../domain/people'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'

/**
 * Keys used from TypeScript (translateSignal adds the "onboarding." scope
 * prefix itself), declared for transloco-keys-manager:
 * t(onboarding.household.default)
 */
const DEFAULT_NAME_KEY = 'household.default'

/** Step 1: the household's name, prefilled ("Sam’s home"), saved on continue. */
@Component({
  selector: 'app-household-step',
  imports: [BannerComponent, ButtonComponent, FormField, TextFieldComponent, TranslocoPipe],
  template: `
    <form class="flex flex-1 flex-col" novalidate (submit)="save($event)">
      <h1 class="text-title text-ink-1">{{ 'onboarding.household.title' | transloco }}</h1>
      <p class="mt-2 text-body text-ink-2">{{ 'onboarding.household.body' | transloco }}</p>
      @if (failure(); as message) {
        <app-banner
          class="mt-6"
          status="critical"
          [message]="message.key | transloco: message.params ?? {}"
        />
      }
      <app-text-field
        class="mt-8"
        data-testid="onboarding.householdName"
        autocomplete="off"
        [label]="'onboarding.household.label' | transloco"
        [formField]="nameForm.name"
        [error]="fieldErrors()['name'] ?? ''"
      />
      <button
        appButton
        type="submit"
        size="block"
        class="mt-auto"
        data-testid="onboarding.continue"
        [disabled]="nameForm().invalid()"
        [loading]="saving()"
      >
        {{ 'onboarding.continue' | transloco }}
      </button>
    </form>
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export class HouseholdStepComponent {
  private readonly session = inject(SessionStore)
  private readonly households = inject(HouseholdApi)

  readonly done = output<void>()

  private readonly fallbackName = translateSignal(DEFAULT_NAME_KEY, {
    firstName: firstName(this.session.user()?.fullName ?? ''),
  })
  private readonly initialName = computed(
    () => this.session.household()?.name || this.fallbackName()
  )

  private readonly messages = formMessages()
  protected readonly model = signal({ name: this.initialName() })
  protected readonly nameForm = form(this.model, (path) => {
    required(path.name, { message: () => this.messages.required() })
  })
  protected readonly saving = signal(false)
  protected readonly failure = signal<Message | null>(null)
  protected readonly fieldErrors = serverFieldErrors(this.model)

  protected async save(event?: Event): Promise<void> {
    event?.preventDefault()
    if (this.nameForm().invalid() || this.saving()) {
      return
    }
    this.saving.set(true)
    this.failure.set(null)
    try {
      const household = await this.households.update({ name: this.model().name.trim() })
      this.session.patchHousehold(household)
      this.done.emit()
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
