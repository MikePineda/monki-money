import { Component, computed, inject, signal } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import { MembersStore } from '../../../core/household/members.store'
import { ToastStore } from '../../../core/ui/toast.store'
import { goalPayload, type GoalDraft } from '../../../domain/goals'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { GoalsApi } from '../data-access/goals.api'
import { provideGoalsScope } from '../goals.scope'
import { GoalFormComponent } from '../ui/goal-form.component'

/**
 * New goal `/goals/new`: the goal form; saving opens the new goal's detail
 * (replacing this page in the history). A 422 shows under its fields; any
 * other failure is a toast and the form keeps what was typed.
 */
@Component({
  selector: 'app-goal-new-page',
  imports: [GoalFormComponent, IconButtonComponent, RouterLink, TranslocoPipe],
  providers: [provideGoalsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a appIconButton icon="arrow-left" routerLink="/goals" [label]="'goals.back' | transloco"></a>
      <h1 class="min-w-0 flex-1 truncate text-heading text-ink-1">
        {{ 'goals.form.newTitle' | transloco }}
      </h1>
    </header>
    <app-goal-form
      class="px-4 pt-2 pb-8"
      data-testid="goals.new"
      [submitLabel]="'goals.form.create' | transloco"
      [accounts]="directory.activeAccounts()"
      [partnerName]="partnerName()"
      [busy]="busy()"
      [serverErrors]="errors()"
      (submitted)="create($event)"
    />
  `,
})
export default class GoalNewPage {
  protected readonly directory = inject(HouseholdDirectory)
  private readonly members = inject(MembersStore)
  private readonly api = inject(GoalsApi)
  private readonly router = inject(Router)
  private readonly toasts = inject(ToastStore)

  protected readonly busy = signal(false)
  protected readonly errors = signal<Record<string, string>>({})
  protected readonly partnerName = computed(() => this.members.partner()?.name ?? null)

  constructor() {
    void this.directory.load().catch(() => undefined)
  }

  protected async create(draft: GoalDraft): Promise<void> {
    if (this.busy()) {
      return
    }
    this.busy.set(true)
    this.errors.set({})
    try {
      const goal = await this.api.create(
        goalPayload(draft, {
          youId: this.members.you()?.userId ?? null,
          partnerId: this.members.partner()?.userId ?? null,
        })
      )
      await this.router.navigate(['/goals', goal.id], { replaceUrl: true })
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation' && Object.keys(failure.fields).length > 0) {
        this.errors.set(failure.fields)
      } else if (failure.kind !== 'unauthorized') {
        const message = failureMessage(failure)
        this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
      }
    } finally {
      this.busy.set(false)
    }
  }
}
