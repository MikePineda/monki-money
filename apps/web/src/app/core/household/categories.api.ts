import { Injectable, inject } from '@angular/core'
import type { CategoryTree, TreeCategory, TreeGroup } from '../../domain/category-tree'
import { API } from '../api/api'

export interface CategoryInput {
  categoryGroupId: number
  name: string
  icon?: string | null
  isHidden?: boolean
}

interface WireCategory {
  id: number
  categoryGroupId: number
  slug: string
  name: string
  icon: string | null
  isHidden: boolean
  isSystem: boolean
}

interface WireGroup {
  id: number
  slug: string
  name: string
  kind: 'expense' | 'income'
  isHidden: boolean
  categories?: WireCategory[]
}

function toTreeCategory(category: WireCategory): TreeCategory {
  return {
    id: category.id,
    groupId: category.categoryGroupId,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    isHidden: category.isHidden,
    isSystem: category.isSystem,
  }
}

function toTreeGroup(group: WireGroup): TreeGroup {
  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    kind: group.kind,
    isHidden: group.isHidden,
    categories: (group.categories ?? []).map(toTreeCategory),
  }
}

/**
 * Data access for category groups and categories (the transactions list,
 * quick add and the categories screen share it). Returns the domain tree
 * (`domain/category-tree.ts`), already in display order.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly api = inject(API)

  async tree(): Promise<CategoryTree> {
    const { data } = await (await this.api()).request('categories.index', { query: { tree: true } })
    return (data as unknown as WireGroup[]).map(toTreeGroup)
  }

  async create(body: CategoryInput): Promise<TreeCategory> {
    const { data } = await (await this.api()).request('categories.store', { body })
    return toTreeCategory(data)
  }

  async update(id: number, body: Partial<CategoryInput>): Promise<TreeCategory> {
    const { data } = await (await this.api()).request('categories.update', { params: { id }, body })
    return toTreeCategory(data)
  }

  /** 409 `E_CATEGORY_IN_USE` when it has transactions and no replacement is given. */
  async remove(id: number, reassignToCategoryId?: number): Promise<void> {
    await (
      await this.api()
    ).request('categories.destroy', {
      params: { id },
      body: reassignToCategoryId === undefined ? {} : { reassignToCategoryId },
    })
  }

  /** The new order of some categories (first = top); others keep theirs. */
  async reorder(ids: number[]): Promise<void> {
    await (await this.api()).request('categories.reorder', { body: { ids } })
  }

  async reorderGroups(ids: number[]): Promise<void> {
    await (await this.api()).request('category_groups.reorder', { body: { ids } })
  }
}
