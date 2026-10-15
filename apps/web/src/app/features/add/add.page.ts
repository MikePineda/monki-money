import { Component, computed, input } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco'
import type { TransactionKind } from '../../domain/money'
import { ToastOutletComponent } from '../../layouts/toast-outlet/toast-outlet.component'
import { ButtonComponent } from '../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component'

const KINDS: readonly TransactionKind[] = ['expense', 'income', 'transfer']

/**
 * Quick add placeholder, full screen (no tab bar) because the keypad will own
 * the bottom edge. Reachable from the tab bar and the manifest shortcut
 * `/add?type=expense`; toasts dock under the top bar here.
 */
@Component({
  selector: 'app-add-page',
  imports: [ButtonComponent, EmptyStateComponent, RouterLink, ToastOutletComponent, TranslocoPipe],
  providers: [
    provideTranslocoScope({
      scope: 'add',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  template: `
    <div class="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-surface-0 pt-safe text-ink-1">
      <header class="flex h-14 items-center justify-between gap-2 pr-1 pl-4">
        <h1 class="truncate text-heading text-ink-1" data-testid="add.title">
          @switch (kind()) {
            @case ('income') {
              {{ 'add.title.income' | transloco }}
            }
            @case ('transfer') {
              {{ 'add.title.transfer' | transloco }}
            }
            @default {
              {{ 'add.title.expense' | transloco }}
            }
          }
        </h1>
        <a appButton variant="ghost" routerLink="/month">{{ 'add.done' | transloco }}</a>
      </header>
      <app-toast-outlet class="sticky top-0 z-20" />
      <app-empty-state
        class="flex-1"
        data-testid="add.empty"
        icon="plus"
        [title]="'add.empty.title' | transloco"
        [body]="'add.empty.body' | transloco"
      />
    </div>
  `,
})
export default class AddPage {
  /** Bound from the `type` query parameter (router component input binding). */
  readonly type = input<string | undefined>(undefined)

  protected readonly kind = computed<TransactionKind>(() => {
    const type = this.type()
    return KINDS.find((kind) => kind === type) ?? 'expense'
  })
}
