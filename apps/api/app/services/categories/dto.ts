import type { CategoryGroupKind } from '@monkimoney/shared'

export interface CreateCategoryGroupInput {
  name: string
  kind?: CategoryGroupKind
}

export interface UpdateCategoryGroupInput {
  name?: string
  isHidden?: boolean
}

export interface CreateCategoryInput {
  categoryGroupId: number
  name: string
  icon?: string | null
  isHidden?: boolean
}

export interface UpdateCategoryInput {
  categoryGroupId?: number
  name?: string
  icon?: string | null
  isHidden?: boolean
}
