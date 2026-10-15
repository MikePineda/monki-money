import {
  activeTree,
  archivedCategories,
  categoryIds,
  flattenCategories,
  groupIds,
  moveCategory,
  moveInList,
  planCategoryMove,
  stepCategory,
  stepGroup,
  updateCategory,
  type CategoryTree,
  type TreeCategory,
  type TreeGroup,
} from './category-tree'

function category(id: number, groupId: number, name: string, isHidden = false): TreeCategory {
  return { id, groupId, name, slug: name.toLowerCase(), icon: null, isHidden, isSystem: true }
}

function group(
  id: number,
  name: string,
  categories: TreeCategory[],
  kind: 'expense' | 'income' = 'expense'
): TreeGroup {
  return { id, name, slug: name.toLowerCase(), kind, isHidden: false, categories }
}

/** Housing (rent, utilities, [archived] phone), Food (groceries, alcohol), Income (salary). */
function tree(): CategoryTree {
  return [
    group(1, 'Housing', [
      category(10, 1, 'Rent'),
      category(11, 1, 'Utilities'),
      category(12, 1, 'Phone', true),
    ]),
    group(2, 'Food', [category(20, 2, 'Groceries'), category(21, 2, 'Alcohol')]),
    group(3, 'Income', [category(30, 3, 'Salary')], 'income'),
  ]
}

const names = (value: CategoryTree, groupId: number) =>
  value.find((item) => item.id === groupId)?.categories.map((item) => item.name)

describe('moveInList', () => {
  it('test_moves_an_item_and_keeps_the_others_in_order', () => {
    expect(moveInList(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveInList(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('test_out_of_range_targets_are_clamped_and_the_input_is_untouched', () => {
    const input = ['a', 'b', 'c']

    expect(moveInList(input, 0, 99)).toEqual(['b', 'c', 'a'])
    expect(moveInList(input, 2, -5)).toEqual(['c', 'a', 'b'])
    expect(input).toEqual(['a', 'b', 'c'])
  })

  it('test_reorder_is_stable_when_nothing_moves', () => {
    expect(moveInList(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('moveCategory', () => {
  it('test_reorders_within_a_group_by_visible_position', () => {
    const next = moveCategory(tree(), 11, 1, 0)

    expect(names(next, 1)).toEqual(['Utilities', 'Rent', 'Phone'])
  })

  it('test_archived_categories_keep_their_place', () => {
    const next = moveCategory(tree(), 10, 1, 1)

    expect(names(next, 1)).toEqual(['Utilities', 'Rent', 'Phone'])
  })

  it('test_moves_a_category_into_another_group', () => {
    const next = moveCategory(tree(), 21, 1, 1)

    expect(names(next, 1)).toEqual(['Rent', 'Alcohol', 'Utilities', 'Phone'])
    expect(names(next, 2)).toEqual(['Groceries'])
    expect(next[0]?.categories[1]?.groupId).toBe(1)
  })

  it('test_unknown_category_leaves_the_tree_unchanged', () => {
    const before = tree()

    expect(moveCategory(before, 999, 1, 0)).toBe(before)
  })
})

describe('stepCategory', () => {
  it('test_up_and_down_swap_with_the_visible_neighbour', () => {
    expect(names(stepCategory(tree(), 11, -1), 1)).toEqual(['Utilities', 'Rent', 'Phone'])
    expect(names(stepCategory(tree(), 20, 1), 2)).toEqual(['Alcohol', 'Groceries'])
  })

  it('test_past_the_edge_it_moves_into_the_neighbouring_group_of_the_same_kind', () => {
    const down = stepCategory(tree(), 11, 1)
    expect(names(down, 1)).toEqual(['Rent', 'Phone'])
    expect(names(down, 2)).toEqual(['Utilities', 'Groceries', 'Alcohol'])

    const up = stepCategory(tree(), 20, -1)
    expect(names(up, 1)).toEqual(['Rent', 'Utilities', 'Groceries', 'Phone'])
  })

  it('test_never_crosses_into_a_group_of_another_kind', () => {
    const before = tree()

    expect(stepCategory(before, 21, 1)).toBe(before)
    expect(stepCategory(before, 10, -1)).toBe(before)
  })
})

describe('stepGroup', () => {
  it('test_moves_a_group_up_or_down', () => {
    expect(groupIds(stepGroup(tree(), 2, -1))).toEqual([2, 1, 3])
    expect(groupIds(stepGroup(tree(), 3, 1))).toEqual([1, 2, 3])
  })
})

describe('planCategoryMove', () => {
  it('test_a_move_within_a_group_only_reorders_that_group_including_archived_ids', () => {
    const before = tree()
    const after = moveCategory(before, 11, 1, 0)

    expect(planCategoryMove(before, after, 11)).toEqual({
      groupChange: null,
      reorder: [11, 10, 12],
    })
  })

  it('test_a_move_across_groups_changes_the_group_then_reorders_the_target', () => {
    const before = tree()
    const after = moveCategory(before, 21, 1, 0)

    expect(planCategoryMove(before, after, 21)).toEqual({
      groupChange: { categoryId: 21, groupId: 1 },
      reorder: [21, 10, 11, 12],
    })
  })
})

describe('views of the tree', () => {
  it('test_active_tree_hides_archived_categories', () => {
    expect(activeTree(tree())[0]?.categories.map((item) => item.id)).toEqual([10, 11])
  })

  it('test_archived_categories_are_listed_apart_with_their_group', () => {
    expect(archivedCategories(tree())).toEqual([
      { category: expect.objectContaining({ id: 12 }), groupName: 'Housing' },
    ])
  })

  it('test_flatten_lists_active_categories_with_their_group_name', () => {
    const options = flattenCategories(tree())

    expect(options.map((item) => [item.id, item.groupName])).toEqual([
      [10, 'Housing'],
      [11, 'Housing'],
      [20, 'Food'],
      [21, 'Food'],
      [30, 'Income'],
    ])
    expect(flattenCategories(tree(), 'income').map((item) => item.id)).toEqual([30])
  })

  it('test_category_ids_of_a_group_follow_the_tree_order', () => {
    expect(categoryIds(tree(), 1)).toEqual([10, 11, 12])
  })

  it('test_update_category_replaces_one_category', () => {
    const next = updateCategory(tree(), 10, { name: 'Mortgage', isHidden: true })

    expect(next[0]?.categories[0]).toEqual(
      expect.objectContaining({ id: 10, name: 'Mortgage', isHidden: true })
    )
    expect(names(next, 2)).toEqual(['Groceries', 'Alcohol'])
  })
})
