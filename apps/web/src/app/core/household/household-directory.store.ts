import { Injectable, computed, inject, signal } from '@angular/core'
import { firstName } from '../../domain/people'
import type { Account, Category, CategoryTree, Member } from '../api/api-types'
import { SessionStore } from '../auth/session.store'
import { AccountsApi } from './accounts.api'
import { CategoriesApi } from './categories.api'
import { HouseholdApi } from './household.api'

export type DirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

/** A visible category with the group it belongs to (for select sheets and labels). */
export interface CategoryEntry {
  category: Category
  group: CategoryTree
}

/** Who a row belongs to on screen: you (person A), the partner (person B) or both. */
export type PersonKey = 'a' | 'b' | 'joint'

/**
 * The household's reference data that quick add and the Month view label
 * everything with: accounts, the category tree and the members. Loaded once
 * per session (`load()` is idempotent and shares an in-flight request) and
 * dropped on logout. People are words in the UI ("You" and the partner's
 * own name); only `personOf` maps them to the person-a / person-b marks.
 */
@Injectable({ providedIn: 'root' })
export class HouseholdDirectory {
  private readonly accountsApi = inject(AccountsApi)
  private readonly categoriesApi = inject(CategoriesApi)
  private readonly householdApi = inject(HouseholdApi)
  private readonly session = inject(SessionStore)

  private readonly _accounts = signal<Account[]>([])
  private readonly _groups = signal<CategoryTree[]>([])
  private readonly _members = signal<Member[]>([])
  private readonly _status = signal<DirectoryStatus>('idle')
  private pending: Promise<void> | null = null

  readonly accounts = this._accounts.asReadonly()
  readonly groups = this._groups.asReadonly()
  readonly members = this._members.asReadonly()
  readonly status = this._status.asReadonly()

  readonly activeAccounts = computed(() => this._accounts().filter((account) => account.isActive))
  readonly youId = computed(() => this.session.user()?.id ?? null)
  readonly partner = computed(
    () => this._members().find((member) => member.userId !== this.youId()) ?? null
  )
  /** The partner's own name as they set it (display name, else first name); '' without one. */
  readonly partnerName = computed(() => {
    const partner = this.partner()
    return partner ? partner.displayName?.trim() || firstName(partner.fullName) : ''
  })

  private readonly accountById = computed(
    () => new Map(this._accounts().map((account) => [account.id, account]))
  )
  private readonly groupById = computed(
    () => new Map(this._groups().map((group) => [group.id, group]))
  )
  private readonly categoryById = computed(() => {
    const map = new Map<number, CategoryEntry>()
    for (const group of this._groups()) {
      for (const category of group.categories) {
        map.set(category.id, { category, group })
      }
    }
    return map
  })

  constructor() {
    this.session.onClear(() => this.clear())
  }

  /** Loads everything once; `force` refetches (after a settings change). */
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
      this.categoriesApi.tree(),
      this.householdApi.members(),
    ])
      .then(([accounts, groups, members]) => {
        this._accounts.set(accounts)
        this._groups.set(groups)
        this._members.set(members)
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

  group(id: number | null): CategoryTree | null {
    return id === null ? null : (this.groupById().get(id) ?? null)
  }

  category(id: number | null): CategoryEntry | null {
    return id === null ? null : (this.categoryById().get(id) ?? null)
  }

  /** Visible categories of visible groups of one kind, in the household's order. */
  categoriesOf(kind: 'expense' | 'income'): CategoryEntry[] {
    return this._groups()
      .filter((group) => group.kind === kind && !group.isHidden)
      .flatMap((group) =>
        group.categories
          .filter((category) => !category.isHidden)
          .map((category) => ({ category, group }))
      )
  }

  /** The mark for a payer: you are person A, the other member person B, null is joint. */
  personOf(userId: number | null): PersonKey {
    if (userId === null) {
      return 'joint'
    }
    return userId === this.youId() ? 'a' : 'b'
  }

  clear(): void {
    this._accounts.set([])
    this._groups.set([])
    this._members.set([])
    this._status.set('idle')
  }
}
