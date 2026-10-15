import { Component, input } from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'
import { IconComponent } from '../../icons/icon.component'
import type { IconName } from '../../icons/icon-names'

export interface TabItem {
  path: string
  icon: IconName
  label: string
}

/**
 * Bottom tab bar (DESIGN.md, Tab bar): 64px plus the bottom safe area,
 * raised surface with a hairline on top. Each tab is a 20px icon over a
 * caption; the active one is accent at weight 600. The add button is an ink
 * 48px square inside the bar (primary action, not the accent), placed after
 * the tab at `addAfter`.
 */
@Component({
  selector: 'app-tab-bar',
  imports: [IconComponent, RouterLink, RouterLinkActive],
  template: `
    <nav [attr.aria-label]="label()" class="border-t border-line bg-surface-1 pb-safe">
      <ul class="mx-auto grid h-16 max-w-app grid-flow-col auto-cols-fr items-center">
        @for (tab of tabs(); track tab.path; let i = $index) {
          <li>
            <a
              [routerLink]="tab.path"
              routerLinkActive="font-semibold text-accent"
              ariaCurrentWhenActive="page"
              class="flex h-14 flex-col items-center justify-center gap-0.5 text-caption text-ink-3"
            >
              <app-icon [name]="tab.icon" />
              <span class="max-w-full truncate px-1">{{ tab.label }}</span>
            </a>
          </li>
          @if (i === addAfter()) {
            <li class="flex justify-center">
              <a
                [routerLink]="addPath()"
                [attr.aria-label]="addLabel()"
                data-testid="shell.add"
                class="grid size-12 place-items-center rounded-lg bg-ink-1 text-surface-0 active:bg-ink-2"
              >
                <app-icon name="plus" [size]="24" />
              </a>
            </li>
          }
        }
      </ul>
    </nav>
  `,
  host: { class: 'block' },
})
export class TabBarComponent {
  readonly tabs = input.required<readonly TabItem[]>()
  /** Accessible name of the navigation landmark. */
  readonly label = input.required<string>()
  /** Index of the tab the add button follows. */
  readonly addAfter = input(1)
  readonly addPath = input('/add')
  readonly addLabel = input.required<string>()
}
