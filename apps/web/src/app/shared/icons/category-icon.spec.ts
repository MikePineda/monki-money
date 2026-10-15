import { TAXONOMY } from '@monkimoney/shared'
import { categoryIcon } from './category-icon'

describe('categoryIcon', () => {
  it('test_every_seeded_slug_has_its_own_glyph', () => {
    const slugs = TAXONOMY.flatMap((group) => [
      group.slug,
      ...group.categories.map((category) => category.slug),
    ])
    const missing = slugs.filter(
      (slug) => slug !== 'misc' && categoryIcon({ slug, icon: null }) === 'tag'
    )

    expect(missing).toEqual([])
  })

  it('test_a_shipped_icon_on_the_category_wins', () => {
    expect(categoryIcon({ slug: 'groceries', icon: 'coffee' })).toBe('coffee')
  })

  it('test_an_unknown_icon_or_slug_falls_back_to_a_tag', () => {
    expect(categoryIcon({ slug: 'custom-thing', icon: 'not-an-icon' })).toBe('tag')
    expect(categoryIcon(null)).toBe('tag')
  })
})
