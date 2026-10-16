import { Component, computed, inject, signal } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { LangStore } from '../../core/i18n/lang.store'
import type { AppLang } from '../../domain/locale'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../shared/ui/segmented-control/segmented-control.component'
import { ToastOutletComponent } from '../toast-outlet/toast-outlet.component'

/**
 * The signed-out frame (login, signup, verify, reset, invite): the product
 * name, one centred column within the gutters and safe areas, no tab bar.
 * The auth screens arrive with the session package and render in the outlet.
 *
 * The header carries the language switch: the screens start in the
 * device's language (LangStore), and a choice here is applied at once,
 * remembered on the device and sent with the sign-up (the account's mails
 * and summaries follow it). "Create your household" asks for the language
 * in its own form, so it turns the switch off.
 *
 * Global keys picked at runtime: t(language.en, language.es)
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, SegmentedControlComponent, ToastOutletComponent, TranslocoPipe],
  template: `
    <div data-testid="auth.layout" class="flex min-h-dvh flex-col bg-surface-0 text-ink-1">
      <header
        class="mx-auto flex h-14 w-full max-w-app items-center justify-between gap-4 px-gutter pt-safe"
      >
        <p class="text-heading text-ink-1">{{ 'app.name' | transloco }}</p>
        @if (languageSwitch()) {
          <app-segmented-control
            data-testid="auth.language"
            class="w-40 shrink-0"
            [label]="'language.label' | transloco"
            [options]="languages()"
            [value]="lang.lang()"
            (valueChange)="lang.setLang($event)"
          />
        }
      </header>
      <main
        class="mx-auto flex w-full max-w-app flex-1 flex-col px-gutter pt-6 pb-[max(24px,var(--safe-bottom))]"
      >
        <router-outlet #outlet="outlet" (activate)="routed(outlet)" />
      </main>
      <app-toast-outlet class="fixed inset-x-0 bottom-[calc(var(--safe-bottom)+16px)] z-20" />
    </div>
  `,
})
export class AuthLayoutComponent {
  protected readonly lang = inject(LangStore)
  /** Off on screens that ask for the language themselves (route data `languageSwitch: false`). */
  protected readonly languageSwitch = signal(true)

  private readonly names = translateSignal(['language.en', 'language.es'])
  /** Each language in its own name, whatever the screen's language. */
  protected readonly languages = computed<SegmentOption<AppLang>[]>(() => {
    const [en = '', es = ''] = this.names()
    return [
      { value: 'en', label: en },
      { value: 'es', label: es },
    ]
  })

  protected routed(outlet: RouterOutlet): void {
    this.languageSwitch.set(outlet.activatedRouteData['languageSwitch'] !== false)
  }
}
