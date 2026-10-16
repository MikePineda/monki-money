import { Injectable, inject } from '@angular/core'
import { API } from '../../../core/api/api'
import type { Goal, GoalWithProjection } from '../../../core/api/api-types'
import type { GoalFields, GoalStatus } from '../../../domain/goals'

/** `GET /goals` answers plain goals unless asked for `include=projection`. */
function hasProjection(goal: Goal | GoalWithProjection): goal is GoalWithProjection {
  return 'projection' in goal
}

/** `PATCH /goals/:id`: any goal field, plus the status (`reached` stamps `reachedAt`). */
export type GoalPatch = Partial<GoalFields> & { status?: GoalStatus }

/**
 * Data access for the household's savings goals and their projections.
 * Any member reads and changes any goal; another household's id is a 404.
 */
@Injectable({ providedIn: 'root' })
export class GoalsApi {
  private readonly api = inject(API)

  /** `GET /goals?status=`: by `sortOrder`. */
  async list(status?: GoalStatus): Promise<Goal[]> {
    const { data } = await (
      await this.api()
    ).request('goals.index', { query: status ? { status } : {} })
    return data
  }

  /**
   * `GET /goals?status=&include=projection`: by `sortOrder`, each goal with
   * its projection, in one request (the API computes them in one pass).
   */
  async listWithProjections(status?: GoalStatus): Promise<GoalWithProjection[]> {
    const { data } = await (
      await this.api()
    ).request('goals.index', {
      query: { ...(status ? { status } : {}), include: 'projection' },
    })
    return data.map((goal) => (hasProjection(goal) ? goal : { ...goal, projection: null }))
  }

  async show(id: number): Promise<Goal> {
    const { data } = await (await this.api()).request('goals.show', { params: { id } })
    return data
  }

  async create(body: GoalFields): Promise<Goal> {
    const { data } = await (await this.api()).request('goals.store', { body })
    return data
  }

  async update(id: number, body: GoalPatch): Promise<Goal> {
    const { data } = await (await this.api()).request('goals.update', { params: { id }, body })
    return data
  }

  async remove(id: number): Promise<void> {
    await (await this.api()).request('goals.destroy', { params: { id } })
  }

  /** `PUT /goals/reorder`: `sortOrder` = position in `ids`. */
  async reorder(ids: number[]): Promise<void> {
    await (await this.api()).request('goals.reorder', { body: { ids } })
  }

  /** Saved today, the monthly rate and when the target is reached at that pace. */
  async projection(id: number) {
    const { data } = await (await this.api()).request('goals.projection', { params: { id } })
    return data
  }
}

export type GoalProjection = Awaited<ReturnType<GoalsApi['projection']>>
