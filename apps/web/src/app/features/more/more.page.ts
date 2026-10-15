import { Component } from '@angular/core'
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco'
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component'

/** "More" placeholder: settings, categories and import arrive in later packages. */
@Component({
  selector: 'app-more-page',
  imports: [EmptyStateComponent, TranslocoPipe],
  providers: [
    provideTranslocoScope({
      scope: 'more',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  template: `
    <header class="flex h-14 items-center pr-1 pl-4">
      <h1 class="text-title text-ink-1">{{ 'more.title' | transloco }}</h1>
    </header>
    <app-empty-state
      data-testid="more.empty"
      icon="settings"
      [title]="'more.empty.title' | transloco"
      [body]="'more.empty.body' | transloco"
    />
  `,
})
export default class MorePage {}
