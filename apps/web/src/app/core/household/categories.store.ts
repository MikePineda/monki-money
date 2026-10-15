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
 * screen sees a rename or a move at once. Forgotten on logout.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly api = inject(CategoriesApi)

  private readonly _tree = signal<CategoryTree>([])
  private pending: Promise<void> | null = null
  private loaded = false

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
    this.pending ??= this.api
      .tree()
      .then((tree) => {
        this._tree.set(tree)
        this.loaded = true
        this.isLoaded.set(true)
      })
      .finally(() => {
        this.pending = null
      })
    return this.pending
  }

  /** Replaces the tree with a locally changed one (optimistic edits on the categories screen). */
  set(tree: CategoryTree): void {
    this._tree.set(tree)
  }
}
