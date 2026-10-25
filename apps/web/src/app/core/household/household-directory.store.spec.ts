import { computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aCategoryTree } from '../../../testing/ledger-fixtures'
import {
  aMe,
  aMemberSummary,
  anAccount,
  httpError,
  networkError,
  sessionStubOf,
} from '../../../testing/session-fixtures'
import type { CategoryTree } from '../../domain/category-tree'
import type { MemberSummary } from '../api/api-types'
import type { Me } from '../auth/auth.api'
import { OfflineCache } from '../platform/offline-cache'
import { SessionStore } from '../auth/session.store'
import { AccountsApi } from './accounts.api'
import { CategoriesApi } from './categories.api'
import { HouseholdDirectory } from './household-directory.store'

describe('HouseholdDirectory', () => {
  let accounts: { list: ReturnType<typeof vi.fn> }
  let clearHooks: (() => void)[]
  let categories: { tree: ReturnType<typeof vi.fn> }
  let me: ReturnType<typeof signal<Me | null>>

  function setup(members: MemberSummary[], tree: CategoryTree = aCategoryTree()) {
    accounts = {
      list: vi.fn(async () => [
        anAccount({ id: 1 }),
        anAccount({ id: 2, name: 'Old card', isActive: false }),
      ]),
    }
    clearHooks = []
    categories = { tree: vi.fn(async () => tree) }
    me = signal<Me | null>(aMe('owner', [], members))
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountsApi, useValue: accounts },
        { provide: CategoriesApi, useValue: categories },
        {
          provide: SessionStore,
          useValue: {
            ...sessionStubOf(me),
            household: computed(() => me()?.household ?? null),
            onClear: (hook: () => void) => clearHooks.push(hook),
          },
        },
      ],
    })
    return TestBed.inject(HouseholdDirectory)
  }

  const you = aMemberSummary({ id: 1, displayName: 'Sam Rivera' })
  const partner = aMemberSummary({ id: 2, displayName: 'Alex Chen', role: 'member' })

  it('test_loads_once_and_shares_the_request', async () => {
    const directory = setup([you, partner])

    await Promise.all([directory.load(), directory.load()])
    await directory.load()

    expect(accounts.list).toHaveBeenCalledTimes(1)
    expect(directory.status()).toBe('ready')
    expect(directory.activeAccounts().map((account) => account.id)).toEqual([1])
  })

  it('test_the_partner_is_named_by_first_name', async () => {
    const directory = setup([you, partner])
    await directory.load()

    expect(directory.partnerName()).toBe('Alex')
    expect(directory.partner()?.userId).toBe(2)
  })

  it('test_a_household_of_one_has_no_partner', async () => {
    const directory = setup([you])
    await directory.load()

    expect(directory.partner()).toBeNull()
    expect(directory.partnerName()).toBe('')
  })

  it('test_people_get_their_member_mark_and_joint_the_shared_ring', async () => {
    const directory = setup([you, partner])
    await directory.load()

    expect(directory.personOf(1)).toBe('a')
    expect(directory.personOf(2)).toBe('b')
    expect(directory.personOf(null)).toBe('joint')
  })

  it('test_categories_of_a_kind_skip_hidden_ones_and_keep_the_order', async () => {
    const [housing, food, income] = aCategoryTree()
    if (!housing || !food || !income) {
      throw new Error('fixture changed')
    }
    const directory = setup(
      [you],
      [
        {
          ...housing,
          categories: housing.categories.map((category, index) => ({
            ...category,
            isHidden: index > 0,
          })),
        },
        { ...food, isHidden: true },
        income,
      ]
    )
    await directory.load()

    expect(directory.categoriesOf('expense').map((entry) => entry.category.id)).toEqual([10])
    expect(directory.categoriesOf('income').map((entry) => entry.category.id)).toEqual([30])
    expect(directory.category(20)?.group.id).toBe(2)
  })

  it('test_a_background_refresh_refetches_and_keeps_data_on_failure', async () => {
    const directory = setup([you, partner])
    await directory.load()
    accounts.list.mockRejectedValueOnce(new Error('offline'))

    directory.refreshInBackground()
    await vi.waitFor(() => expect(accounts.list).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(directory.status()).toBe('ready'))

    expect(directory.activeAccounts().map((account) => account.id)).toEqual([1])
  })

  it('test_a_load_in_flight_at_logout_never_refills_the_previous_households_accounts', async () => {
    const directory = setup([you, partner])
    let answer: (rows: unknown) => void = () => undefined
    accounts.list.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    const inFlight = directory.load()

    for (const hook of clearHooks) hook()
    answer([anAccount({ id: 9, name: 'Previous household' })])
    await inFlight

    expect(directory.accounts()).toEqual([])
    expect(directory.status()).toBe('idle')
    await directory.load()
    expect(directory.activeAccounts().map((account) => account.id)).toEqual([1])
  })

  describe('offline', () => {
    afterEach(() => localStorage.clear())

    function cache(): OfflineCache {
      return TestBed.inject(OfflineCache)
    }

    it('test_a_loaded_directory_is_kept_on_the_device_for_this_person_and_household', async () => {
      const directory = setup([you, partner])

      await directory.load()

      expect(cache().readDirectory(1, 10)).toEqual({
        accounts: directory.accounts(),
        tree: aCategoryTree(),
      })
    })

    it('test_without_network_it_opens_with_the_copy_this_device_kept', async () => {
      const directory = setup([you, partner])
      cache().writeDirectory(1, 10, {
        accounts: [anAccount({ id: 5, name: 'Kept' })],
        tree: aCategoryTree(),
      })
      accounts.list.mockRejectedValueOnce(networkError())

      await directory.load()

      expect(directory.status()).toBe('ready')
      expect(directory.activeAccounts().map((account) => account.name)).toEqual(['Kept'])
      expect(directory.category(20)?.group.id).toBe(2)
    })

    it('test_after_opening_from_the_kept_copy_the_next_load_asks_the_server_again', async () => {
      const directory = setup([you, partner])
      cache().writeDirectory(1, 10, { accounts: [anAccount({ id: 5 })], tree: aCategoryTree() })
      categories.tree.mockRejectedValueOnce(networkError())
      await directory.load()

      await directory.load()

      expect(accounts.list).toHaveBeenCalledTimes(2)
      expect(directory.activeAccounts().map((account) => account.id)).toEqual([1])
    })

    it('test_a_failed_retry_keeps_the_kept_copy_on_screen', async () => {
      const directory = setup([you, partner])
      cache().writeDirectory(1, 10, { accounts: [anAccount({ id: 5 })], tree: aCategoryTree() })
      accounts.list.mockRejectedValue(networkError())
      await directory.load()

      await directory.load()

      expect(directory.status()).toBe('ready')
      expect(directory.activeAccounts().map((account) => account.id)).toEqual([5])
    })

    it('test_without_network_or_a_kept_copy_it_fails', async () => {
      const directory = setup([you, partner])
      accounts.list.mockRejectedValueOnce(networkError())

      await expect(directory.load()).rejects.toBeTruthy()
      expect(directory.status()).toBe('error')
    })

    it('test_a_copy_kept_for_another_household_is_never_shown', async () => {
      const directory = setup([you, partner])
      cache().writeDirectory(1, 11, { accounts: [anAccount({ id: 5 })], tree: aCategoryTree() })
      accounts.list.mockRejectedValueOnce(networkError())

      await expect(directory.load()).rejects.toBeTruthy()
      expect(directory.accounts()).toEqual([])
    })

    it('test_a_refusal_from_the_server_is_not_answered_from_the_kept_copy', async () => {
      const directory = setup([you, partner])
      cache().writeDirectory(1, 10, { accounts: [anAccount({ id: 5 })], tree: aCategoryTree() })
      accounts.list.mockRejectedValueOnce(httpError(403))

      await expect(directory.load()).rejects.toBeTruthy()
      expect(directory.status()).toBe('error')
    })
  })

  it('test_logout_forgets_the_household', async () => {
    const directory = setup([you, partner])
    await directory.load()

    for (const hook of clearHooks) hook()

    expect(directory.status()).toBe('idle')
    expect(directory.accounts()).toEqual([])
  })
})
