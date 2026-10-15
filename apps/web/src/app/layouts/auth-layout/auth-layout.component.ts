import { Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { ToastOutletComponent } from '../toast-outlet/toast-outlet.component'

/**
 * The signed-out frame (login, signup, verify, reset, invite): the product
 * name, one centred column within the gutters and safe areas, no tab bar.
 * The auth screens arrive with the session package and render in the outlet.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, ToastOutletComponent, TranslocoPipe],
  template: `
    <div data-testid="auth.layout" class="flex min-h-dvh flex-col bg-surface-0 text-ink-1">
      <header class="mx-auto flex h-14 w-full max-w-app items-center px-gutter pt-safe">
        <p class="text-heading text-ink-1">{{ 'app.name' | transloco }}</p>
      </header>
      <main
        class="mx-auto flex w-full max-w-app flex-1 flex-col px-gutter pt-6 pb-[max(24px,var(--safe-bottom))]"
      >
        <router-outlet />
      </main>
      <app-toast-outlet class="fixed inset-x-0 bottom-[calc(var(--safe-bottom)+16px)] z-20" />
    </div>
  `,
})
export class AuthLayoutComponent {}
