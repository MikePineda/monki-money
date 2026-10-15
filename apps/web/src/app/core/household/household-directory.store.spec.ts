import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aCategory, aCategoryTree, aGroup } from '../../../testing/ledger-fixtures'
import { aMember, aUser, anAccount } from '../../../testing/session-fixtures'
import type { CategoryTree, Member } from '../api/api-types'
import { SessionStore } from '../auth/session.store'
import { AccountsApi } from './accounts.api'
import { CategoriesApi } from './categories.api'
import { HouseholdApi } from './household.api'
import { HouseholdDirectory } from './household-directory.store'

describe('HouseholdDirectory', () => {
  let accounts: { list: ReturnType<typeof vi.fn> }
  let clearHooks: (() => void)[]

  function setup(members: Member[], groups: CategoryTree[] = aCategoryTree()) {
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
        { provide: CategoriesApi, useValue: { tree: async () => groups } },
        { provide: HouseholdApi, useValue: { members: async () => members } },
        {
          provide: SessionStore,
          useValue: {
            user: signal(aUser({ id: 1 })),
            onClear: (hook: () => void) => clearHooks.push(hook),
          },
        },
      ],
    })
    return TestBed.inject(HouseholdDirectory)
  }

  const you = aMember({ userId: 1, fullName: 'Sam Rivera' })
  const partner = aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'member' })

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
  })

  it('test_a_display_name_wins_over_the_first_name', async () => {
    const directory = setup([you, { ...partner, displayName: 'Lex' }])
    await directory.load()

    expect(directory.partnerName()).toBe('Lex')
  })

  it('test_a_household_of_one_has_no_partner', async () => {
    const directory = setup([you])
    await directory.load()

    expect(directory.partner()).toBeNull()
    expect(directory.partnerName()).toBe('')
  })

  it('test_people_map_to_person_marks', async () => {
    const directory = setup([you, partner])
    await directory.load()

    expect(directory.personOf(1)).toBe('a')
    expect(directory.personOf(2)).toBe('b')
    expect(directory.personOf(null)).toBe('joint')
  })

  it('test_categories_of_a_kind_skip_hidden_ones_and_keep_the_order', async () => {
    const directory = setup(
      [you],
      [
        aGroup({ id: 1 }, [
          aCategory({ id: 10, name: 'Groceries' }),
          aCategory({ id: 11, name: 'Old', isHidden: true }),
        ]),
        aGroup({ id: 3, isHidden: true }, [aCategory({ id: 30, categoryGroupId: 3 })]),
        aGroup({ id: 9, kind: 'income' }, [aCategory({ id: 90, categoryGroupId: 9 })]),
      ]
    )
    await directory.load()

    expect(directory.categoriesOf('expense').map((entry) => entry.category.id)).toEqual([10])
    expect(directory.categoriesOf('income').map((entry) => entry.category.id)).toEqual([90])
    expect(directory.category(10)?.group.id).toBe(1)
  })

  it('test_logout_forgets_the_household', async () => {
    const directory = setup([you, partner])
    await directory.load()

    for (const hook of clearHooks) hook()

    expect(directory.status()).toBe('idle')
    expect(directory.accounts()).toEqual([])
  })
})
