import { Component, inject } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { ToastStore } from '../../core/ui/toast.store'
import { ToastComponent } from '../../shared/ui/toast/toast.component'

/**
 * Renders the ToastStore's current toast inside a polite live region that is
 * always in the DOM (so screen readers announce changes). Layouts place it:
 * above the tab bar in the shell, under the top bar on full-screen pages.
 */
@Component({
  selector: 'app-toast-outlet',
  imports: [ToastComponent, TranslocoPipe],
  template: `
    <div role="status" aria-live="polite" class="mx-auto w-full max-w-app px-4">
      @if (toasts.current(); as toast) {
        <app-toast
          class="pointer-events-auto"
          [message]="toast.messageKey | transloco: toast.params ?? {}"
          [status]="toast.status ?? null"
          [actionLabel]="toast.action ? (toast.action.labelKey | transloco) : ''"
          [dismissLabel]="toast.persistent ? ('ui.toast.dismiss' | transloco) : ''"
          (action)="toasts.runAction()"
          (dismissed)="toasts.dismiss(toast.id)"
        />
      }
    </div>
  `,
  host: { class: 'pointer-events-none block' },
})
export class ToastOutletComponent {
  protected readonly toasts = inject(ToastStore)
}
