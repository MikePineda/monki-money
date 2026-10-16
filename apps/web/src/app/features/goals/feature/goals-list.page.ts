import { CdkDrag, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop'
import { Component, inject, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { MembersStore } from '../../../core/household/members.store'
import { ownerOf, type GoalStatus } from '../../../domain/goals'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { GoalsListStore } from '../goals-list.store'
import { provideGoalsScope } from '../goals.scope'
import { GoalCardComponent } from '../ui/goal-card.component'

/**
 * Keys picked at runtime, declared for transloco-keys-manager:
 * t(goals.filters.active, goals.filters.reached, goals.filters.archived)
 * t(goals.empty.active.title, goals.empty.active.body, goals.empty.reached.title)
 * t(goals.empty.reached.body, goals.empty.archived.title, goals.empty.archived.body)
 * t(goals.owner.household, goals.owner.you)
 */
const FILTERS: readonly GoalStatus[] = ['active', 'reached', 'archived']
const OWNER_KEYS = ['owner.household', 'owner.you']

/**
 * Savings goals `/goals` (reached from More): one card per goal in the
 * household's order, filtered by status (Active / Reached / Archived).
 * Reorder by dragging a card's handle or, in reorder mode, with ▲▼.
 * An empty list says so with one action.
 */
@Component({
  selector: 'app-goals-list-page',
  imports: [
    ButtonComponent,
    CdkDrag,
    CdkDropList,
    ChipComponent,
    EmptyStateComponent,
    GoalCardComponent,
    IconButtonComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [GoalsListStore, provideGoalsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings"
        [label]="'goals.back' | transloco"
      ></a>
      <h1 class="min-w-0 flex-1 truncate text-heading text-ink-1">
        {{ 'goals.title' | transloco }}
      </h1>
      <button
        appIconButton
        type="button"
        icon="arrow-up-down"
        data-testid="goals.reorder"
        [label]="'goals.reorder' | transloco"
        [pressed]="reorderMode()"
        (click)="reorderMode.set(!reorderMode())"
      ></button>
      <a
        appIconButton
        icon="plus"
        routerLink="/goals/new"
        data-testid="goals.add"
        [label]="'goals.add' | transloco"
      ></a>
    </header>

    <div
      role="group"
      class="flex gap-2 overflow-x-auto px-4 pt-1 pb-4"
      data-testid="goals.filters"
      [attr.aria-label]="'goals.filters.label' | transloco"
    >
      @for (filter of filters; track filter) {
        <button
          appChip
          pressable
          [attr.data-testid]="'goals.filter.' + filter"
          [selected]="store.filter() === filter"
          (click)="store.filter.set(filter)"
        >
          {{ 'goals.filters.' + filter | transloco }}
        </button>
      }
    </div>

    @if (reorderMode()) {
      <p class="px-4 pb-3 text-caption text-ink-3" role="status">
        {{ 'goals.reorderHint' | transloco }}
      </p>
    }

    @switch (store.status()) {
      @case ('loading') {
        <div class="flex flex-col gap-3 px-4" data-testid="goals.loading" role="status">
          <span class="sr-only">{{ 'goals.loading' | transloco }}</span>
          @for (item of [1, 2, 3]; track item) {
            <app-skeleton height="132px" />
          }
        </div>
      }
      @case ('error') {
        <app-empty-state
          data-testid="goals.error"
          icon="wifi-off"
          [title]="'goals.error.title' | transloco"
          [body]="'goals.error.body' | transloco"
        >
          <button
            appButton
            type="button"
            variant="secondary"
            icon="refresh-cw"
            (click)="store.retry()"
          >
            {{ 'goals.error.retry' | transloco }}
          </button>
        </app-empty-state>
      }
      @default {
        @if (store.rows().length === 0) {
          <app-empty-state
            data-testid="goals.empty"
            icon="piggy-bank"
            [title]="'goals.empty.' + store.filter() + '.title' | transloco"
            [body]="'goals.empty.' + store.filter() + '.body' | transloco"
          >
            @if (store.filter() === 'active') {
              <a appButton icon="plus" routerLink="/goals/new" data-testid="goals.empty.add">{{
                'goals.empty.active.action' | transloco
              }}</a>
            }
          </app-empty-state>
        } @else {
          <div
            cdkDropList
            role="list"
            class="flex flex-col gap-3 px-4 pb-8"
            data-testid="goals.list"
            [attr.aria-label]="'goals.title' | transloco"
            (cdkDropListDropped)="dropped($event)"
          >
            @for (row of store.rows(); track row.goal.id; let first = $first; let last = $last) {
              <app-goal-card
                cdkDrag
                cdkDragPreviewClass="mm-drag-preview"
                [row]="row"
                [ownerLabel]="ownerLabel(row.goal.userId)"
                [reorderMode]="reorderMode()"
                [canMoveUp]="!first"
                [canMoveDown]="!last"
                (moved)="store.step(row.goal.id, $event)"
              />
            }
          </div>
        }
      }
    }
  `,
})
export default class GoalsListPage {
  protected readonly store = inject(GoalsListStore)
  private readonly members = inject(MembersStore)

  protected readonly filters = FILTERS
  protected readonly reorderMode = signal(false)
  private readonly ownerWords = translateSignal(OWNER_KEYS)

  /** "Household", "You" or the partner's first name. */
  protected ownerLabel(userId: number | null): string {
    const [household = '', you = ''] = this.ownerWords()
    const people = {
      youId: this.members.you()?.userId ?? null,
      partnerId: this.members.partner()?.userId ?? null,
    }
    switch (ownerOf(userId, people)) {
      case 'you':
        return you
      case 'partner':
        return this.members.partner()?.name ?? household
      default:
        return household
    }
  }

  protected dropped(event: CdkDragDrop<unknown>): void {
    void this.store.move(event.previousIndex, event.currentIndex)
  }
}
