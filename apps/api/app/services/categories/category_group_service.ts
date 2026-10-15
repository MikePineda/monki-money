import Category from '#models/category'
import type Household from '#models/household'
import CategoryGroup from '#models/category_group'
import { GroupNotEmpty } from '#exceptions/errors'
import { findInHousehold } from '#repositories/scoped'
import { slugify, uniqueSlug } from '#domain/text/slug'
import { nextSortOrder, reorder } from '#services/sort_order'
import type { CreateCategoryGroupInput, UpdateCategoryGroupInput } from '#services/categories/dto'

/**
 * Category groups. Renaming a system group turns it into a custom one (its
 * name stops following the reader's locale); the slug never changes.
 */
export default class CategoryGroupService {
  async list(household: Household) {
    return CategoryGroup.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .orderBy('sort_order')
      .orderBy('id')
  }

  async tree(household: Household) {
    return CategoryGroup.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .preload('categories', (categories) => categories.orderBy('sort_order').orderBy('id'))
      .orderBy('sort_order')
      .orderBy('id')
  }

  async create(household: Household, input: CreateCategoryGroupInput) {
    const taken = await CategoryGroup.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .select('slug')
    return CategoryGroup.create({
      householdId: household.id,
      name: input.name,
      slug: uniqueSlug(slugify(input.name), new Set(taken.map((group) => group.slug))),
      kind: input.kind ?? 'expense',
      sortOrder: await nextSortOrder('category_groups', { household_id: household.id }),
      isHidden: false,
      isSystem: false,
    })
  }

  async update(household: Household, groupId: number, input: UpdateCategoryGroupInput) {
    const group = await findInHousehold(CategoryGroup, household, groupId)
    if (input.name !== undefined && input.name !== group.name) {
      group.name = input.name
      group.isSystem = false
    }
    if (input.isHidden !== undefined) group.isHidden = input.isHidden
    await group.save()
    return group
  }

  async delete(household: Household, groupId: number) {
    const group = await findInHousehold(CategoryGroup, household, groupId)
    const categories = await Category.query().where('category_group_id', group.id).first()
    if (categories) throw new GroupNotEmpty()
    await group.delete()
  }

  async reorder(household: Household, ids: number[]) {
    await reorder(CategoryGroup, household, ids)
  }
}
