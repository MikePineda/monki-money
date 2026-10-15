/**
 * The household's categories as a tree of groups, and the pure operations
 * the categories screen needs: reorder, move between groups, archive views.
 * Pure: no Angular. Every operation returns a new tree (or the same tree
 * when nothing changes) and never mutates its input.
 *
 * Positions given to the moves are positions among the *visible* (not
 * archived) categories of a group, because that is what the screen shows;
 * archived categories keep their place in the stored order.
 */

export type CategoryKind = 'expense' | 'income'

export interface TreeCategory {
  id: number
  groupId: number
  name: string
  slug: string
  icon: string | null
  isHidden: boolean
  isSystem: boolean
}

export interface TreeGroup {
  id: number
  name: string
  slug: string
  kind: CategoryKind
  isHidden: boolean
  categories: readonly TreeCategory[]
}

export type CategoryTree = readonly TreeGroup[]

/** A category flattened for pickers, with its group's name for context. */
export interface CategoryOption extends TreeCategory {
  groupName: string
  kind: CategoryKind
}

/** What the API needs after a category moved: maybe a new group, then the target group's order. */
export interface CategoryMovePlan {
  groupChange: { categoryId: number; groupId: number } | null
  reorder: number[]
}

/** Moves one item (indices clamped); a new array, the input stays as it was. */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list]
  if (from < 0 || from >= copy.length) {
    return copy
  }
  const target = Math.min(Math.max(to, 0), copy.length - 1)
  const [item] = copy.splice(from, 1)
  copy.splice(target, 0, item as T)
  return copy
}

function locate(tree: CategoryTree, categoryId: number) {
  for (const [groupIndex, group] of tree.entries()) {
    const index = group.categories.findIndex((item) => item.id === categoryId)
    if (index >= 0) {
      return { groupIndex, group, index, category: group.categories[index] as TreeCategory }
    }
  }
  return null
}

/** Inserts `category` so it becomes the visible item at `visibleIndex`. */
function insertAtVisible(
  categories: readonly TreeCategory[],
  category: TreeCategory,
  visibleIndex: number
): TreeCategory[] {
  const result = [...categories]
  const visible = result.filter((item) => !item.isHidden)
  if (visibleIndex < visible.length) {
    const anchor = visible[Math.max(visibleIndex, 0)] as TreeCategory
    result.splice(result.indexOf(anchor), 0, category)
  } else {
    const last = visible.at(-1)
    result.splice(last ? result.indexOf(last) + 1 : 0, 0, category)
  }
  return result
}

/**
 * Moves a category to a visible position of a group (its own or another).
 * Unknown ids leave the tree untouched.
 */
export function moveCategory(
  tree: CategoryTree,
  categoryId: number,
  toGroupId: number,
  toVisibleIndex: number
): CategoryTree {
  const found = locate(tree, categoryId)
  const target = tree.find((group) => group.id === toGroupId)
  if (!found || !target) {
    return tree
  }
  const moved = { ...found.category, groupId: toGroupId }
  return tree.map((group) => {
    let categories = group.categories
    if (group.id === found.group.id) {
      categories = categories.filter((item) => item.id !== categoryId)
    }
    if (group.id === toGroupId) {
      categories = insertAtVisible(categories, moved, toVisibleIndex)
    }
    return categories === group.categories ? group : { ...group, categories }
  })
}

/**
 * One visible step up (-1) or down (+1). Past the edge of its group the
 * category moves into the neighbouring visible group of the same kind (to
 * its end going up, its start going down); otherwise nothing changes.
 */
export function stepCategory(tree: CategoryTree, categoryId: number, direction: -1 | 1) {
  const found = locate(tree, categoryId)
  if (!found) {
    return tree
  }
  const visible = found.group.categories.filter((item) => !item.isHidden)
  const position = visible.findIndex((item) => item.id === categoryId)
  const next = position + direction
  if (next >= 0 && next < visible.length) {
    return moveCategory(tree, categoryId, found.group.id, next)
  }
  const neighbour = direction < 0 ? tree[found.groupIndex - 1] : tree[found.groupIndex + 1]
  if (!neighbour || neighbour.isHidden || neighbour.kind !== found.group.kind) {
    return tree
  }
  const neighbourVisible = neighbour.categories.filter((item) => !item.isHidden).length
  return moveCategory(tree, categoryId, neighbour.id, direction < 0 ? neighbourVisible : 0)
}

/** Moves a group one step up (-1) or down (+1). */
export function stepGroup(tree: CategoryTree, groupId: number, direction: -1 | 1): CategoryTree {
  const index = tree.findIndex((group) => group.id === groupId)
  const next = index + direction
  if (index < 0 || next < 0 || next >= tree.length) {
    return tree
  }
  return moveInList(tree, index, next)
}

export function groupIds(tree: CategoryTree): number[] {
  return tree.map((group) => group.id)
}

/** Every category id of a group in display order, archived ones included. */
export function categoryIds(tree: CategoryTree, groupId: number): number[] {
  return tree.find((group) => group.id === groupId)?.categories.map((item) => item.id) ?? []
}

/** The API calls a move needs: `PATCH categoryGroupId` when the group changed, then `PUT reorder`. */
export function planCategoryMove(
  before: CategoryTree,
  after: CategoryTree,
  categoryId: number
): CategoryMovePlan {
  const from = locate(before, categoryId)
  const to = locate(after, categoryId)
  if (!from || !to) {
    return { groupChange: null, reorder: [] }
  }
  return {
    groupChange: from.group.id === to.group.id ? null : { categoryId, groupId: to.group.id },
    reorder: categoryIds(after, to.group.id),
  }
}

/** Replaces fields of one category (a rename, an icon, archiving). */
export function updateCategory(
  tree: CategoryTree,
  categoryId: number,
  changes: Partial<Omit<TreeCategory, 'id' | 'groupId'>>
): CategoryTree {
  return tree.map((group) =>
    group.categories.some((item) => item.id === categoryId)
      ? {
          ...group,
          categories: group.categories.map((item) =>
            item.id === categoryId ? { ...item, ...changes } : item
          ),
        }
      : group
  )
}

/** The tree as the main list shows it: visible groups and their visible categories. */
export function activeTree(tree: CategoryTree): CategoryTree {
  return tree
    .filter((group) => !group.isHidden)
    .map((group) => ({
      ...group,
      categories: group.categories.filter((item) => !item.isHidden),
    }))
}

/** Archived categories, each with the name of its group. */
export function archivedCategories(
  tree: CategoryTree
): { category: TreeCategory; groupName: string }[] {
  return tree.flatMap((group) =>
    group.categories
      .filter((item) => item.isHidden)
      .map((category) => ({ category, groupName: group.name }))
  )
}

/** Visible categories in tree order (optionally of one kind), for pickers. */
export function flattenCategories(tree: CategoryTree, kind?: CategoryKind): CategoryOption[] {
  return activeTree(tree)
    .filter((group) => kind === undefined || group.kind === kind)
    .flatMap((group) =>
      group.categories.map((category) => ({
        ...category,
        groupName: group.name,
        kind: group.kind,
      }))
    )
}
