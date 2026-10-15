import { Component, computed, input } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco'
import { IconButtonComponent } from '../../shared/ui/icon-button/icon-button.component'

export type LegalDocument = 'terms' | 'privacy'

/** Scoped keys used from TypeScript: t(legal.terms.title, legal.terms.body, legal.privacy.title, legal.privacy.body) */
const DOCUMENTS: Record<LegalDocument, { title: string; body: string }> = {
  terms: { title: 'legal.terms.title', body: 'legal.terms.body' },
  privacy: { title: 'legal.privacy.title', body: 'legal.privacy.body' },
}

/**
 * Terms and privacy placeholders (`/legal/terms`, `/legal/privacy`), readable
 * signed in or out. The real texts arrive before registration opens.
 */
@Component({
  selector: 'app-legal-page',
  imports: [IconButtonComponent, RouterLink, TranslocoPipe],
  providers: [
    provideTranslocoScope({
      scope: 'legal',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  template: `
    <header class="-ml-4 flex h-14 items-center gap-1">
      <a appIconButton icon="arrow-left" routerLink="/" [label]="'legal.back' | transloco"></a>
      <h1 class="text-heading text-ink-1" [attr.data-testid]="'legal.' + document()">
        {{ keys().title | transloco }}
      </h1>
    </header>
    <p class="mt-4 max-w-[65ch] text-body text-ink-2">{{ keys().body | transloco }}</p>
    <p class="mt-4 text-caption text-ink-3">{{ 'legal.placeholder' | transloco }}</p>
  `,
  host: { class: 'flex flex-col' },
})
export default class LegalPage {
  /** Route data `document`. */
  readonly document = input<LegalDocument>('terms')

  protected readonly keys = computed(() => DOCUMENTS[this.document()])
}
