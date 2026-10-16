import { Component, computed, inject } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { UpdateService } from '../../core/pwa/update.service'
import { BannerComponent } from '../../shared/ui/banner/banner.component'
import { TabBarComponent, type TabItem } from '../../shared/ui/tab-bar/tab-bar.component'
import { OutboxPillComponent } from '../outbox/outbox-pill.component'
import { ToastOutletComponent } from '../toast-outlet/toast-outlet.component'

/** Screens reached from More that live outside `/settings`. */
const MORE_SCREENS = ['/categories', '/tags', '/recurring', '/goals', '/upgrade']

/** Bottom padding of the page and the toast's dock, without and with the sync pill (36px + 16px). */
const MAIN = {
  plain: 'pb-[calc(var(--tabbar-height)+var(--safe-bottom))]',
  withPill: 'pb-[calc(var(--tabbar-height)+var(--safe-bottom)+52px)]',
}
const TOAST = {
  plain: 'bottom-[calc(var(--tabbar-height)+var(--safe-bottom)+16px)]',
  withPill: 'bottom-[calc(var(--tabbar-height)+var(--safe-bottom)+60px)]',
}

/**
 * The signed-in frame: page content in a single centred column (max 480px),
 * the bottom tab bar (Month · Transactions · + · More) over the bottom safe
 * area, the sync pill 8px above it while the offline outbox holds entries,
 * toasts docked 16px above both, and the "reload" banner when the service
 * worker cannot recover its cache.
 */
@Component({
  selector: 'app-shell',
  imports: [
    BannerComponent,
    OutboxPillComponent,
    RouterOutlet,
    TabBarComponent,
    ToastOutletComponent,
    TranslocoPipe,
  ],
  template: `
    <div data-testid="app.shell" class="flex min-h-dvh flex-col bg-surface-0 text-ink-1">
      @if (update.unrecoverable()) {
        <app-banner
          class="mx-4 mt-[calc(var(--safe-top)+8px)]"
          status="serious"
          [message]="'pwa.unrecoverable.message' | transloco"
          [actionLabel]="'pwa.unrecoverable.action' | transloco"
          (action)="update.reloadNow()"
        />
      }
      <main [class]="'mx-auto w-full max-w-app flex-1 pt-safe ' + mainPadding()">
        <router-outlet />
      </main>
      <app-toast-outlet [class]="'fixed inset-x-0 z-20 ' + toastDock()" />
      <app-outbox-pill
        class="fixed inset-x-0 bottom-[calc(var(--tabbar-height)+var(--safe-bottom)+8px)] z-10"
      />
      <app-tab-bar
        class="fixed inset-x-0 bottom-0 z-10"
        [tabs]="tabs()"
        [addAfter]="1"
        addPath="/add"
        [label]="'shell.nav.label' | transloco"
        [addLabel]="'shell.tabs.add' | transloco"
      />
    </div>
  `,
})
export class AppShellComponent {
  protected readonly update = inject(UpdateService)
  private readonly outbox = inject(OutboxStore)

  private readonly pillShown = computed(
    () => this.outbox.pendingCount() + this.outbox.failedCount() > 0
  )
  protected readonly mainPadding = computed(() => (this.pillShown() ? MAIN.withPill : MAIN.plain))
  protected readonly toastDock = computed(() => (this.pillShown() ? TOAST.withPill : TOAST.plain))

  private readonly labels = translateSignal([
    'shell.tabs.month',
    'shell.tabs.transactions',
    'shell.tabs.more',
  ])

  protected readonly tabs = computed<TabItem[]>(() => {
    const [month = '', transactions = '', more = ''] = this.labels()
    return [
      { path: '/month', icon: 'calendar', label: month },
      { path: '/transactions', icon: 'list', label: transactions },
      // More stays marked on the screens it lists (the rules live under /settings).
      { path: '/settings', icon: 'ellipsis', label: more, matches: MORE_SCREENS },
    ]
  })
}
