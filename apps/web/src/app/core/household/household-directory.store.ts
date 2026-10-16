import { Injectable, computed, inject, signal } from '@angular/core'
import type { CategoryKind, TreeCategory, TreeGroup } from '../../domain/category-tree'
import type { Person } from '../../shared/ui/person-dot/person-dot.component'
import type { Account } from '../api/api-types'
import { SessionStore } from '../auth/session.store'
import { AccountsApi } from './accounts.api'
import { CategoriesStore } from './categories.store'
import { MembersStore } from './members.store'

export type DirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

/** A category with the group it belongs to (for select sheets and labels). */
export interface CategoryEntry {
  category: TreeCategory
  group: TreeGroup
}

/**
 * The household's reference data that quick add and the Month view label
 * everything with: the accounts, plus the shared category tree
 * (CategoriesStore) and members (MembersStore, from the session). Loaded once per session
 * (`load()` is idempotent and shares an in-flight request) and dropped on
 * logout. People are words in the UI ("You" and the partner's own name);
 * only `personOf` maps them to the person marks.
 */
@Injectable({ providedIn: 'root' })
export class HouseholdDirectory {
  private readonly accountsApi = inject(AccountsApi)
  private readonly categories = inject(CategoriesStore)
  private readonly members = inject(MembersStore)
  private readonly session = inject(SessionStore)

  private readonly _accounts = signal<Account[]>([])
  private readonly _status = signal<DirectoryStatus>('idle')
  private pending: Promise<void> | null = null

  readonly accounts = this._accounts.asReadonly()
  readonly status = this._status.asReadonly()
  /** The category tree in display order. */
  readonly groups = this.categories.tree

  readonly activeAccounts = computed(() => this._accounts().filter((account) => account.isActive))
  readonly youId = computed(() => this.session.user()?.id ?? null)
  /** The other member, or null in a household of one. */
  readonly partner = this.members.partner
  /** The partner's first name as they typed it; '' without a partner. */
  readonly partnerName = computed(() => this.partner()?.name ?? '')

  private readonly accountById = computed(
    () => new Map(this._accounts().map((account) => [account.id, account]))
  )
  private readonly groupById = computed(
    () => new Map(this.groups().map((group) => [group.id, group]))
  )
  private readonly categoryById = computed(() => {
    const map = new Map<number, CategoryEntry>()
    for (const group of this.groups()) {
      for (const category of group.categories) {
        map.set(category.id, { category, group })
      }
    }
    return map
  })

  constructor() {
    this.session.onClear(() => this.clear())
  }

  /** Loads everything once; `force` refetches the accounts and the category tree. */
  load(force = false): Promise<void> {
    if (this.pending) {
      return this.pending
    }
    if (this._status() === 'ready' && !force) {
      return Promise.resolve()
    }
    this._status.set('loading')
    this.pending = Promise.all([
      this.accountsApi.list(),
      force ? this.categories.reload() : this.categories.load(),
    ])
      .then(([accounts]) => {
        this._accounts.set(accounts)
        this._status.set('ready')
      })
      .catch((error: unknown) => {
        this._status.set('error')
        throw error
      })
      .finally(() => {
        this.pending = null
      })
    return this.pending
  }

  /**
   * Screens that write with this data (quick add) open with what is loaded
   * and refresh it behind the scenes, so an account or category added in
   * settings shows up without a reload. Failures keep the loaded data.
   */
  refreshInBackground(): void {
    if (this._status() === 'ready') {
      this.load(true).catch(() => this._status.set('ready'))
    }
  }

  account(id: number | null): Account | null {
    return id === null ? null : (this.accountById().get(id) ?? null)
  }

  group(id: number | null): TreeGroup | null {
    return id === null ? null : (this.groupById().get(id) ?? null)
  }

  category(id: number | null): CategoryEntry | null {
    return id === null ? null : (this.categoryById().get(id) ?? null)
  }

  /** Visible categories of visible groups of one kind, in the household's order. */
  categoriesOf(kind: CategoryKind): CategoryEntry[] {
    return this.groups()
      .filter((group) => group.kind === kind && !group.isHidden)
      .flatMap((group) =>
        group.categories
          .filter((category) => !category.isHidden)
          .map((category) => ({ category, group }))
      )
  }

  /** The mark of a payer (the same in every screen): a member's colour, or the shared ring for null. */
  personOf(userId: number | null): Person {
    return this.members.personOf(userId)
  }

  clear(): void {
    this._accounts.set([])
    this._status.set('idle')
    this.pending = null
  }
}
