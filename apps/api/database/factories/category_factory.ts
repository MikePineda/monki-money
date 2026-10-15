import Category from '#models/category'
import CategoryGroup from '#models/category_group'
import factory from '@adonisjs/lucid/factories'

/** Synthetic category groups. Pass `householdId` through `.merge()`. */
export const CategoryGroupFactory = factory
  .define(CategoryGroup, ({ faker }) => {
    const name = `${faker.word.noun()} ${faker.string.alphanumeric(4).toLowerCase()}`
    return {
      name,
      slug: name.replace(/[^a-z0-9]+/g, '-'),
      kind: 'expense' as const,
      sortOrder: 0,
      isHidden: false,
      isSystem: false,
    }
  })
  .build()

/** Synthetic categories. Pass `householdId` and `categoryGroupId` through `.merge()`. */
export const CategoryFactory = factory
  .define(Category, ({ faker }) => {
    const name = `${faker.word.noun()} ${faker.string.alphanumeric(4).toLowerCase()}`
    return {
      name,
      slug: name.replace(/[^a-z0-9]+/g, '-'),
      icon: null,
      sortOrder: 0,
      isHidden: false,
      isSystem: false,
    }
  })
  .build()
