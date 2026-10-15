import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import GoalService from '#services/goals/goal_service'
import { reorderValidator } from '#validators/reorder'
import GoalTransformer from '#transformers/goal_transformer'
import {
  createGoalValidator,
  goalParamsValidator,
  listGoalsValidator,
  updateGoalValidator,
} from '#validators/goals'

/** Savings goals of the current household (any member). */
@inject()
export default class GoalsController {
  constructor(protected goals: GoalService) {}

  /** GET /goals?status= */
  async index(ctx: HttpContext) {
    const filters = await ctx.request.validateUsing(listGoalsValidator)

    const goals = await this.goals.list(ctx.household, filters)

    return ctx.serialize(GoalTransformer.transform(goals))
  }

  /** POST /goals */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createGoalValidator)

    const goal = await this.goals.create(ctx.household, ctx.auth.getUserOrFail(), payload)

    ctx.response.status(201)
    return ctx.serialize(GoalTransformer.transform(goal))
  }

  /** GET /goals/:id */
  async show(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(goalParamsValidator)

    const goal = await this.goals.find(ctx.household, params.id)

    return ctx.serialize(GoalTransformer.transform(goal))
  }

  /** PATCH /goals/:id: `status: 'reached'` stamps `reachedAt`. */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateGoalValidator)

    const goal = await this.goals.update(ctx.household, params.id, payload)

    return ctx.serialize(GoalTransformer.transform(goal))
  }

  /** DELETE /goals/:id */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(goalParamsValidator)

    await this.goals.destroy(ctx.household, params.id)

    return ctx.response.noContent()
  }

  /** PUT /goals/reorder { ids } */
  async reorder(ctx: HttpContext) {
    const { ids } = await ctx.request.validateUsing(reorderValidator)

    await this.goals.reorder(ctx.household, ids)

    return ctx.response.noContent()
  }

  /** GET /goals/:id/projection: saved amount, monthly rate and when it is reached. */
  async projection(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(goalParamsValidator)

    const projection = await this.goals.projection(ctx.household, params.id)

    return { data: projection }
  }
}
