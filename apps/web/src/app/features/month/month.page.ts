import { Component, computed, inject, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco'
import { HOUSEHOLD_TIME_ZONE } from '../../core/platform/time-zone.token'
import { currentMonthIn, label } from '../../domain/month'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { ButtonComponent } from '../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component'
import { MonthPickerComponent } from '../../shared/ui/month-picker/month-picker.component'

/**
 * Month view placeholder: the month strip and an honest empty state. The
 * hero, stat tiles and charts arrive with the ledger and charts packages.
 */
@Component({
  selector: 'app-month-page',
  imports: [ButtonComponent, EmptyStateComponent, MonthPickerComponent, RouterLink, TranslocoPipe],
  providers: [
    provideTranslocoScope({
      scope: 'month',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  template: `
    <h1 class="sr-only">{{ 'month.title' | transloco }}</h1>
    <header class="flex h-14 items-center pr-1 pl-3">
      <app-month-picker
        class="flex-1"
        [label]="'month.picker.label' | transloco"
        [current]="current"
        [(selected)]="selected"
      />
    </header>
    <app-empty-state
      data-testid="month.empty"
      icon="calendar"
      [title]="'month.empty.title' | transloco: { month: monthName() }"
      [body]="'month.empty.body' | transloco"
    >
      <a appButton variant="secondary" icon="plus" routerLink="/add">{{
        'month.empty.action' | transloco
      }}</a>
    </app-empty-state>
  `,
})
export default class MonthPage {
  private readonly locale = inject(APP_LOCALE)

  protected readonly current = currentMonthIn(inject(HOUSEHOLD_TIME_ZONE)())
  protected readonly selected = signal(this.current)
  protected readonly monthName = computed(() =>
    label(this.selected(), this.locale(), {
      long: true,
      withYear: this.selected() !== this.current,
    })
  )
}
