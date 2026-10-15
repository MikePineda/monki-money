import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { provideSettingsScope } from '../settings.scope'

/** Plans placeholder, routed only when the API turns the `billing` flag on. */
@Component({
  selector: 'app-upgrade-page',
  imports: [EmptyStateComponent, IconButtonComponent, RouterLink, TranslocoPipe],
  providers: [provideSettingsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-4 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings"
        [label]="'settings.back' | transloco"
      ></a>
      <h1 class="text-heading text-ink-1">{{ 'settings.upgrade.title' | transloco }}</h1>
    </header>
    <app-empty-state
      data-testid="upgrade.placeholder"
      icon="wallet"
      [title]="'settings.upgrade.placeholderTitle' | transloco"
      [body]="'settings.upgrade.placeholderBody' | transloco"
    />
  `,
})
export default class UpgradePage {}
