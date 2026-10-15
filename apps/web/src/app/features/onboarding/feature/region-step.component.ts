import { Component, computed, inject, output, signal } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { LangStore } from '../../../core/i18n/lang.store'
import type { AppLang } from '../../../domain/locale'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'

/**
 * Keys used from TypeScript (translateSignal adds the "onboarding." scope
 * prefix itself), declared for transloco-keys-manager:
 * t(onboarding.region.languages.en, onboarding.region.languages.es, onboarding.region.timezone)
 */
const LANGUAGE_KEYS = ['region.languages.en', 'region.languages.es']
const TIME_ZONE_KEY = 'region.timezone'

/** IANA zones the API accepts; the device's zone first when it is one of them. */
function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

function deviceTimeZone(fallback: string): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return timeZones().includes(zone) ? zone : fallback
}

/**
 * Step 2: AUD (fixed for now), the language (applied at once and saved on
 * the profile) and the household's time zone, prefilled from the device.
 * Continue saves the household's language and time zone.
 */
@Component({
  selector: 'app-region-step',
  imports: [
    BannerComponent,
    ButtonComponent,
    ChipComponent,
    SegmentedControlComponent,
    TranslocoPipe,
  ],
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

    <dl class="mt-8 flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <dt class="text-label text-ink-2">{{ 'onboarding.region.currency' | transloco }}</dt>
        <dd class="flex flex-col gap-0.5">
          <span class="text-body text-ink-1" data-testid="onboarding.currency">{{
            'onboarding.region.currencyValue' | transloco
          }}</span>
          <span class="text-caption text-ink-3">{{
            'onboarding.region.currencyHint' | transloco
          }}</span>
        </dd>
      </div>
      <div class="flex flex-col gap-2">
        <dt class="text-label text-ink-2">{{ 'onboarding.region.language' | transloco }}</dt>
        <dd>
          <app-segmented-control
            data-testid="onboarding.language"
            [label]="'onboarding.region.language' | transloco"
            [options]="languageOptions()"
            [value]="lang.lang()"
            (valueChange)="lang.setLang($event)"
          />
        </dd>
      </div>
      <div class="flex flex-col gap-2">
        <dt class="text-label text-ink-2">{{ 'onboarding.region.timezone' | transloco }}</dt>
        <dd>
          <button
            appChip
            trailing="chevron-down"
            data-testid="onboarding.timezone"
            (click)="chooseTimeZone()"
          >
            {{ timeZone() }}
          </button>
        </dd>
      </div>
    </dl>

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
  private readonly sheets = inject(BottomSheetService)
  protected readonly lang = inject(LangStore)

  readonly done = output<void>()

  private readonly languageNames = translateSignal(LANGUAGE_KEYS)
  private readonly timeZoneTitle = translateSignal(TIME_ZONE_KEY)

  protected readonly languageOptions = computed<SegmentOption<AppLang>[]>(() => {
    const [en = '', es = ''] = this.languageNames()
    return [
      { value: 'en', label: en },
      { value: 'es', label: es },
    ]
  })

  protected readonly timeZone = signal(
    deviceTimeZone(this.session.household()?.timezone ?? 'Australia/Brisbane')
  )
  protected readonly saving = signal(false)
  protected readonly failure = signal<Message | null>(null)

  protected chooseTimeZone(): void {
    openSelectSheet(this.sheets, {
      title: this.timeZoneTitle(),
      options: timeZones().map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') })),
      selected: this.timeZone(),
    }).subscribe((zone) => {
      if (zone) {
        this.timeZone.set(zone)
      }
    })
  }

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
