import type User from '#models/user'
import { inject } from '@adonisjs/core'
import Category from '#models/category'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import CategoryGroup from '#models/category_group'
import { CategoryInUse } from '#exceptions/errors'
import { FieldError } from '#exceptions/field_error'
import { slugify, uniqueSlug } from '#domain/text/slug'
import { findInHousehold, idsInHousehold } from '#repositories/scoped'
import { nextSortOrder, reorder } from '#services/sort_order'
import CategoryUsage from '#services/categories/category_usage'
import type { CreateCategoryInput, UpdateCategoryInput } from '#services/categories/dto'

/**
 * Categories of the current household. Slugs are unique per household and
 * never change. A category in use can only be deleted with a replacement
 * (`reassignToCategoryId`), which receives every reference.
 */
@inject()
export default class CategoryService {
  constructor(protected usage: CategoryUsage) {}

  async list(household: Household) {
    return Category.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .orderBy('category_group_id')
      .orderBy('sort_order')
      .orderBy('id')
  }

  async create(household: Household, creator: User, input: CreateCategoryInput) {
    await this.assertGroupOf(household, input.categoryGroupId)

    const taken = await Category.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .select('slug')
    return Category.create({
      householdId: household.id,
      categoryGroupId: input.categoryGroupId,
      name: input.name,
      slug: uniqueSlug(slugify(input.name), new Set(taken.map((category) => category.slug))),
      icon: input.icon ?? null,
      isHidden: input.isHidden ?? false,
      isSystem: false,
      sortOrder: await nextSortOrder('categories', { category_group_id: input.categoryGroupId }),
      createdByUserId: creator.id,
    })
  }

  async update(household: Household, categoryId: number, input: UpdateCategoryInput) {
    const category = await findInHousehold(Category, household, categoryId)

    if (input.categoryGroupId !== undefined && input.categoryGroupId !== category.categoryGroupId) {
      await this.assertGroupOf(household, input.categoryGroupId)
      category.categoryGroupId = input.categoryGroupId
      category.sortOrder = await nextSortOrder('categories', {
        category_group_id: input.categoryGroupId,
      })
    }
    if (input.name !== undefined && input.name !== category.name) {
      category.name = input.name
      category.isSystem = false
    }
    if (input.icon !== undefined) category.icon = input.icon
    if (input.isHidden !== undefined) category.isHidden = input.isHidden

    await category.save()
    return category
  }

  async delete(household: Household, categoryId: number, reassignToCategoryId?: number) {
    const category = await findInHousehold(Category, household, categoryId)

    let replacement: Category | null = null
    if (reassignToCategoryId !== undefined) {
      const owned = await idsInHousehold(Category, household, [reassignToCategoryId])
      if (!owned.has(reassignToCategoryId) || reassignToCategoryId === category.id) {
        throw new FieldError('reassignToCategoryId', 'database.exists')
      }
      replacement = await Category.findOrFail(reassignToCategoryId)
    }

    const references = await this.usage.referenceCount(category)
    if (references > 0 && !replacement) throw new CategoryInUse()

    await db.transaction(async (trx) => {
      if (replacement) await this.usage.reassign(category, replacement, trx)
      category.useTransaction(trx)
      await category.delete()
    })
  }

  async reorder(household: Household, ids: number[]) {
    await reorder(Category, household, ids)
  }

  protected async assertGroupOf(household: Household, groupId: number) {
    const owned = await idsInHousehold(CategoryGroup, household, [groupId])
    if (!owned.has(groupId)) throw new FieldError('categoryGroupId', 'database.exists')
  }
}
