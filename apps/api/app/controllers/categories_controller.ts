import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { reorderValidator } from '#validators/reorder'
import CategoryService from '#services/categories/category_service'
import CategoryTransformer from '#transformers/category_transformer'
import CategoryGroupService from '#services/categories/category_group_service'
import CategoryTreeTransformer from '#transformers/category_tree_transformer'
import {
  createCategoryValidator,
  deleteCategoryValidator,
  listCategoriesValidator,
  updateCategoryValidator,
} from '#validators/categories'

/** Categories of the current household (any member). */
@inject()
export default class CategoriesController {
  constructor(
    protected categories: CategoryService,
    protected groups: CategoryGroupService
  ) {}

  /** GET /categories (flat) or /categories?tree=1 (groups with categories). */
  async index(ctx: HttpContext) {
    const { tree } = await ctx.request.validateUsing(listCategoriesValidator)

    if (tree) {
      const groups = await this.groups.tree(ctx.household)
      return ctx.serialize(CategoryTreeTransformer.transform(groups, ctx.i18n))
    }

    const categories = await this.categories.list(ctx.household)
    return ctx.serialize(CategoryTransformer.transform(categories, ctx.i18n))
  }

  /** POST /categories */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createCategoryValidator)

    const category = await this.categories.create(ctx.household, ctx.auth.getUserOrFail(), payload)

    ctx.response.status(201)
    return ctx.serialize(CategoryTransformer.transform(category, ctx.i18n))
  }

  /** PATCH /categories/:id */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateCategoryValidator)

    const category = await this.categories.update(ctx.household, params.id, payload)

    return ctx.serialize(CategoryTransformer.transform(category, ctx.i18n))
  }

  /** DELETE /categories/:id { reassignToCategoryId? }: 409 while in use without a replacement. */
  async destroy(ctx: HttpContext) {
    const { params, reassignToCategoryId } =
      await ctx.request.validateUsing(deleteCategoryValidator)

    await this.categories.delete(ctx.household, params.id, reassignToCategoryId)

    return ctx.response.noContent()
  }

  /** PUT /categories/reorder { ids } */
  async reorder(ctx: HttpContext) {
    const { ids } = await ctx.request.validateUsing(reorderValidator)

    await this.categories.reorder(ctx.household, ids)

    return ctx.response.noContent()
  }
}
