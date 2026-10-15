import {
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { TurnstileService, type TurnstileHandle } from '../../../core/auth/turnstile.service'
import { LangStore } from '../../../core/i18n/lang.store'
import { ThemeStore } from '../../../core/theme/theme.store'
import { IconComponent } from '../../../shared/icons/icon.component'

/**
 * The Cloudflare Turnstile check on an auth form, rendered only when the API
 * sent a site key. The token comes out through `[(token)]` (null until the
 * check passes, and again once it expires); the form keeps its submit
 * disabled until then and calls {@link reset} after a failed submit, because
 * tokens are single use. Follows the app's theme and language. When the
 * script cannot load, it says so and the token never arrives: the form is
 * never sent without the check.
 */
@Component({
  selector: 'app-turnstile-widget',
  imports: [IconComponent, TranslocoPipe],
  template: `
    <div #container class="min-h-[65px]" data-testid="turnstile.host"></div>
    @if (unavailable()) {
      <p
        class="flex items-center gap-1.5 text-label text-status-critical"
        role="alert"
        data-testid="turnstile.unavailable"
      >
        <app-icon name="circle-alert" [size]="16" />
        {{ 'auth.turnstile.unavailable' | transloco }}
      </p>
    } @else if (rejected()) {
      <p
        class="flex items-center gap-1.5 text-label text-status-critical"
        role="alert"
        data-testid="turnstile.rejected"
      >
        <app-icon name="circle-alert" [size]="16" />
        {{ 'auth.turnstile.rejected' | transloco }}
      </p>
    }
  `,
  host: { class: 'flex flex-col gap-2' },
})
export class TurnstileWidgetComponent {
  private readonly turnstile = inject(TurnstileService)
  private readonly theme = inject(ThemeStore)
  private readonly lang = inject(LangStore)

  readonly siteKey = input.required<string>()
  readonly token = model<string | null>(null)
  /** The API turned the last token down (422 on `turnstileToken`). */
  readonly rejected = input(false)

  protected readonly unavailable = signal(false)
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container')
  private handle: TurnstileHandle | null = null

  constructor() {
    // One widget per site key, theme and language: a change re-renders it.
    afterRenderEffect((onCleanup) => {
      const host = this.container().nativeElement
      const options = {
        siteKey: this.siteKey(),
        theme: this.theme.resolved(),
        language: this.lang.lang(),
      }
      let active = true
      this.handle = null
      this.token.set(null)
      this.unavailable.set(false)
      this.turnstile
        .render(host, {
          ...options,
          onToken: (token) => {
            if (active) {
              this.token.set(token)
            }
          },
        })
        .then(
          (handle) => {
            if (active) {
              this.handle = handle
            } else {
              handle.remove()
            }
          },
          () => {
            if (active) {
              this.unavailable.set(true)
            }
          }
        )
      onCleanup(() => {
        active = false
        this.handle?.remove()
        this.handle = null
      })
    })
  }

  /** Drops the used token and asks Cloudflare for a new one. */
  reset(): void {
    this.token.set(null)
    this.handle?.reset()
  }
}
