import Category from '#models/category'
import CategoryGroup from '#models/category_group'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { TAXONOMY, taxonomyName, type Locale } from '@monkimoney/shared'

/**
 * Seeds the shared taxonomy (packages/shared/src/taxonomy.ts) into a
 * household, with names in the household's locale and `isSystem = true` so
 * readers see them in their own language. Idempotent by slug: only missing
 * groups and categories are inserted, nothing existing is touched.
 */
export default class TaxonomySeeder {
  async seed(householdId: number, locale: Locale, client?: QueryClientContract) {
    const options = client ? { client } : {}

    const existingGroups = await CategoryGroup.query(options).where('household_id', householdId)
    const groupsBySlug = new Map(existingGroups.map((group) => [group.slug, group]))

    const missingGroups = TAXONOMY.map((group, index) => ({ group, index })).filter(
      ({ group }) => !groupsBySlug.has(group.slug)
    )
    const createdGroups = await CategoryGroup.createMany(
      missingGroups.map(({ group, index }) => ({
        householdId,
        slug: group.slug,
        name: taxonomyName(group, locale),
        kind: group.kind,
        sortOrder: index,
        isHidden: false,
        isSystem: true,
      })),
      options
    )
    for (const group of createdGroups) groupsBySlug.set(group.slug, group)

    const existingSlugs = new Set(
      (await Category.query(options).where('household_id', householdId).select('slug')).map(
        (category) => category.slug
      )
    )

    const missingCategories = TAXONOMY.flatMap((group) =>
      group.categories
        .map((category, index) => ({ category, index, groupId: groupsBySlug.get(group.slug)!.id }))
        .filter(({ category }) => !existingSlugs.has(category.slug))
    )
    await Category.createMany(
      missingCategories.map(({ category, index, groupId }) => ({
        householdId,
        categoryGroupId: groupId,
        slug: category.slug,
        name: taxonomyName(category, locale),
        sortOrder: index,
        isHidden: false,
        isSystem: true,
      })),
      options
    )
  }
}
