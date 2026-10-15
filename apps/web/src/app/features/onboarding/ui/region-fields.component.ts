import { Component, computed, inject, model } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import type { AppLang } from '../../../domain/locale'
import { supportedTimeZones } from '../../../domain/time-zones'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
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

/**
 * A household's money and time: the currency (AUD, fixed for now), the
 * language and the IANA time zone (picked in a select sheet). Shared by the
 * onboarding wizard and the "create your household" screen; the parent
 * decides what a change does.
 */
@Component({
  selector: 'app-region-fields',
  imports: [ChipComponent, SegmentedControlComponent, TranslocoPipe],
  template: `
    <dl class="flex flex-col gap-6">
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
            [value]="language()"
            (valueChange)="language.set($event)"
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
  `,
})
export class RegionFieldsComponent {
  private readonly sheets = inject(BottomSheetService)

  readonly language = model.required<AppLang>()
  readonly timeZone = model.required<string>()

  private readonly languageNames = translateSignal(LANGUAGE_KEYS)
  private readonly timeZoneTitle = translateSignal(TIME_ZONE_KEY)

  protected readonly languageOptions = computed<SegmentOption<AppLang>[]>(() => {
    const [en = '', es = ''] = this.languageNames()
    return [
      { value: 'en', label: en },
      { value: 'es', label: es },
    ]
  })

  protected chooseTimeZone(): void {
    openSelectSheet(this.sheets, {
      title: this.timeZoneTitle(),
      options: supportedTimeZones().map((zone) => ({
        value: zone,
        label: zone.replaceAll('_', ' '),
      })),
      selected: this.timeZone(),
    }).subscribe((zone) => {
      if (zone) {
        this.timeZone.set(zone)
      }
    })
  }
}
