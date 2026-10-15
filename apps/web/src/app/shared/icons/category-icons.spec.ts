import { TAXONOMY } from '@monkimoney/shared'
import { CATEGORY_ICON_CHOICES, categoryIcon, isIconName } from './category-icons'
import { ICON_NAMES } from './icon-names'

describe('categoryIcon', () => {
  it('test_every_seeded_category_and_group_has_a_glyph_of_its_own', () => {
    for (const group of TAXONOMY) {
      expect(categoryIcon({ slug: group.slug, icon: null }), group.slug).not.toBe('tag')
      for (const category of group.categories) {
        expect(categoryIcon({ slug: category.slug, icon: null }), category.slug).not.toBe('tag')
      }
    }
  })

  it('test_a_chosen_icon_wins_over_the_slug', () => {
    expect(categoryIcon({ slug: 'groceries', icon: 'pizza' })).toBe('pizza')
  })

  it('test_unknown_icons_and_custom_slugs_fall_back_to_a_tag', () => {
    expect(categoryIcon({ slug: 'my-thing', icon: 'not-an-icon' })).toBe('tag')
    expect(categoryIcon(null)).toBe('tag')
  })

  it('test_picker_choices_are_all_in_the_sprite', () => {
    expect(CATEGORY_ICON_CHOICES.length).toBeGreaterThan(30)
    expect(CATEGORY_ICON_CHOICES.every((name) => isIconName(name))).toBe(true)
    expect(new Set(CATEGORY_ICON_CHOICES).size).toBe(CATEGORY_ICON_CHOICES.length)
    expect(ICON_NAMES).toEqual(expect.arrayContaining([...CATEGORY_ICON_CHOICES]))
  })
})
