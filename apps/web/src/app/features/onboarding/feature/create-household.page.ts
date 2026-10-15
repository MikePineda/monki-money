import { Component, computed, inject, linkedSignal, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { Router } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { serverFieldErrors } from '../../../core/api/server-errors'
import { OnboardingStatus } from '../../../core/auth/onboarding-status'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { formMessages } from '../../../core/i18n/form-messages'
import { LangStore } from '../../../core/i18n/lang.store'
import { invitationToken } from '../../../domain/invitation-link'
import { firstName } from '../../../domain/people'
import { deviceTimeZone } from '../../../domain/time-zones'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { ACCOUNTS_STEP } from '../onboarding-steps'
import { provideOnboardingScope } from '../onboarding.scope'
import { RegionFieldsComponent } from '../ui/region-fields.component'

/**
 * Keys used from TypeScript (translateSignal adds the "onboarding." scope
 * prefix itself), declared for transloco-keys-manager:
 * t(onboarding.household.default, onboarding.create.alreadyIn)
 */
const DEFAULT_NAME_KEY = 'household.default'

/** The only currency for now (BRIEF: AUD). */
const CURRENCY = 'AUD'

/**
 * "Create your household" (`/household/new`): for someone signed in and
 * verified who has no household, because they left one or never had one.
 * The same name and money-and-time fields as the onboarding wizard; the new
 * household then continues in the wizard on its accounts step. "I have an
 * invite link" takes a pasted invitation link (or its code) to the
 * invitation screen instead.
 */
@Component({
  selector: 'app-create-household-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    FormField,
    RegionFieldsComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  providers: [provideOnboardingScope()],
  template: `
    @if (joining()) {
      <form class="flex flex-1 flex-col" novalidate (submit)="openInvitation($event)">
        <h1 class="text-title text-ink-1" data-testid="createHousehold.joinTitle">
          {{ 'onboarding.create.join.title' | transloco }}
        </h1>
        <p class="mt-2 text-body text-ink-2">{{ 'onboarding.create.join.body' | transloco }}</p>
        <app-text-field
          class="mt-8"
          data-testid="createHousehold.invite"
          inputmode="url"
          autocomplete="off"
          [label]="'onboarding.create.join.label' | transloco"
          [formField]="inviteForm.link"
          [error]="inviteErrors()['link'] ? ('onboarding.create.join.invalid' | transloco) : ''"
        />
        <div class="mt-auto flex flex-col gap-2 pt-8">
          <button
            appButton
            type="submit"
            size="block"
            data-testid="createHousehold.openInvite"
            [disabled]="inviteForm().invalid()"
          >
            {{ 'onboarding.create.join.submit' | transloco }}
          </button>
          <button appButton type="button" variant="ghost" (click)="joining.set(false)">
            {{ 'onboarding.create.join.back' | transloco }}
          </button>
        </div>
      </form>
    } @else {
      <form class="flex flex-1 flex-col" novalidate (submit)="create($event)">
        <h1 class="text-title text-ink-1" data-testid="createHousehold.title">
          {{ 'onboarding.create.title' | transloco }}
        </h1>
        <p class="mt-2 text-body text-ink-2">{{ 'onboarding.create.body' | transloco }}</p>
        @if (failure(); as message) {
          <app-banner
            class="mt-6"
            data-testid="createHousehold.error"
            status="critical"
            [message]="message.key | transloco: message.params ?? {}"
            [actionLabel]="alreadyIn() ? ('onboarding.create.goToApp' | transloco) : ''"
            (action)="goHome()"
          />
        }
        <app-text-field
          class="mt-8"
          data-testid="createHousehold.name"
          autocomplete="off"
          [label]="'onboarding.household.label' | transloco"
          [formField]="nameForm.name"
          [error]="fieldErrors()['name'] ?? ''"
        />
        <app-region-fields
          class="mt-6"
          [language]="lang.lang()"
          (languageChange)="lang.setLang($event)"
          [(timeZone)]="timeZone"
        />
        <div class="mt-auto flex flex-col gap-2 pt-8">
          <button
            appButton
            type="submit"
            size="block"
            data-testid="createHousehold.submit"
            [disabled]="nameForm().invalid()"
            [loading]="saving()"
          >
            {{ 'onboarding.create.submit' | transloco }}
          </button>
          <button
            appButton
            type="button"
            variant="ghost"
            data-testid="createHousehold.haveInvite"
            (click)="joining.set(true)"
          >
            {{ 'onboarding.create.haveInvite' | transloco }}
          </button>
          <button
            appButton
            type="button"
            variant="ghost"
            icon="log-out"
            data-testid="createHousehold.logout"
            (click)="session.logout()"
          >
            {{ 'onboarding.create.logout' | transloco }}
          </button>
        </div>
      </form>
    }
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class CreateHouseholdPage {
  protected readonly session = inject(SessionStore)
  private readonly households = inject(HouseholdApi)
  private readonly onboarding = inject(OnboardingStatus)
  private readonly router = inject(Router)
  protected readonly lang = inject(LangStore)

  private readonly messages = formMessages()
  private readonly defaultName = translateSignal(DEFAULT_NAME_KEY, {
    firstName: firstName(this.session.user()?.fullName ?? ''),
  })
  /** Follows the default name (its catalogue loading, a language switch) until the person edits it. */
  protected readonly model = linkedSignal<string, { name: string }>({
    source: this.defaultName,
    computation: (name, previous) =>
      previous && previous.value.name !== previous.source ? previous.value : { name },
  })
  protected readonly nameForm = form(this.model, (path) => {
    required(path.name, { message: () => this.messages.required() })
  })
  protected readonly fieldErrors = serverFieldErrors(this.model)
  protected readonly timeZone = signal(deviceTimeZone())
  protected readonly saving = signal(false)
  protected readonly failure = signal<Message | null>(null)
  protected readonly alreadyIn = computed(
    () => this.failure()?.key === 'onboarding.create.alreadyIn'
  )

  protected readonly joining = signal(false)
  protected readonly inviteModel = signal({ link: '' })
  protected readonly inviteForm = form(this.inviteModel, (path) => {
    required(path.link, { message: () => this.messages.required() })
  })
  protected readonly inviteErrors = serverFieldErrors(this.inviteModel)

  protected async create(event?: Event): Promise<void> {
    event?.preventDefault()
    if (this.nameForm().invalid() || this.saving()) {
      return
    }
    this.saving.set(true)
    this.failure.set(null)
    try {
      const { household } = await this.households.create({
        name: this.model().name.trim(),
        locale: this.lang.lang(),
        timezone: this.timeZone(),
        currencyCode: CURRENCY,
      })
      await this.session.load()
      // Name and region are set: the wizard picks up at the accounts.
      this.onboarding.saveStep(household.id, ACCOUNTS_STEP)
      await this.router.navigateByUrl('/onboarding')
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.fieldErrors.set(failure.fields)
      } else if (hasStatus(failure, 409)) {
        this.failure.set({ key: 'onboarding.create.alreadyIn' })
      } else {
        this.failure.set(failureMessage(failure))
      }
    } finally {
      this.saving.set(false)
    }
  }

  protected async openInvitation(event: Event): Promise<void> {
    event.preventDefault()
    const token = invitationToken(this.inviteModel().link)
    if (!token) {
      this.inviteErrors.set({ link: 'invalid' })
      return
    }
    await this.router.navigate(['/invite', token])
  }

  /** The session was out of date (a household exists after all): go where it belongs. */
  protected async goHome(): Promise<void> {
    await this.session.load()
    await this.router.navigateByUrl(this.session.homePath())
  }
}
