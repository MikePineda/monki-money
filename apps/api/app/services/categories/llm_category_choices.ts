import Category from '#models/category'
import { TAXONOMY } from '@monkimoney/shared'
import type { LlmCategoryOption } from '#llm/types'
import type { HouseholdRef } from '#models/mixins/household_scoped'

/** A category the model may pick, with the household's id for its slug. */
export interface LlmCategoryChoice extends LlmCategoryOption {
  id: number
}

/** English names of the shared taxonomy, by slug (what the model reads). */
const TAXONOMY_NAMES = new Map(
  TAXONOMY.flatMap((group) =>
    group.categories.map((category) => [category.slug, { name: category.nameEn, group }] as const)
  )
)

/**
 * The household's visible categories as the model sees them: stable slugs,
 * English names for system categories, the typed name for custom ones.
 * Hidden categories are never offered. Shared by import classification and
 * receipt scanning, so both suggest from the same list.
 */
export async function llmCategoryChoices(household: HouseholdRef): Promise<LlmCategoryChoice[]> {
  const categories = await Category.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .where('is_hidden', false)
    .preload('group')
    .orderBy('sort_order')

  return categories.map((category) => {
    const known = TAXONOMY_NAMES.get(category.slug)
    return {
      id: category.id,
      slug: category.slug,
      name: category.isSystem && known ? known.name : category.name,
      group: category.group?.isSystem && known ? known.group.nameEn : category.group?.name,
      kind: category.group?.kind,
    }
  })
}
