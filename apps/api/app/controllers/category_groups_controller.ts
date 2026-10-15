import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { reorderValidator } from '#validators/reorder'
import CategoryGroupService from '#services/categories/category_group_service'
import CategoryGroupTransformer from '#transformers/category_group_transformer'
import {
  categoryGroupParamsValidator,
  createCategoryGroupValidator,
  updateCategoryGroupValidator,
} from '#validators/categories'

/** Category groups of the current household (any member). */
@inject()
export default class CategoryGroupsController {
  constructor(protected groups: CategoryGroupService) {}

  /** GET /category-groups */
  async index(ctx: HttpContext) {
    const groups = await this.groups.list(ctx.household)
    return ctx.serialize(CategoryGroupTransformer.transform(groups, ctx.i18n))
  }

  /** POST /category-groups */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createCategoryGroupValidator)

    const group = await this.groups.create(ctx.household, payload)

    ctx.response.status(201)
    return ctx.serialize(CategoryGroupTransformer.transform(group, ctx.i18n))
  }

  /** PATCH /category-groups/:id */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateCategoryGroupValidator)

    const group = await this.groups.update(ctx.household, params.id, payload)

    return ctx.serialize(CategoryGroupTransformer.transform(group, ctx.i18n))
  }

  /** DELETE /category-groups/:id: 409 while it has categories. */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(categoryGroupParamsValidator)

    await this.groups.delete(ctx.household, params.id)

    return ctx.response.noContent()
  }

  /** PUT /category-groups/reorder { ids } */
  async reorder(ctx: HttpContext) {
    const { ids } = await ctx.request.validateUsing(reorderValidator)

    await this.groups.reorder(ctx.household, ids)

    return ctx.response.noContent()
  }
}
