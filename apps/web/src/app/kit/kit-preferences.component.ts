import { Component, computed, inject } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { LangStore } from '../core/i18n/lang.store'
import { ThemeStore, type ThemePreference } from '../core/theme/theme.store'
import type { AppLang } from '../domain/locale'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../shared/ui/segmented-control/segmented-control.component'

/**
 * t(kit.theme.light, kit.theme.dark, kit.theme.system, kit.lang.en, kit.lang.es)
 */
// Relative to the kit scope, which the hosting gallery page provides.
const THEME_KEYS = ['theme.light', 'theme.dark', 'theme.system']
const LANG_KEYS = ['lang.en', 'lang.es']

/** Live theme and language switches for the gallery pages (development only). */
@Component({
  selector: 'app-kit-preferences',
  imports: [SegmentedControlComponent, TranslocoPipe],
  template: `
    <app-segmented-control
      [label]="'kit.theme.label' | transloco"
      [options]="themeOptions()"
      [value]="theme.preference()"
      (valueChange)="theme.setPreference($event)"
    />
    <app-segmented-control
      [label]="'kit.lang.label' | transloco"
      [options]="langOptions()"
      [value]="lang.lang()"
      (valueChange)="lang.setLang($event)"
    />
  `,
  host: { class: 'flex flex-col gap-2' },
})
export class KitPreferencesComponent {
  protected readonly theme = inject(ThemeStore)
  protected readonly lang = inject(LangStore)

  private readonly themeLabels = translateSignal(THEME_KEYS)
  protected readonly themeOptions = computed<SegmentOption<ThemePreference>[]>(() => {
    const [light = '', dark = '', system = ''] = this.themeLabels()
    return [
      { value: 'light', label: light },
      { value: 'dark', label: dark },
      { value: 'system', label: system },
    ]
  })

  private readonly langLabels = translateSignal(LANG_KEYS)
  protected readonly langOptions = computed<SegmentOption<AppLang>[]>(() => {
    const [en = '', es = ''] = this.langLabels()
    return [
      { value: 'en', label: en },
      { value: 'es', label: es },
    ]
  })
}
