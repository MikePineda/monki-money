import { Component, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterLink } from '@angular/router'
import { filter, map } from 'rxjs'
import { IconComponent } from '../../icons/icon.component'
import type { IconName } from '../../icons/icon-names'

export interface TabItem {
  path: string
  icon: IconName
  label: string
  /** Other URL prefixes that also mark this tab active (screens reached from it). */
  matches?: readonly string[]
}

/**
 * Bottom tab bar (DESIGN.md, Tab bar): 64px plus the bottom safe area,
 * raised surface with a hairline on top. Each tab is a 20px icon over a
 * caption; the active one is accent at weight 600. The add button is an ink
 * 48px square inside the bar (primary action, not the accent), placed after
 * the tab at `addAfter`. A tab is active on its path and below it, and on
 * the screens listed in its `matches` (whole path segments).
 */
@Component({
  selector: 'app-tab-bar',
  imports: [IconComponent, RouterLink],
  template: `
    <nav [attr.aria-label]="label()" class="border-t border-line bg-surface-1 pb-safe">
      <ul class="mx-auto grid h-16 max-w-app grid-flow-col auto-cols-fr items-center">
        @for (tab of tabs(); track tab.path; let i = $index) {
          <li>
            <a
              [routerLink]="tab.path"
              [attr.aria-current]="isActive(tab) ? 'page' : null"
              class="flex h-14 flex-col items-center justify-center gap-0.5 text-caption text-ink-3 aria-[current=page]:font-semibold aria-[current=page]:text-accent"
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
  private readonly router = inject(Router)
  /** The current path, without query or fragment. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.currentPath())
    ),
    { initialValue: this.currentPath() }
  )

  readonly tabs = input.required<readonly TabItem[]>()
  /** Accessible name of the navigation landmark. */
  readonly label = input.required<string>()
  /** Index of the tab the add button follows. */
  readonly addAfter = input(1)
  readonly addPath = input('/add')
  readonly addLabel = input.required<string>()

  protected isActive(tab: TabItem): boolean {
    const path = this.path()
    return [tab.path, ...(tab.matches ?? [])].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    )
  }

  private currentPath(): string {
    return this.router.url.split(/[?#]/)[0] ?? ''
  }
}
