import { Injectable, computed, inject, resource, signal } from '@angular/core'
import type { Goal } from '../../core/api/api-types'
import { failureMessage } from '../../core/api/error-messages'
import { hasStatus, toApiError } from '../../core/api/http-errors'
import { ToastStore } from '../../core/ui/toast.store'
import type { GoalFields, GoalStatus } from '../../domain/goals'
import { GoalsApi, type GoalProjection } from './data-access/goals.api'

export interface GoalDetail {
  goal: Goal
  projection: GoalProjection
}

export type GoalDetailStatus = 'loading' | 'ready' | 'notFound' | 'error'

/** `ok: false` with `fields` = the API's 422 messages by field (empty for other failures). */
export interface SaveResult {
  ok: boolean
  fields: Record<string, string>
}

/**
 * Toasts after a status change. Keys read from TypeScript:
 * t(goals.detail.toast.reached, goals.detail.toast.archived, goals.detail.toast.active)
 * t(goals.detail.toast.deleted, goals.detail.toast.saved)
 */
const STATUS_TOAST: Record<GoalStatus, string> = {
  reached: 'goals.detail.toast.reached',
  archived: 'goals.detail.toast.archived',
  active: 'goals.detail.toast.active',
}

/**
 * One goal and its projection (`/goals/:id`): load, edit, change status
 * (reached, archived, back to active) and delete. Every change reloads the
 * projection, which depends on the goal's fields. Provided by the page.
 */
@Injectable()
export class GoalDetailStore {
  private readonly api = inject(GoalsApi)
  private readonly toasts = inject(ToastStore)

  private readonly id = signal<number | null>(null)
  private readonly attempt = signal(0)
  readonly busy = signal(false)

  private readonly loaded = resource({
    params: () => {
      const id = this.id()
      return id === null ? undefined : { id, attempt: this.attempt() }
    },
    loader: async ({ params }): Promise<GoalDetail> => {
      const [goal, projection] = await Promise.all([
        this.api.show(params.id),
        this.api.projection(params.id),
      ])
      return { goal, projection }
    },
  })

  /** The goal on screen; kept while a change reloads it. */
  readonly detail = computed(() => (this.loaded.hasValue() ? this.loaded.value() : undefined))

  readonly status = computed<GoalDetailStatus>(() => {
    if (this.loaded.status() === 'error') {
      return hasStatus(toApiError(this.loaded.error()), 404) ? 'notFound' : 'error'
    }
    return this.detail() ? 'ready' : 'loading'
  })

  /** Shows this goal (an id that is not a number is simply not found). */
  open(id: number): void {
    this.id.set(id)
  }

  retry(): void {
    this.attempt.update((value) => value + 1)
  }

  async save(fields: GoalFields): Promise<SaveResult> {
    const id = this.id()
    if (id === null) {
      return { ok: false, fields: {} }
    }
    return this.run(async () => {
      await this.api.update(id, fields)
      this.toasts.show({ messageKey: 'goals.detail.toast.saved', status: 'good' })
    })
  }

  async setStatus(status: GoalStatus): Promise<boolean> {
    const id = this.id()
    const name = this.detail()?.goal.name ?? ''
    if (id === null) {
      return false
    }
    const result = await this.run(async () => {
      await this.api.update(id, { status })
      this.toasts.show({ messageKey: STATUS_TOAST[status], params: { name } })
    })
    return result.ok
  }

  async remove(): Promise<boolean> {
    const id = this.id()
    const name = this.detail()?.goal.name ?? ''
    if (id === null || this.busy()) {
      return false
    }
    this.busy.set(true)
    try {
      await this.api.remove(id)
      this.toasts.show({ messageKey: 'goals.detail.toast.deleted', params: { name } })
      return true
    } catch (error) {
      this.fail(error)
      return false
    } finally {
      this.busy.set(false)
    }
  }

  /** One change at a time; success reloads the goal and its projection. */
  private async run(change: () => Promise<void>): Promise<SaveResult> {
    if (this.busy()) {
      return { ok: false, fields: {} }
    }
    this.busy.set(true)
    try {
      await change()
      this.loaded.reload()
      return { ok: true, fields: {} }
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation' && Object.keys(failure.fields).length > 0) {
        return { ok: false, fields: failure.fields }
      }
      this.fail(error)
      return { ok: false, fields: {} }
    } finally {
      this.busy.set(false)
    }
  }

  private fail(error: unknown): void {
    const failure = toApiError(error)
    if (failure.kind === 'unauthorized') {
      return
    }
    const message = failureMessage(failure)
    this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
  }
}
