import { Component, inject, output, signal } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { LangStore } from '../../../core/i18n/lang.store'
import { deviceTimeZone } from '../../../domain/time-zones'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { RegionFieldsComponent } from '../ui/region-fields.component'

/**
 * Step 2: AUD (fixed for now), the language (applied at once and saved on
 * the profile) and the household's time zone, prefilled from the device.
 * Continue saves the household's language and time zone.
 */
@Component({
  selector: 'app-region-step',
  imports: [BannerComponent, ButtonComponent, RegionFieldsComponent, TranslocoPipe],
  template: `
    <h1 class="text-title text-ink-1">{{ 'onboarding.region.title' | transloco }}</h1>
    <p class="mt-2 text-body text-ink-2">{{ 'onboarding.region.body' | transloco }}</p>
    @if (failure(); as message) {
      <app-banner
        class="mt-6"
        status="critical"
        [message]="message.key | transloco: message.params ?? {}"
      />
    }

    <app-region-fields
      class="mt-8"
      [language]="lang.lang()"
      (languageChange)="lang.setLang($event)"
      [(timeZone)]="timeZone"
    />

    <button
      appButton
      type="button"
      size="block"
      class="mt-auto"
      data-testid="onboarding.continue"
      [loading]="saving()"
      (click)="save()"
    >
      {{ 'onboarding.continue' | transloco }}
    </button>
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export class RegionStepComponent {
  private readonly session = inject(SessionStore)
  private readonly households = inject(HouseholdApi)
  protected readonly lang = inject(LangStore)

  readonly done = output<void>()

  protected readonly timeZone = signal(deviceTimeZone(this.session.household()?.timezone))
  protected readonly saving = signal(false)
  protected readonly failure = signal<Message | null>(null)

  protected async save(): Promise<void> {
    if (this.saving()) {
      return
    }
    this.saving.set(true)
    this.failure.set(null)
    try {
      const household = await this.households.update({
        locale: this.lang.lang(),
        timezone: this.timeZone(),
      })
      this.session.patchHousehold(household)
      this.done.emit()
    } catch (error) {
      this.failure.set(failureMessage(toApiError(error)))
    } finally {
      this.saving.set(false)
    }
  }
}
