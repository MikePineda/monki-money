import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aCategoryTree } from '../../../testing/ledger-fixtures'
import { aMe, aMemberSummary, anAccount, sessionStubOf } from '../../../testing/session-fixtures'
import type { CategoryTree } from '../../domain/category-tree'
import type { MemberSummary } from '../api/api-types'
import { SessionStore } from '../auth/session.store'
import { AccountsApi } from './accounts.api'
import { CategoriesApi } from './categories.api'
import { HouseholdDirectory } from './household-directory.store'

describe('HouseholdDirectory', () => {
  let accounts: { list: ReturnType<typeof vi.fn> }
  let clearHooks: (() => void)[]

  function setup(members: MemberSummary[], tree: CategoryTree = aCategoryTree()) {
    accounts = {
      list: vi.fn(async () => [
        anAccount({ id: 1 }),
        anAccount({ id: 2, name: 'Old card', isActive: false }),
      ]),
    }
    clearHooks = []
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountsApi, useValue: accounts },
        { provide: CategoriesApi, useValue: { tree: async () => tree } },
        {
          provide: SessionStore,
          useValue: {
            ...sessionStubOf(signal(aMe('owner', [], members))),
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

  it('test_logout_forgets_the_household', async () => {
    const directory = setup([you, partner])
    await directory.load()

    for (const hook of clearHooks) hook()

    expect(directory.status()).toBe('idle')
    expect(directory.accounts()).toEqual([])
  })
})
