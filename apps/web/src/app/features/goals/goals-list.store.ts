import { Injectable, computed, inject, linkedSignal, resource, signal } from '@angular/core'
import type { Goal } from '../../core/api/api-types'
import { failureMessage } from '../../core/api/error-messages'
import { toApiError } from '../../core/api/http-errors'
import { ToastStore } from '../../core/ui/toast.store'
import type { GoalStatus } from '../../domain/goals'
import { moveItem, stepItem } from '../../domain/reorder'
import { GoalsApi, type GoalProjection } from './data-access/goals.api'

/** A goal with where it stands; `projection` is null when it could not be read. */
export interface GoalRow {
  goal: Goal
  projection: GoalProjection | null
}

export type GoalsListStatus = 'loading' | 'ready' | 'error'

/**
 * The goals list: one status at a time (the filter chips), each goal with
 * its projection (`GET /goals/:id/projection` per goal, read in parallel),
 * and the order. Reordering (drag or ▲▼) shows at once and rolls back with
 * a toast if the API refuses it. Provided by the list page, so every visit
 * reads fresh numbers.
 */
@Injectable()
export class GoalsListStore {
  private readonly api = inject(GoalsApi)
  private readonly toasts = inject(ToastStore)

  readonly filter = signal<GoalStatus>('active')
  private readonly attempt = signal(0)

  private readonly list = resource({
    params: () => ({ status: this.filter(), attempt: this.attempt() }),
    loader: ({ params }) => this.fetch(params.status),
  })

  /** The goals on screen, in their order (reorders show here first). */
  readonly rows = linkedSignal<GoalRow[]>(() => (this.list.hasValue() ? this.list.value() : []))

  readonly status = computed<GoalsListStatus>(() => {
    if (this.list.isLoading()) {
      return 'loading'
    }
    return this.list.status() === 'error' ? 'error' : 'ready'
  })

  retry(): void {
    this.attempt.update((value) => value + 1)
  }

  /** ▲ (-1) / ▼ (+1), the accessible way to reorder. */
  step(goalId: number, direction: -1 | 1): Promise<void> {
    return this.reorder(stepItem(this.byId(), goalId, direction))
  }

  /** A drop from the drag handle. */
  move(from: number, to: number): Promise<void> {
    return this.reorder(moveItem(this.byId(), from, to))
  }

  private byId(): readonly (GoalRow & { id: number })[] {
    return this.rows().map((row) => ({ ...row, id: row.goal.id }))
  }

  private async reorder(after: readonly (GoalRow & { id: number })[]): Promise<void> {
    const before = this.rows()
    if (after.every((row, index) => row.goal.id === before[index]?.goal.id)) {
      return
    }
    this.rows.set(after.map(({ goal, projection }) => ({ goal, projection })))
    try {
      await this.api.reorder(after.map((row) => row.id))
    } catch (error) {
      this.rows.set(before)
      const message = failureMessage(toApiError(error))
      this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
    }
  }

  private async fetch(status: GoalStatus): Promise<GoalRow[]> {
    const goals = await this.api.list(status)
    const projections = await Promise.all(
      goals.map((goal) => this.api.projection(goal.id).catch(() => null))
    )
    return goals.map((goal, index) => ({ goal, projection: projections[index] ?? null }))
  }
}
