import { Component, inject } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { SessionStore } from '../../../core/auth/session.store'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { provideAuthScope } from '../auth.scope'

/**
 * Signed in but in no household (one person = one household; the API has
 * no way to create a second one). The honest next step is an invitation.
 */
@Component({
  selector: 'app-no-household-page',
  imports: [ButtonComponent, EmptyStateComponent, TranslocoPipe],
  providers: [provideAuthScope()],
  template: `
    <app-empty-state
      data-testid="noHousehold.state"
      icon="users"
      [title]="'auth.noHousehold.title' | transloco"
      [body]="'auth.noHousehold.body' | transloco"
    />
    <button
      appButton
      type="button"
      variant="secondary"
      size="block"
      icon="log-out"
      class="mt-auto"
      (click)="session.logout()"
    >
      {{ 'auth.noHousehold.logout' | transloco }}
    </button>
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export default class NoHouseholdPage {
  protected readonly session = inject(SessionStore)
}
