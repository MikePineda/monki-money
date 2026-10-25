import { Injectable, computed, inject, signal } from '@angular/core'
import {
  flattenCategories,
  type CategoryOption,
  type CategoryTree,
  type TreeCategory,
} from '../../domain/category-tree'
import { SessionStore } from '../auth/session.store'
import { CategoriesApi } from './categories.api'

/**
 * The household's category tree, loaded once and shared: the transactions
 * list reads names and icons from it, pickers read the options, and the
 * categories screen writes its changes back with {@link set} so every
 * screen sees a rename or a move at once. Forgotten on logout, also when a
 * request was still on its way.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly api = inject(CategoriesApi)

  private readonly _tree = signal<CategoryTree>([])
  private pending: Promise<void> | null = null
  private loaded = false
  /** Bumped on logout: an answer for an earlier session is dropped, never shown to the next person. */
  private session = 0

  readonly tree = this._tree.asReadonly()
  readonly isLoaded = signal(false)

  /** Every category by id, archived ones included (old rows still point at them). */
  readonly byId = computed(() => {
    const map = new Map<number, TreeCategory>()
    for (const group of this._tree()) {
      for (const category of group.categories) {
        map.set(category.id, category)
      }
    }
    return map
  })

  /** Visible categories for pickers, in tree order. */
  readonly options = computed<CategoryOption[]>(() => flattenCategories(this._tree()))

  constructor() {
    inject(SessionStore).onClear(() => {
      this.session++
      this._tree.set([])
      this.loaded = false
      this.pending = null
      this.isLoaded.set(false)
    })
  }

  /** Loads the tree once; concurrent calls share the request. */
  load(): Promise<void> {
    if (this.loaded) {
      return Promise.resolve()
    }
    return this.reload()
  }

  /** Fetches the tree again (after a change made elsewhere). */
  reload(): Promise<void> {
    if (!this.pending) {
      const session = this.session
      const pending = this.api
        .tree()
        .then((tree) => {
          if (session !== this.session) {
            return
          }
          this._tree.set(tree)
          this.loaded = true
          this.isLoaded.set(true)
        })
        .finally(() => {
          // A request from before a logout must not clear the one that replaced it.
          if (this.pending === pending) {
            this.pending = null
          }
        })
      this.pending = pending
    }
    return this.pending
  }

  /** Replaces the tree with a locally changed one (optimistic edits on the categories screen). */
  set(tree: CategoryTree): void {
    this._tree.set(tree)
  }
}
