import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco'
import { ButtonComponent } from '../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component'

/** Transactions placeholder: the list, filters and day groups arrive in phase 2. */
@Component({
  selector: 'app-transactions-page',
  imports: [ButtonComponent, EmptyStateComponent, RouterLink, TranslocoPipe],
  providers: [
    provideTranslocoScope({
      scope: 'transactions',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  template: `
    <header class="flex h-14 items-center pr-1 pl-4">
      <h1 class="text-title text-ink-1">{{ 'transactions.title' | transloco }}</h1>
    </header>
    <app-empty-state
      data-testid="transactions.empty"
      icon="list"
      [title]="'transactions.empty.title' | transloco"
      [body]="'transactions.empty.body' | transloco"
    >
      <a appButton variant="secondary" icon="plus" routerLink="/add">
        {{ 'transactions.empty.action' | transloco }}
      </a>
    </app-empty-state>
  `,
})
export default class TransactionsPage {}
