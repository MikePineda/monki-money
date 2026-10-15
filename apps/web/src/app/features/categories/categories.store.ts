import { Injectable, computed, inject, signal } from '@angular/core'
import { failureMessage } from '../../core/api/error-messages'
import { toApiError } from '../../core/api/http-errors'
import { CategoriesApi } from '../../core/household/categories.api'
import { CategoriesStore } from '../../core/household/categories.store'
import { ToastStore } from '../../core/ui/toast.store'
import {
  activeTree,
  archivedCategories,
  groupIds,
  moveCategory,
  planCategoryMove,
  stepCategory,
  stepGroup,
  updateCategory,
  type CategoryTree,
  type TreeCategory,
} from '../../domain/category-tree'

export type RemoveOutcome = 'deleted' | 'inUse' | 'failed'

/**
 * The categories screen: reorder (drag or ▲▼), move between groups,
 * create, rename, pick an icon, archive and restore, delete with a
 * replacement. Every change shows at once in the shared
 * {@link CategoriesStore} (so the transactions list and pickers follow) and
 * rolls back if the API refuses it.
 */
@Injectable()
export class CategoriesPageStore {
  private readonly api = inject(CategoriesApi)
  private readonly shared = inject(CategoriesStore)
  private readonly toasts = inject(ToastStore)

  readonly loading = signal(true)
  readonly failed = signal(false)
  readonly busy = signal(false)

  readonly tree = this.shared.tree
  readonly active = computed(() => activeTree(this.tree()))
  readonly archived = computed(() => archivedCategories(this.tree()))
  readonly options = this.shared.options

  async load(): Promise<void> {
    this.loading.set(true)
    this.failed.set(false)
    try {
      await this.shared.reload()
    } catch {
      this.failed.set(true)
    } finally {
      this.loading.set(false)
    }
  }

  /** Drops a category at a visible position of a group (drag and drop). */
  move(categoryId: number, toGroupId: number, toVisibleIndex: number): Promise<void> {
    return this.applyMove(
      categoryId,
      moveCategory(this.tree(), categoryId, toGroupId, toVisibleIndex)
    )
  }

  /** ▲ (-1) / ▼ (+1): the accessible way to reorder. */
  step(categoryId: number, direction: -1 | 1): Promise<void> {
    return this.applyMove(categoryId, stepCategory(this.tree(), categoryId, direction))
  }

  async stepGroup(groupId: number, direction: -1 | 1): Promise<void> {
    const before = this.tree()
    const after = stepGroup(before, groupId, direction)
    if (after === before) {
      return
    }
    await this.optimistic(before, after, () => this.api.reorderGroups(groupIds(after)))
  }

  async rename(categoryId: number, typed: string): Promise<void> {
    const name = typed.trim()
    const current = this.find(categoryId)
    if (!name || !current || name === current.name) {
      return
    }
    const before = this.tree()
    await this.optimistic(before, updateCategory(before, categoryId, { name }), async () => {
      const saved = await this.api.update(categoryId, { name })
      this.shared.set(updateCategory(this.tree(), categoryId, saved))
    })
  }

  async setIcon(categoryId: number, icon: string): Promise<void> {
    const before = this.tree()
    await this.optimistic(before, updateCategory(before, categoryId, { icon }), () =>
      this.api.update(categoryId, { icon })
    )
  }

  async create(groupId: number, typed: string): Promise<void> {
    const name = typed.trim()
    if (!name) {
      return
    }
    await this.run(async () => {
      const created = await this.api.create({ categoryGroupId: groupId, name })
      this.shared.set(
        this.tree().map((group) =>
          group.id === groupId ? { ...group, categories: [...group.categories, created] } : group
        )
      )
    })
  }

  /** t(categories.toast.archived, categories.toast.undo) */
  async archive(categoryId: number): Promise<void> {
    const before = this.tree()
    const ok = await this.optimistic(
      before,
      updateCategory(before, categoryId, { isHidden: true }),
      () => this.api.update(categoryId, { isHidden: true })
    )
    if (ok) {
      this.toasts.show({
        messageKey: 'categories.toast.archived',
        params: { name: this.find(categoryId)?.name ?? '' },
        action: { labelKey: 'categories.toast.undo', run: () => void this.restore(categoryId) },
      })
    }
  }

  async restore(categoryId: number): Promise<void> {
    const before = this.tree()
    await this.optimistic(before, updateCategory(before, categoryId, { isHidden: false }), () =>
      this.api.update(categoryId, { isHidden: false })
    )
  }

  /**
   * Deletes a category. One with transactions needs a replacement first:
   * the answer is then `inUse` and nothing changes.
   */
  async remove(categoryId: number, reassignToCategoryId?: number): Promise<RemoveOutcome> {
    if (this.busy()) {
      return 'failed'
    }
    this.busy.set(true)
    try {
      await this.api.remove(categoryId, reassignToCategoryId)
      this.shared.set(
        this.tree().map((group) => ({
          ...group,
          categories: group.categories.filter((category) => category.id !== categoryId),
        }))
      )
      return 'deleted'
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'http' && failure.code === 'E_CATEGORY_IN_USE') {
        return 'inUse'
      }
      this.fail(error)
      return 'failed'
    } finally {
      this.busy.set(false)
    }
  }

  private find(categoryId: number): TreeCategory | undefined {
    return this.tree()
      .flatMap((group) => group.categories)
      .find((category) => category.id === categoryId)
  }

  private async applyMove(categoryId: number, after: CategoryTree): Promise<void> {
    const before = this.tree()
    if (after === before) {
      return
    }
    const plan = planCategoryMove(before, after, categoryId)
    await this.optimistic(before, after, async () => {
      if (plan.groupChange) {
        await this.api.update(categoryId, { categoryGroupId: plan.groupChange.groupId })
      }
      await this.api.reorder(plan.reorder)
    })
  }

  /** Shows `after` at once; puts `before` back if the request fails. */
  private async optimistic(
    before: CategoryTree,
    after: CategoryTree,
    request: () => Promise<unknown>
  ): Promise<boolean> {
    this.shared.set(after)
    try {
      await request()
      return true
    } catch (error) {
      this.shared.set(before)
      this.fail(error)
      return false
    }
  }

  private async run(change: () => Promise<void>): Promise<void> {
    this.busy.set(true)
    try {
      await change()
    } catch (error) {
      this.fail(error)
    } finally {
      this.busy.set(false)
    }
  }

  /** t(categories.errors.invalid) */
  private fail(error: unknown): void {
    const failure = toApiError(error)
    if (failure.kind === 'unauthorized') {
      return
    }
    const field = failure.kind === 'validation' ? Object.values(failure.fields)[0] : undefined
    if (field) {
      this.toasts.show({
        messageKey: 'categories.errors.invalid',
        params: { message: field },
        status: 'critical',
      })
      return
    }
    const message = failureMessage(failure)
    this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
  }
}
